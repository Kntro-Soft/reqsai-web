import { HttpErrorResponse } from '@angular/common/http';
import { aiQuotaError, atLeast, isQuotaWarning, levelOf, percentOf } from './ai-quota';

describe('levelOf', () => {
  it('steps at 80, 90 and 100 percent', () => {
    expect(levelOf(0, 100_000)).toBe('NONE');
    expect(levelOf(79_999, 100_000)).toBe('NONE');
    expect(levelOf(80_000, 100_000)).toBe('WARNING_80');
    expect(levelOf(90_000, 100_000)).toBe('WARNING_90');
    expect(levelOf(99_999, 100_000)).toBe('WARNING_90');
    expect(levelOf(100_000, 100_000)).toBe('EXHAUSTED');
    expect(levelOf(250_000, 100_000)).toBe('EXHAUSTED');
  });

  it('never warns without an allowance', () => {
    expect(levelOf(10, 0)).toBe('NONE');
  });
});

describe('atLeast / percentOf', () => {
  it('orders the levels', () => {
    expect(atLeast('EXHAUSTED', 'WARNING_90')).toBe(true);
    expect(atLeast('WARNING_80', 'WARNING_90')).toBe(false);
    expect(atLeast('WARNING_90', 'WARNING_90')).toBe(true);
  });

  it('maps a level to its percentage', () => {
    expect(percentOf('WARNING_80')).toBe(80);
    expect(percentOf('EXHAUSTED')).toBe(100);
  });
});

describe('aiQuotaError', () => {
  const response = (status: number, body: unknown) =>
    new HttpErrorResponse({ status, error: body });

  it('reads the allowance out of a 402 AI_QUOTA_EXCEEDED', () => {
    const err = response(402, {
      code: 'AI_QUOTA_EXCEEDED',
      plan: 'FREE',
      limit: 100000,
      used: 100120,
      resetsAt: '2026-11-01T00:00:00Z',
    });
    expect(aiQuotaError(err)).toEqual({
      plan: 'FREE',
      limit: 100000,
      used: 100120,
      resetsAt: '2026-11-01T00:00:00Z',
    });
  });

  it('ignores any other error', () => {
    expect(aiQuotaError(response(402, { code: 'OTHER' }))).toBeNull();
    expect(aiQuotaError(response(500, { code: 'AI_QUOTA_EXCEEDED' }))).toBeNull();
    expect(aiQuotaError(response(402, null))).toBeNull();
    expect(aiQuotaError(new Error('x'))).toBeNull();
  });
});

describe('isQuotaWarning', () => {
  it('accepts the pushed message and rejects anything else', () => {
    expect(
      isQuotaWarning({
        type: 'TOKEN_QUOTA_WARNING',
        level: 'WARNING_90',
        tokensUsed: 9,
        tokensLimit: 10,
      }),
    ).toBe(true);
    expect(
      isQuotaWarning({
        type: 'TOKEN_QUOTA_WARNING',
        level: 'BOGUS',
        tokensUsed: 9,
        tokensLimit: 10,
      }),
    ).toBe(false);
    expect(isQuotaWarning({ type: 'PRESENCE_STATE' })).toBe(false);
    expect(isQuotaWarning(null)).toBe(false);
  });
});
