import { isCaptureDismissed, supportsMeetingAudio } from './audio-source';

/** A navigator stub: optional getDisplayMedia and optional UA Client Hints. */
function fakeNavigator(options: {
  displayMedia?: boolean;
  brands?: string[];
  mobile?: boolean;
  mediaDevices?: boolean;
}): Navigator {
  const { displayMedia = true, brands, mobile = false, mediaDevices = true } = options;
  return {
    mediaDevices: mediaDevices
      ? { getDisplayMedia: displayMedia ? () => Promise.resolve() : undefined }
      : undefined,
    userAgentData: brands ? { brands: brands.map((brand) => ({ brand })), mobile } : undefined,
  } as unknown as Navigator;
}

describe('supportsMeetingAudio', () => {
  it('is available on desktop Chrome and Edge', () => {
    expect(
      supportsMeetingAudio(fakeNavigator({ brands: ['Chromium', 'Google Chrome', 'Not.A/Brand'] })),
    ).toBe(true);
    expect(supportsMeetingAudio(fakeNavigator({ brands: ['Chromium', 'Microsoft Edge'] }))).toBe(
      true,
    );
  });

  it('is unavailable on Firefox and Safari (no UA Client Hints, no display audio)', () => {
    expect(supportsMeetingAudio(fakeNavigator({}))).toBe(false);
  });

  it('is unavailable on mobile Chromium', () => {
    expect(
      supportsMeetingAudio(fakeNavigator({ brands: ['Chromium', 'Google Chrome'], mobile: true })),
    ).toBe(false);
  });

  it('is unavailable without getDisplayMedia or mediaDevices', () => {
    expect(supportsMeetingAudio(fakeNavigator({ brands: ['Chromium'], displayMedia: false }))).toBe(
      false,
    );
    expect(supportsMeetingAudio(fakeNavigator({ brands: ['Chromium'], mediaDevices: false }))).toBe(
      false,
    );
  });

  it('is unavailable on non-Chromium engines exposing client hints', () => {
    expect(supportsMeetingAudio(fakeNavigator({ brands: ['SomeOtherEngine'] }))).toBe(false);
  });
});

describe('isCaptureDismissed', () => {
  it('treats a closed picker or a denied prompt as a dismissal', () => {
    expect(isCaptureDismissed(new DOMException('Permission denied', 'NotAllowedError'))).toBe(true);
    expect(isCaptureDismissed(new DOMException('Aborted', 'AbortError'))).toBe(true);
  });

  it('reports real failures', () => {
    expect(isCaptureDismissed(new DOMException('Busy', 'NotReadableError'))).toBe(false);
    expect(isCaptureDismissed(new TypeError('bad constraints'))).toBe(false);
    expect(isCaptureDismissed(null)).toBe(false);
  });
});
