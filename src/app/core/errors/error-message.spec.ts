import { HttpErrorResponse } from '@angular/common/http';
import { TranslocoService } from '@jsverse/transloco';
import { describe, expect, it } from 'vitest';
import { messageForError } from './error-message';

/**
 * A minimal fake TranslocoService: `translate(key)` returns the dictionary value
 * or echoes the key back when missing — exactly how the real Transloco behaves,
 * which is what `messageForError`'s existence probe relies on.
 */
function fakeTransloco(dict: Record<string, string>): TranslocoService {
  return {
    translate: (key: string) => dict[key] ?? key,
  } as unknown as TranslocoService;
}

const DICT: Record<string, string> = {
  'errors.PROJECT_ROLE_IN_USE': 'That role is still assigned to members.',
  'errors.http.409': 'That conflicts with something that already exists.',
  'errors.http.500': 'Something went wrong on our end.',
  'errors.network': 'You appear to be offline.',
  'errors.generic': 'Something went wrong. Please try again.',
};

function httpError(status: number, body?: unknown): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: body });
}

describe('messageForError', () => {
  const transloco = fakeTransloco(DICT);

  it('returns the per-code message when errors.<code> exists', () => {
    const err = httpError(409, { code: 'PROJECT_ROLE_IN_USE' });
    expect(messageForError(err, transloco)).toBe('That role is still assigned to members.');
  });

  it('falls back to the status tier when the code has no translation', () => {
    const err = httpError(409, { code: 'SOME_UNMAPPED_CODE' });
    expect(messageForError(err, transloco)).toBe(DICT['errors.http.409']);
  });

  it('falls back to the 409 tier for an untranslated conflict code (e.g. auth/discovery)', () => {
    // Codes like SESSION_ALREADY_ACTIVE / ACCOUNT_ALREADY_EXISTS are not in the
    // central block, so a page routing its generic branch here gets the status tier.
    const err = httpError(409, { code: 'SESSION_ALREADY_ACTIVE' });
    expect(messageForError(err, transloco)).toBe(DICT['errors.http.409']);
  });

  it('falls back to the status tier when there is no code at all', () => {
    const err = httpError(500, {});
    expect(messageForError(err, transloco)).toBe(DICT['errors.http.500']);
  });

  it('returns the network message for status 0', () => {
    const err = httpError(0, null);
    expect(messageForError(err, transloco)).toBe(DICT['errors.network']);
  });

  it('prefers network over a code when status is 0', () => {
    // A status-0 response never carries a meaningful code; network wins.
    const err = httpError(0, { code: 'PROJECT_ROLE_IN_USE' });
    expect(messageForError(err, transloco)).toBe(DICT['errors.network']);
  });

  it('returns generic for an unknown / unauthored status', () => {
    const err = httpError(418, {});
    expect(messageForError(err, transloco)).toBe(DICT['errors.generic']);
  });

  it('returns generic for a non-HttpErrorResponse error', () => {
    expect(messageForError(new Error('boom'), transloco)).toBe(DICT['errors.generic']);
    expect(messageForError('just a string', transloco)).toBe(DICT['errors.generic']);
    expect(messageForError(null, transloco)).toBe(DICT['errors.generic']);
  });
});
