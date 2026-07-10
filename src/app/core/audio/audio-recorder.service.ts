import { Injectable, inject, signal } from '@angular/core';
import { AuthStore } from '../auth/auth.store';
import { environment } from '../../../environments/environment';

/** Number of bars exposed by the live input-level meter. */
const LEVEL_BARS = 12;
/** How often the level meter refreshes (ms) — cheap enough to leave running. */
const LEVEL_INTERVAL_MS = 100;

/**
 * Handles browser microphone recording, Web Audio downsampling to 16kHz 16-bit Mono PCM,
 * and real-time binary WebSocket streaming to the backend STT endpoint `/ws/stt`.
 *
 * `error` holds an i18n key (`discovery.rec.*`) — the UI translates it, so this
 * service stays locale-agnostic. `levels` is a small AnalyserNode-driven input
 * meter (0..1 per bar) for a real waveform while streaming.
 */
@Injectable({ providedIn: 'root' })
export class AudioRecorderService {
  private readonly auth = inject(AuthStore);

  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private audioWorkletNode: AudioWorkletNode | null = null;
  private analyser: AnalyserNode | null = null;
  private levelTimer: ReturnType<typeof setInterval> | null = null;
  private webSocket: WebSocket | null = null;
  private pcmBufferAccumulator: number[] = [];

  /** i18n key of the current error, or null. */
  readonly error = signal<string | null>(null);
  readonly streaming = signal(false);
  /** Live input levels (0..1 per bar); empty while not streaming. */
  readonly levels = signal<readonly number[]>([]);

  /**
   * Request microphone permission. Returns true if granted.
   */
  async requestPermission(): Promise<boolean> {
    try {
      this.error.set(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Store the stream so we can reuse or stop it.
      this.mediaStream = stream;
      return true;
    } catch (err) {
      console.error('Microphone permission denied/failed:', err);
      this.error.set('discovery.rec.micDenied');
      return false;
    }
  }

  /**
   * Connects to `/ws/stt` and begins downsampling and streaming microphone input.
   */
  async startStreaming(sessionId: string): Promise<void> {
    this.stopStreaming();
    this.error.set(null);

    const token = this.auth.accessToken();
    if (!token) {
      this.error.set('discovery.rec.invalidUserSession');
      return;
    }

    try {
      // Ensure microphone access has been requested
      if (!this.mediaStream) {
        const granted = await this.requestPermission();
        if (!granted) return;
      }

      const url = sttUrl(sessionId, token);
      this.webSocket = new WebSocket(url);
      this.webSocket.binaryType = 'arraybuffer';

      this.webSocket.onopen = () => {
        this.streaming.set(true);
        void this.startAudioProcessing();
      };

      this.webSocket.onerror = (e) => {
        console.error('STT WebSocket error:', e);
        this.error.set('discovery.rec.wsError');
        this.stopStreaming();
      };

      this.webSocket.onclose = (event) => {
        this.streaming.set(false);
        if (event.code !== 1000 && event.code !== 1005) {
          console.warn(`STT WebSocket closed abnormally: ${event.code} (${event.reason})`);
          this.error.set('discovery.rec.wsClosed');
        }
        this.stopStreaming();
      };
    } catch (err) {
      console.error('Failed to start streaming:', err);
      this.error.set('discovery.rec.initFailed');
      this.stopStreaming();
    }
  }

  /**
   * Stops recording, releases the microphone, and closes the WebSocket connection.
   */
  stopStreaming(): void {
    this.streaming.set(false);

    if (this.levelTimer !== null) {
      clearInterval(this.levelTimer);
      this.levelTimer = null;
    }
    this.analyser = null;
    this.levels.set([]);

    if (this.audioWorkletNode) {
      this.audioWorkletNode.disconnect();
      this.audioWorkletNode.port.onmessage = null;
      this.audioWorkletNode = null;
    }

    if (this.audioContext) {
      if (this.audioContext.state !== 'closed') {
        void this.audioContext.close();
      }
      this.audioContext = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.webSocket) {
      // Flush the sub-chunk tail (< CHUNK_SIZE samples) before closing, so the last
      // ~100ms of speech — often the end of the final sentence — reaches the STT.
      if (this.webSocket.readyState === WebSocket.OPEN && this.pcmBufferAccumulator.length > 0) {
        const tail = this.pcmBufferAccumulator;
        const buffer = new ArrayBuffer(tail.length * 2);
        const view = new DataView(buffer);
        for (let i = 0; i < tail.length; i++) {
          view.setInt16(i * 2, tail[i], true); // little-endian
        }
        this.webSocket.send(buffer);
      }
      if (
        this.webSocket.readyState === WebSocket.OPEN ||
        this.webSocket.readyState === WebSocket.CONNECTING
      ) {
        this.webSocket.close(1000, 'Stopped by client');
      }
      this.webSocket = null;
    }

    this.pcmBufferAccumulator = [];
  }

  private async startAudioProcessing(): Promise<void> {
    if (!this.mediaStream) return;

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as Window & { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.audioContext = new AudioCtx();
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Small analyser tap for the UI level meter (real waveform, no fakery).
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 64;
      source.connect(this.analyser);
      this.startLevelMeter();

      // Define AudioWorklet inline to keep code self-contained and run on audio thread
      const workletCode = `
        class AudioProcessor extends AudioWorkletProcessor {
          process(inputs) {
            const input = inputs[0];
            if (input && input[0]) {
              this.port.postMessage(input[0]);
            }
            return true;
          }
        }
        registerProcessor('audio-processor', AudioProcessor);
      `;

      const blob = new Blob([workletCode], { type: 'application/javascript' });
      const blobURL = URL.createObjectURL(blob);
      await this.audioContext.audioWorklet.addModule(blobURL);
      URL.revokeObjectURL(blobURL);

      this.audioWorkletNode = new AudioWorkletNode(this.audioContext, 'audio-processor');
      source.connect(this.audioWorkletNode);
      this.audioWorkletNode.connect(this.audioContext.destination);

      const inRate = this.audioContext.sampleRate;
      const outRate = 16000;
      const CHUNK_SIZE = 2048; // 2048 samples = 4096 bytes (since 1 sample is 2 bytes/16-bit)

      this.audioWorkletNode.port.onmessage = (e) => {
        if (!this.streaming() || !this.webSocket || this.webSocket.readyState !== WebSocket.OPEN) {
          return;
        }

        const inputData = e.data as Float32Array; // Float32 samples sent from audio worklet
        const downsampled = downsample(inputData, inRate, outRate);

        // Convert Float32 -> Int16 and accumulate
        for (const sample of downsampled) {
          const s = Math.max(-1, Math.min(1, sample));
          const val = s < 0 ? s * 0x8000 : s * 0x7fff;
          this.pcmBufferAccumulator.push(val);
        }

        // Send only in chunks of 4096 bytes (2048 samples)
        while (this.pcmBufferAccumulator.length >= CHUNK_SIZE) {
          const chunk = this.pcmBufferAccumulator.splice(0, CHUNK_SIZE);
          const buffer = new ArrayBuffer(CHUNK_SIZE * 2);
          const view = new DataView(buffer);
          for (let i = 0; i < CHUNK_SIZE; i++) {
            view.setInt16(i * 2, chunk[i], true); // little-endian
          }
          this.webSocket.send(buffer);
        }
      };
    } catch (err) {
      console.error('Audio processing initialization failed:', err);
      this.error.set('discovery.rec.audioInitFailed');
      this.stopStreaming();
    }
  }

  /** Publishes ~10 fps of averaged frequency bins while the analyser is alive. */
  private startLevelMeter(): void {
    if (this.levelTimer !== null) clearInterval(this.levelTimer);
    const data = new Uint8Array(this.analyser?.frequencyBinCount ?? 0);
    this.levelTimer = setInterval(() => {
      const analyser = this.analyser;
      if (!analyser) return;
      analyser.getByteFrequencyData(data);
      const binsPerBar = Math.max(1, Math.floor(data.length / LEVEL_BARS));
      const bars: number[] = [];
      for (let bar = 0; bar < LEVEL_BARS; bar++) {
        let sum = 0;
        for (let i = 0; i < binsPerBar; i++) sum += data[bar * binsPerBar + i] ?? 0;
        bars.push(sum / binsPerBar / 255);
      }
      this.levels.set(bars);
    }, LEVEL_INTERVAL_MS);
  }
}

function sttUrl(sessionId: string, token: string): string {
  const base =
    environment.wsUrl || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
  // ws://host/ws/stt?session=UUID&token=JWT
  return `${base.replace(/^http/, 'ws')}/ws/stt?session=${sessionId}&token=${token}`;
}

function downsample(buffer: Float32Array, inRate: number, outRate: number): Float32Array {
  if (inRate === outRate) return buffer;
  const sampleRateRatio = inRate / outRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}
