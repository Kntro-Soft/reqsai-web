import { TranslocoService } from '@jsverse/transloco';
import { describe, expect, it } from 'vitest';
import { jobFailureMessage } from './integration-jobs-banner';

/**
 * A minimal fake TranslocoService: `translate(key)` returns the dictionary value
 * or echoes the key back when missing — exactly how the real Transloco behaves,
 * which is what `jobFailureMessage`'s existence probe relies on.
 */
function fakeTransloco(dict: Record<string, string>): TranslocoService {
  return {
    translate: (key: string) => dict[key] ?? key,
  } as unknown as TranslocoService;
}

const DICT: Record<string, string> = {
  'errors.JIRA_UNREACHABLE': "We couldn't reach Jira.",
  'integrations.jobs.failed': 'The Jira job failed.',
};

describe('jobFailureMessage', () => {
  const transloco = fakeTransloco(DICT);

  it('translates a message that is a known backend error code', () => {
    expect(jobFailureMessage({ message: 'JIRA_UNREACHABLE' }, transloco)).toBe(
      "We couldn't reach Jira.",
    );
  });

  it('shows a human-readable backend message verbatim', () => {
    expect(jobFailureMessage({ message: 'Sprint board is archived.' }, transloco)).toBe(
      'Sprint board is archived.',
    );
  });

  it('falls back to the generic failure message when message is null', () => {
    expect(jobFailureMessage({ message: null }, transloco)).toBe('The Jira job failed.');
  });

  it('falls back to the generic failure message for a blank message', () => {
    expect(jobFailureMessage({ message: '   ' }, transloco)).toBe('The Jira job failed.');
  });
});
