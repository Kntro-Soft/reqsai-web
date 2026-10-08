/**
 * Pure rules for uploading a past meeting's recording (US41), kept free of Angular so they are
 * unit-testable.
 */

/** Largest recording the API accepts (`spring.servlet.multipart.max-file-size`). */
export const MAX_RECORDING_BYTES = 50 * 1024 * 1024;

/** File extensions the speech-to-text providers read. */
export const RECORDING_EXTENSIONS = [
  'mp3',
  'wav',
  'm4a',
  'ogg',
  'webm',
  'mp4',
  'aac',
  'flac',
] as const;

/** The `accept` attribute of the file picker. */
export const RECORDING_ACCEPT = ['audio/*', ...RECORDING_EXTENSIONS.map((e) => `.${e}`)].join(',');

/** Why a file cannot be uploaded, or null when it can. */
export type RecordingProblem = 'type' | 'size' | 'empty';

export function recordingProblem(file: {
  name: string;
  size: number;
  type: string;
}): RecordingProblem | null {
  const extension = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
  const audio =
    file.type.startsWith('audio/') ||
    (RECORDING_EXTENSIONS as readonly string[]).includes(extension);
  if (!audio) return 'type';
  if (file.size === 0) return 'empty';
  if (file.size > MAX_RECORDING_BYTES) return 'size';
  return null;
}

/** A session title from the file name: no extension, separators as spaces, capped at 120 chars. */
export function titleFromFileName(name: string): string {
  const base = name
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (base || 'Grabación').slice(0, 120);
}
