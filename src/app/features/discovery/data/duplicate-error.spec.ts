import { HttpErrorResponse } from '@angular/common/http';
import { duplicateStorySimilarityPercent, isConflict, problemCode } from './duplicate-error';

function conflict(body: unknown): HttpErrorResponse {
  return new HttpErrorResponse({ status: 409, error: body });
}

describe('duplicate-error', () => {
  describe('isConflict', () => {
    it('is true for a 409 HttpErrorResponse', () => {
      expect(isConflict(conflict({}))).toBe(true);
    });

    it('is false for a non-409 status', () => {
      expect(isConflict(new HttpErrorResponse({ status: 422 }))).toBe(false);
    });

    it('is false for a non-HttpErrorResponse value', () => {
      expect(isConflict(new Error('boom'))).toBe(false);
      expect(isConflict(null)).toBe(false);
    });
  });

  describe('problemCode', () => {
    it('reads the ProblemDetail code', () => {
      expect(problemCode(conflict({ code: 'DUPLICATE_USER_STORY' }))).toBe('DUPLICATE_USER_STORY');
    });

    it('returns null when there is no code', () => {
      expect(problemCode(conflict({ detail: 'x' }))).toBeNull();
      expect(problemCode(new Error('boom'))).toBeNull();
    });
  });

  describe('duplicateStorySimilarityPercent', () => {
    it('parses the 0..1 similarity into a whole percentage', () => {
      const err = conflict({
        code: 'DUPLICATE_USER_STORY',
        detail: 'A near-duplicate user story already exists (similarity 0.87)',
      });
      expect(duplicateStorySimilarityPercent(err)).toBe(87);
    });

    it('rounds to the nearest percent', () => {
      const err = conflict({ detail: 'exists (similarity 0.876)' });
      expect(duplicateStorySimilarityPercent(err)).toBe(88);
    });

    it('handles a similarity of 1', () => {
      const err = conflict({ detail: 'exists (similarity 1.00)' });
      expect(duplicateStorySimilarityPercent(err)).toBe(100);
    });

    it('returns null when the detail has no similarity token', () => {
      expect(duplicateStorySimilarityPercent(conflict({ detail: 'already exists' }))).toBeNull();
    });

    it('returns null when the error is not a 409', () => {
      const err = new HttpErrorResponse({
        status: 422,
        error: { detail: 'similarity 0.9' },
      });
      expect(duplicateStorySimilarityPercent(err)).toBeNull();
    });
  });
});
