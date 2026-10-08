import { describe, expect, it } from 'vitest';
import { MAX_RECORDING_BYTES, recordingProblem, titleFromFileName } from './recording-upload';

describe('recordingProblem', () => {
  it('accepts an audio file by MIME type or by extension', () => {
    expect(recordingProblem({ name: 'reunion.mp3', size: 1000, type: 'audio/mpeg' })).toBeNull();
    expect(recordingProblem({ name: 'reunion.M4A', size: 1000, type: '' })).toBeNull();
  });

  it('rejects a file that is not audio', () => {
    expect(recordingProblem({ name: 'acta.pdf', size: 1000, type: 'application/pdf' })).toBe(
      'type',
    );
  });

  it('rejects an empty file and one over the size limit', () => {
    expect(recordingProblem({ name: 'a.wav', size: 0, type: 'audio/wav' })).toBe('empty');
    expect(
      recordingProblem({ name: 'a.wav', size: MAX_RECORDING_BYTES + 1, type: 'audio/wav' }),
    ).toBe('size');
  });
});

describe('titleFromFileName', () => {
  it('drops the extension and turns separators into spaces', () => {
    expect(titleFromFileName('kickoff_cliente-restaurante.mp3')).toBe(
      'kickoff cliente restaurante',
    );
  });

  it('falls back to a default when nothing is left', () => {
    expect(titleFromFileName('.mp3')).toBe('Grabación');
  });
});
