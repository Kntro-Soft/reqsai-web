/**
 * Where the recorder takes its audio from: `mic` for face-to-face meetings, or
 * `meeting` for virtual calls (Zoom / Meet / Teams), which mixes the microphone
 * with the audio of a shared tab, window or screen.
 */
export type AudioSource = 'mic' | 'meeting';

/** Chrome's `suppressLocalAudioPlayback` audio constraint (not in lib.dom yet). */
interface DisplayAudioConstraints extends MediaTrackConstraints {
  suppressLocalAudioPlayback?: boolean;
}

/** Chrome's display-capture extensions on top of the standard options (not in lib.dom yet). */
interface MeetingDisplayMediaOptions extends Omit<DisplayMediaStreamOptions, 'audio'> {
  audio: DisplayAudioConstraints;
  systemAudio?: 'include' | 'exclude';
  windowAudio?: 'exclude' | 'window' | 'system';
  selfBrowserSurface?: 'include' | 'exclude';
  surfaceSwitching?: 'include' | 'exclude';
}

/** User-Agent Client Hints, exposed by Chromium-based browsers only (not in lib.dom yet). */
interface NavigatorUAData {
  readonly brands: readonly { readonly brand: string }[];
  readonly mobile: boolean;
}

/**
 * The screen-share picker request for meeting audio. Chrome rejects audio-only
 * requests, so `video` stays true (the recorder stops that track right away).
 * The meeting audio is already clean digital audio, so the voice-call
 * processing is disabled; the tab keeps playing locally so the analyst still
 * hears the call. ReqsAI's own tab is hidden from the picker.
 */
export const MEETING_DISPLAY_MEDIA_OPTIONS: MeetingDisplayMediaOptions = {
  video: true,
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    suppressLocalAudioPlayback: false,
  },
  systemAudio: 'include',
  windowAudio: 'system',
  selfBrowserSurface: 'exclude',
  surfaceSwitching: 'include',
};

/**
 * True when this browser can capture a meeting's audio through the screen-share
 * picker: desktop Chromium (Chrome, Edge…). Firefox and Safari implement
 * `getDisplayMedia` without tab/system audio, and mobile browsers lack it, so
 * the "virtual meeting" source is offered on desktop Chromium only.
 */
export function supportsMeetingAudio(nav: Navigator | undefined = globalThis.navigator): boolean {
  if (typeof nav?.mediaDevices?.getDisplayMedia !== 'function') return false;
  const uaData = (nav as Navigator & { userAgentData?: NavigatorUAData }).userAgentData;
  if (!uaData || uaData.mobile) return false;
  return uaData.brands.some((b) => b.brand === 'Chromium');
}

/**
 * True when a capture request failed because the user dismissed the picker or
 * the permission prompt (`NotAllowedError`, or `AbortError` in some browsers),
 * as opposed to a real failure worth reporting.
 */
export function isCaptureDismissed(err: unknown): boolean {
  return (
    err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'AbortError')
  );
}
