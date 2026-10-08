import { audioSourceStorageKey, resolveAudioSource } from './audio-source-preference';

describe('audioSourceStorageKey', () => {
  it('scopes the key per user', () => {
    expect(audioSourceStorageKey('user-1')).toBe('reqsai.discovery.audioSource.user-1');
    expect(audioSourceStorageKey('user-2')).not.toBe(audioSourceStorageKey('user-1'));
  });
});

describe('resolveAudioSource', () => {
  it('restores a stored virtual-meeting choice where meeting audio is supported', () => {
    expect(resolveAudioSource('meeting', true)).toBe('meeting');
  });

  it('falls back to the microphone where meeting audio is unsupported', () => {
    expect(resolveAudioSource('meeting', false)).toBe('mic');
  });

  it('defaults to the microphone when nothing valid is stored', () => {
    expect(resolveAudioSource(null, true)).toBe('mic');
    expect(resolveAudioSource(undefined, true)).toBe('mic');
    expect(resolveAudioSource('mic', true)).toBe('mic');
    expect(resolveAudioSource('screen', true)).toBe('mic');
  });
});
