import { TestBed } from '@angular/core/testing';
import { MockInstance, vi } from 'vitest';
import { AuthStore } from '../auth/auth.store';
import { AuthResponse } from '../auth/auth.model';
import { AudioRecorderService } from './audio-recorder.service';

/** A capture track double: `stop()` is observable and `ended` can be dispatched. */
class FakeTrack extends EventTarget {
  readyState: MediaStreamTrackState = 'live';
  readonly stop = vi.fn(() => {
    this.readyState = 'ended';
  });

  constructor(readonly kind: 'audio' | 'video') {
    super();
  }
}

function fakeStream(...tracks: FakeTrack[]): MediaStream {
  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
    getVideoTracks: () => tracks.filter((t) => t.kind === 'video'),
  } as unknown as MediaStream;
}

/** The share picker result: a live audio + video pair, as Chrome returns for "Share tab audio". */
function sharedTab(): { stream: MediaStream; audio: FakeTrack; video: FakeTrack } {
  const audio = new FakeTrack('audio');
  const video = new FakeTrack('video');
  return { stream: fakeStream(video, audio), audio, video };
}

function micStream(): { stream: MediaStream; track: FakeTrack } {
  const track = new FakeTrack('audio');
  return { stream: fakeStream(track), track };
}

describe('AudioRecorderService — audio sources', () => {
  let recorder: AudioRecorderService;
  let getDisplayMedia: MockInstance<MediaDevices['getDisplayMedia']>;
  let getUserMedia: MockInstance<MediaDevices['getUserMedia']>;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    recorder = TestBed.inject(AudioRecorderService);
    // Never reach the real devices: each test scripts what the browser answers.
    getDisplayMedia = vi
      .spyOn(navigator.mediaDevices, 'getDisplayMedia')
      .mockRejectedValue(new Error('unscripted getDisplayMedia'));
    getUserMedia = vi
      .spyOn(navigator.mediaDevices, 'getUserMedia')
      .mockRejectedValue(new Error('unscripted getUserMedia'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    recorder.stopStreaming();
    vi.restoreAllMocks();
  });

  describe('in person (microphone)', () => {
    it('captures the microphone only', async () => {
      getUserMedia.mockResolvedValue(micStream().stream);

      expect(await recorder.requestPermission('mic')).toBe(true);

      expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
      expect(getDisplayMedia).not.toHaveBeenCalled();
      expect(recorder.source()).toBe('mic');
      expect(recorder.meetingAudio()).toBe(false);
    });

    it('defaults to the microphone', async () => {
      getUserMedia.mockResolvedValue(micStream().stream);

      expect(await recorder.requestPermission()).toBe(true);

      expect(getDisplayMedia).not.toHaveBeenCalled();
      expect(recorder.source()).toBe('mic');
    });
  });

  describe('virtual meeting (microphone + meeting audio)', () => {
    it('opens the share picker synchronously, before the microphone, to keep the click activation', async () => {
      const tab = sharedTab();
      getDisplayMedia.mockResolvedValue(tab.stream);
      getUserMedia.mockResolvedValue(micStream().stream);

      const pending = recorder.requestPermission('meeting');
      // No await has happened yet: the picker must already be requested.
      expect(getDisplayMedia).toHaveBeenCalledTimes(1);
      expect(getUserMedia).not.toHaveBeenCalled();

      expect(await pending).toBe(true);
      expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
      expect(getDisplayMedia.mock.invocationCallOrder[0]).toBeLessThan(
        getUserMedia.mock.invocationCallOrder[0],
      );
    });

    it('asks for unprocessed system/tab audio, hides its own tab and allows switching', async () => {
      getDisplayMedia.mockResolvedValue(sharedTab().stream);
      getUserMedia.mockResolvedValue(micStream().stream);

      await recorder.requestPermission('meeting');

      expect(getDisplayMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          video: true,
          audio: expect.objectContaining({
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          }),
          systemAudio: 'include',
          selfBrowserSurface: 'exclude',
          surfaceSwitching: 'include',
        }),
      );
    });

    it('keeps the meeting audio and drops the unused video track', async () => {
      const tab = sharedTab();
      getDisplayMedia.mockResolvedValue(tab.stream);
      getUserMedia.mockResolvedValue(micStream().stream);

      expect(await recorder.requestPermission('meeting')).toBe(true);

      expect(tab.video.stop).toHaveBeenCalled();
      expect(tab.audio.stop).not.toHaveBeenCalled();
      expect(recorder.source()).toBe('meeting');
      expect(recorder.meetingAudio()).toBe(true);
      expect(recorder.error()).toBeNull();
      expect(recorder.notice()).toBeNull();
    });

    it('warns and does not start when the user shared without ticking "Share tab audio"', async () => {
      const video = new FakeTrack('video');
      getDisplayMedia.mockResolvedValue(fakeStream(video));

      expect(await recorder.requestPermission('meeting')).toBe(false);

      expect(video.stop).toHaveBeenCalled();
      expect(getUserMedia).not.toHaveBeenCalled();
      expect(recorder.notice()).toBe('discovery.rec.noMeetingAudio');
      expect(recorder.error()).toBeNull();
      expect(recorder.meetingAudio()).toBe(false);
      expect(recorder.source()).toBe('mic');
    });

    it.each(['NotAllowedError', 'AbortError'])(
      'stays idle without any message when the picker is dismissed (%s)',
      async (name) => {
        getDisplayMedia.mockRejectedValue(new DOMException('dismissed', name));

        expect(await recorder.requestPermission('meeting')).toBe(false);

        expect(getUserMedia).not.toHaveBeenCalled();
        expect(recorder.error()).toBeNull();
        expect(recorder.notice()).toBeNull();
        expect(console.error).not.toHaveBeenCalled();
      },
    );

    it('reports a real capture failure', async () => {
      getDisplayMedia.mockRejectedValue(new DOMException('busy', 'NotReadableError'));

      expect(await recorder.requestPermission('meeting')).toBe(false);

      expect(recorder.error()).toBe('discovery.rec.shareFailed');
      expect(getUserMedia).not.toHaveBeenCalled();
    });

    it('reports an unsupported browser when getDisplayMedia is missing', async () => {
      Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
        value: undefined,
        configurable: true,
      });

      expect(await recorder.requestPermission('meeting')).toBe(false);

      expect(recorder.error()).toBe('discovery.rec.meetingUnsupported');
      expect(getUserMedia).not.toHaveBeenCalled();
    });

    it('releases the shared tab when the microphone is denied', async () => {
      const tab = sharedTab();
      getDisplayMedia.mockResolvedValue(tab.stream);
      getUserMedia.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));

      expect(await recorder.requestPermission('meeting')).toBe(false);

      expect(tab.audio.stop).toHaveBeenCalled();
      expect(recorder.error()).toBe('discovery.rec.micDenied');
      expect(recorder.meetingAudio()).toBe(false);
    });
  });

  describe('"Stop sharing" mid-session', () => {
    it('falls back to the microphone with a notice instead of ending the recording', async () => {
      const tab = sharedTab();
      const mic = micStream();
      getDisplayMedia.mockResolvedValue(tab.stream);
      getUserMedia.mockResolvedValue(mic.stream);
      await recorder.requestPermission('meeting');

      tab.audio.dispatchEvent(new Event('ended'));

      expect(recorder.meetingAudio()).toBe(false);
      expect(recorder.notice()).toBe('discovery.rec.meetingAudioEnded');
      expect(mic.track.stop).not.toHaveBeenCalled();
      // Still a meeting recording: the bar offers to share again.
      expect(recorder.source()).toBe('meeting');
    });

    it('re-shares the meeting audio from the session bar', async () => {
      const first = sharedTab();
      const second = sharedTab();
      getDisplayMedia.mockResolvedValueOnce(first.stream).mockResolvedValueOnce(second.stream);
      getUserMedia.mockResolvedValue(micStream().stream);
      await recorder.requestPermission('meeting');
      first.audio.dispatchEvent(new Event('ended'));

      expect(await recorder.shareMeetingAudio()).toBe(true);

      expect(recorder.meetingAudio()).toBe(true);
      expect(recorder.notice()).toBeNull();
      // A late event from the old share never drops the new one.
      first.audio.dispatchEvent(new Event('ended'));
      expect(recorder.meetingAudio()).toBe(true);
      expect(second.audio.stop).not.toHaveBeenCalled();
    });

    it('keeps the "meeting audio lost" notice when the re-share picker is dismissed', async () => {
      const tab = sharedTab();
      getDisplayMedia
        .mockResolvedValueOnce(tab.stream)
        .mockRejectedValueOnce(new DOMException('dismissed', 'NotAllowedError'));
      getUserMedia.mockResolvedValue(micStream().stream);
      await recorder.requestPermission('meeting');
      tab.audio.dispatchEvent(new Event('ended'));

      expect(await recorder.shareMeetingAudio()).toBe(false);

      expect(recorder.notice()).toBe('discovery.rec.meetingAudioEnded');
      expect(recorder.meetingAudio()).toBe(false);
    });
  });

  describe('pause and stop', () => {
    it('keeps the shared tab across a pause (no picker on resume) but releases the microphone', async () => {
      const tab = sharedTab();
      const mic = micStream();
      getDisplayMedia.mockResolvedValue(tab.stream);
      getUserMedia.mockResolvedValue(mic.stream);
      await recorder.requestPermission('meeting');

      recorder.pauseStreaming();

      expect(mic.track.stop).toHaveBeenCalled();
      expect(tab.audio.stop).not.toHaveBeenCalled();
      expect(recorder.meetingAudio()).toBe(true);
    });

    it('releases everything on stop and returns to the microphone source', async () => {
      const tab = sharedTab();
      const mic = micStream();
      getDisplayMedia.mockResolvedValue(tab.stream);
      getUserMedia.mockResolvedValue(mic.stream);
      await recorder.requestPermission('meeting');
      tab.audio.dispatchEvent(new Event('ended'));

      recorder.stopStreaming();

      expect(mic.track.stop).toHaveBeenCalled();
      expect(tab.audio.stop).toHaveBeenCalled();
      expect(recorder.meetingAudio()).toBe(false);
      expect(recorder.source()).toBe('mic');
      expect(recorder.notice()).toBeNull();
    });
  });
});

/** Minimal `/ws/stt` socket that opens on the next macrotask and records what is sent. */
class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static last: FakeWebSocket | null = null;

  readyState = FakeWebSocket.CONNECTING;
  binaryType = 'blob';
  onopen: (() => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  readonly close = vi.fn(() => {
    this.readyState = FakeWebSocket.CLOSED;
  });

  constructor(readonly url: string) {
    FakeWebSocket.last = this;
    setTimeout(() => {
      this.readyState = FakeWebSocket.OPEN;
      this.onopen?.();
    });
  }

  send(): void {
    // PCM chunks are irrelevant to the graph-wiring assertions.
  }
}

describe('AudioRecorderService — mixing', () => {
  let recorder: AudioRecorderService;
  let toneContext: AudioContext;

  /** A real, silent audio track (the Web Audio graph rejects doubles). */
  function realAudioStream(): MediaStream {
    return toneContext.createMediaStreamDestination().stream;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({});
    TestBed.inject(AuthStore).setSession({
      accessToken: 'token',
      user: { id: 'user-1' },
      organizationId: null,
    } as unknown as AuthResponse);
    recorder = TestBed.inject(AudioRecorderService);
    toneContext = new AudioContext();
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });

  afterEach(async () => {
    recorder.stopStreaming();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    await toneContext.close();
  });

  it('sums the mic and the meeting audio into one mono mixer and keeps the mic when sharing stops', async () => {
    const display = realAudioStream();
    const mic = realAudioStream();
    const displayTrack = display.getAudioTracks()[0];
    vi.spyOn(navigator.mediaDevices, 'getDisplayMedia').mockResolvedValue(display);
    vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockResolvedValue(mic);
    const createGain = vi.spyOn(AudioContext.prototype, 'createGain');
    const createSource = vi.spyOn(AudioContext.prototype, 'createMediaStreamSource');
    const connect = vi.spyOn(AudioNode.prototype, 'connect');
    /** The nodes `from` feeds, in connection order. */
    const targetsOf = (from: AudioNode): unknown[] =>
      connect.mock.calls.filter((_, i) => connect.mock.contexts[i] === from).map(([to]) => to);

    expect(await recorder.requestPermission('meeting')).toBe(true);
    await recorder.startStreaming('sess-1');
    // The worklet is wired last, once its module has loaded.
    await vi.waitFor(() =>
      expect(connect.mock.calls.some(([to]) => to instanceof AudioWorkletNode)).toBe(true),
    );

    const mixer = createGain.mock.results[0].value as GainNode;
    expect(mixer.channelCount).toBe(1);
    expect(mixer.channelCountMode).toBe('explicit');
    expect(mixer.channelInterpretation).toBe('speakers');
    expect(createSource.mock.calls.map(([stream]) => stream)).toEqual([mic, display]);
    for (const { value: source } of createSource.mock.results) {
      expect(targetsOf(source as AudioNode)).toEqual([mixer]);
    }
    // Both the level meter and the PCM worklet read the mix, not a single source.
    const [meter, worklet] = targetsOf(mixer);
    expect(meter).toBeInstanceOf(AnalyserNode);
    expect(worklet).toBeInstanceOf(AudioWorkletNode);

    const displaySource = createSource.mock.results[1].value as MediaStreamAudioSourceNode;
    const disconnect = vi.spyOn(displaySource, 'disconnect');
    displayTrack.dispatchEvent(new Event('ended'));

    expect(disconnect).toHaveBeenCalled();
    expect(recorder.streaming()).toBe(true);
    expect(FakeWebSocket.last?.close).not.toHaveBeenCalled();
    expect(recorder.notice()).toBe('discovery.rec.meetingAudioEnded');
  });
});
