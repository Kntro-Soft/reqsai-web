import { Injectable, inject, signal } from '@angular/core';
import { AuthStore } from '../auth/auth.store';
import { environment } from '../../../environments/environment';
import { AudioSource, MEETING_DISPLAY_MEDIA_OPTIONS, isCaptureDismissed } from './audio-source';

/** Number of bars exposed by the live input-level meter. */
const LEVEL_BARS = 12;
/** How often the level meter refreshes (ms) — cheap enough to leave running. */
const LEVEL_INTERVAL_MS = 100;

/** Outcome of asking the user to share the meeting's tab, window or screen. */
type MeetingShare = 'shared' | 'dismissed' | 'no-audio' | 'unsupported' | 'failed';

/**
 * Handles browser audio capture, Web Audio downsampling to 16kHz 16-bit Mono PCM,
 * and real-time binary WebSocket streaming to the backend STT endpoint `/ws/stt`.
 *
 * Two sources (see {@link AudioSource}): the microphone alone, or — for virtual
 * meetings — the microphone mixed with the audio of a surface shared through
 * the screen-share picker. Both feed one mono mixer, so the backend always gets
 * the same PCM stream. The shared surface survives pauses (resuming never
 * re-opens the picker); if the user stops sharing, the mic keeps streaming.
 *
 * `error` holds an i18n key (`discovery.rec.*`) — the UI translates it, so this
 * service stays locale-agnostic; `notice` is the non-fatal counterpart (e.g.
 * meeting audio lost while the recording carries on). `levels` is a small
 * AnalyserNode-driven input meter (0..1 per bar) of the mix while streaming.
 */
@Injectable({ providedIn: 'root' })
export class AudioRecorderService {
  private readonly auth = inject(AuthStore);

  private micStream: MediaStream | null = null;
  /** The shared meeting surface (its video track already stopped); outlives pauses. */
  private displayStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  /** Mono summing node every source feeds; drives the level meter and the worklet. */
  private mixer: GainNode | null = null;
  private displaySource: MediaStreamAudioSourceNode | null = null;
  private audioWorkletNode: AudioWorkletNode | null = null;
  private analyser: AnalyserNode | null = null;
  private levelTimer: ReturnType<typeof setInterval> | null = null;
  private webSocket: WebSocket | null = null;
  private pcmBufferAccumulator: number[] = [];

  /** i18n key of the current error, or null. */
  readonly error = signal<string | null>(null);
  /** i18n key of a non-fatal warning (the recording, if any, carries on), or null. */
  readonly notice = signal<string | null>(null);
  readonly streaming = signal(false);
  /** Live input levels (0..1 per bar); empty while not streaming. */
  readonly levels = signal<readonly number[]>([]);
  /** Source of the current recording; back to `mic` once it stops. */
  readonly source = signal<AudioSource>('mic');
  /** True while shared meeting audio is held (and mixed in whenever streaming). */
  readonly meetingAudio = signal(false);

  /**
   * Secures the capture for `source` before a recording starts. Returns true if granted.
   * For `meeting` the screen-share picker opens FIRST: it needs the click's transient
   * activation, which any earlier await could use up. The microphone follows.
   */
  async requestPermission(source: AudioSource = 'mic'): Promise<boolean> {
    this.error.set(null);
    this.notice.set(null);
    this.releaseMic();

    if (source === 'meeting') {
      const share = await this.shareDisplay();
      if (share !== 'shared') {
        // Nothing starts: the user stays idle and can retry with one click.
        this.reportShare(share);
        return false;
      }
    } else {
      this.releaseDisplay();
    }

    if (!(await this.acquireMic())) {
      this.releaseDisplay();
      return false;
    }
    this.source.set(source);
    return true;
  }

  /**
   * Re-opens the screen-share picker during a session (e.g. after "Stop sharing")
   * and mixes the new meeting audio into the live recording, or into the next
   * resume while paused. Call it straight from a click handler.
   */
  async shareMeetingAudio(): Promise<boolean> {
    this.error.set(null);
    const share = await this.shareDisplay();
    if (share !== 'shared') {
      this.reportShare(share);
      return false;
    }
    this.notice.set(null);
    this.source.set('meeting');
    return true;
  }

  /**
   * Connects to `/ws/stt` and begins downsampling and streaming the captured audio.
   */
  async startStreaming(sessionId: string): Promise<void> {
    this.stopPipeline();
    this.error.set(null);

    const token = this.auth.accessToken();
    if (!token) {
      this.error.set('discovery.rec.invalidUserSession');
      return;
    }

    try {
      // The mic is released on pause, so a resume re-acquires it (no prompt once granted).
      if (!this.micStream) {
        const granted = await this.acquireMic();
        if (!granted) return;
      }
      if (this.source() === 'meeting' && !this.displayStream) {
        // Sharing ended earlier (e.g. while paused): carry on with the mic only.
        this.notice.set('discovery.rec.meetingAudioEnded');
      }

      const url = sttUrl(sessionId, token);
      this.webSocket = new WebSocket(url);
      this.webSocket.binaryType = 'arraybuffer';

      this.webSocket.onopen = () => {
        this.streaming.set(true);
        void this.startAudioProcessing();
      };

      // Transport failures keep the shared meeting surface, so pause/resume can
      // reconnect without the picker; stopping the session releases it.
      this.webSocket.onerror = (e) => {
        console.error('STT WebSocket error:', e);
        this.error.set('discovery.rec.wsError');
        this.pauseStreaming();
      };

      this.webSocket.onclose = (event) => {
        this.streaming.set(false);
        if (event.code !== 1000 && event.code !== 1005) {
          console.warn(`STT WebSocket closed abnormally: ${event.code} (${event.reason})`);
          this.error.set('discovery.rec.wsClosed');
        }
        this.pauseStreaming();
      };
    } catch (err) {
      console.error('Failed to start streaming:', err);
      this.error.set('discovery.rec.initFailed');
      this.stopStreaming();
    }
  }

  /**
   * Pauses: closes the WebSocket and the audio graph and releases the microphone,
   * but keeps the shared meeting surface so resuming never re-opens the picker.
   */
  pauseStreaming(): void {
    this.stopPipeline();
    this.releaseMic();
  }

  /**
   * Stops recording, releases the microphone and the shared meeting surface,
   * and closes the WebSocket connection.
   */
  stopStreaming(): void {
    this.pauseStreaming();
    this.releaseDisplay();
    this.source.set('mic');
    this.notice.set(null);
  }

  private async acquireMic(): Promise<boolean> {
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      return true;
    } catch (err) {
      console.error('Microphone permission denied/failed:', err);
      this.error.set('discovery.rec.micDenied');
      return false;
    }
  }

  /**
   * Opens the screen-share picker and keeps the chosen surface's audio. Its first
   * await is `getDisplayMedia` itself, so the caller's click activation is intact.
   */
  private async shareDisplay(): Promise<MeetingShare> {
    if (typeof navigator.mediaDevices?.getDisplayMedia !== 'function') return 'unsupported';

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia(MEETING_DISPLAY_MEDIA_OPTIONS);
    } catch (err) {
      if (isCaptureDismissed(err)) return 'dismissed';
      console.error('Meeting audio capture failed:', err);
      return 'failed';
    }

    const [audioTrack] = stream.getAudioTracks();
    if (!audioTrack) {
      // Shared without ticking "Share tab audio" (or a surface that carries none).
      stream.getTracks().forEach((track) => track.stop());
      return 'no-audio';
    }

    // Only the audio is used. Stopping the video track ends the frame capture while
    // the audio track stays live, and "Stop sharing" still ends the audio track.
    stream.getVideoTracks().forEach((track) => track.stop());
    this.releaseDisplay();
    this.displayStream = stream;
    audioTrack.addEventListener('ended', () => this.onMeetingAudioEnded(stream), { once: true });
    this.meetingAudio.set(true);
    this.connectMeetingAudio();
    return 'shared';
  }

  /**
   * Surfaces a failed share. A dismissed picker is the user's own choice, so it
   * reports nothing (and keeps any current notice, e.g. "meeting audio lost").
   */
  private reportShare(share: Exclude<MeetingShare, 'shared'>): void {
    switch (share) {
      case 'dismissed':
        break;
      case 'no-audio':
        this.notice.set('discovery.rec.noMeetingAudio');
        break;
      case 'unsupported':
        this.error.set('discovery.rec.meetingUnsupported');
        break;
      case 'failed':
        this.error.set('discovery.rec.shareFailed');
        break;
    }
  }

  /** "Stop sharing" or the shared tab closing: drop the meeting audio, keep the mic. */
  private onMeetingAudioEnded(stream: MediaStream): void {
    if (this.displayStream !== stream) return;
    this.releaseDisplay();
    this.notice.set('discovery.rec.meetingAudioEnded');
  }

  /** Feeds the held meeting audio into the live mixer (no-op until the graph exists). */
  private connectMeetingAudio(): void {
    if (!this.audioContext || !this.mixer || !this.displayStream || this.displaySource) return;
    this.displaySource = this.audioContext.createMediaStreamSource(this.displayStream);
    this.displaySource.connect(this.mixer);
  }

  private releaseMic(): void {
    this.micStream?.getTracks().forEach((track) => track.stop());
    this.micStream = null;
  }

  private releaseDisplay(): void {
    this.displaySource?.disconnect();
    this.displaySource = null;
    this.displayStream?.getTracks().forEach((track) => track.stop());
    this.displayStream = null;
    this.meetingAudio.set(false);
  }

  /** Tears down the WebSocket and the audio graph, leaving the captured streams alone. */
  private stopPipeline(): void {
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

    this.displaySource = null;
    this.mixer = null;
    if (this.audioContext) {
      if (this.audioContext.state !== 'closed') {
        void this.audioContext.close();
      }
      this.audioContext = null;
    }

    if (this.webSocket) {
      // Detach first: a late close event from this socket must not tear down the next one.
      this.webSocket.onopen = null;
      this.webSocket.onerror = null;
      this.webSocket.onclose = null;
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
    if (!this.micStream) return;

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as Window & { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const context = new AudioCtx();
      this.audioContext = context;

      // Every source sums into one mono mixer; the stereo meeting audio is down-mixed
      // (speakers interpretation) so the rest of the chain sees a single channel.
      const mixer = context.createGain();
      mixer.channelCount = 1;
      mixer.channelCountMode = 'explicit';
      mixer.channelInterpretation = 'speakers';
      this.mixer = mixer;
      context.createMediaStreamSource(this.micStream).connect(mixer);
      this.connectMeetingAudio();

      // Small analyser tap for the UI level meter (real waveform of the mix, no fakery).
      this.analyser = context.createAnalyser();
      this.analyser.fftSize = 64;
      mixer.connect(this.analyser);
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
      await context.audioWorklet.addModule(blobURL);
      URL.revokeObjectURL(blobURL);
      // Paused or stopped while the module loaded: this graph is already torn down.
      if (this.audioContext !== context) return;

      this.audioWorkletNode = new AudioWorkletNode(context, 'audio-processor');
      mixer.connect(this.audioWorkletNode);
      // The processor never writes its output, so this only keeps the node pulled by
      // the render graph: the speakers get silence, never an echo of the mix.
      this.audioWorkletNode.connect(context.destination);

      const inRate = context.sampleRate;
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
