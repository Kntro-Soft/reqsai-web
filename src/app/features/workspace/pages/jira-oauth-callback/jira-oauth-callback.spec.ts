import { describe, expect, it } from 'vitest';
import { convertToParamMap } from '@angular/router';
import { parseJiraOAuthParams } from './jira-oauth-callback';

describe('parseJiraOAuthParams', () => {
  it('reads code and state from the redirect', () => {
    const params = parseJiraOAuthParams(
      convertToParamMap({ code: 'auth-code', state: 'signed-state' }),
    );
    expect(params).toEqual({ code: 'auth-code', state: 'signed-state', error: null });
  });

  it('surfaces a provider error', () => {
    const params = parseJiraOAuthParams(convertToParamMap({ error: 'access_denied' }));
    expect(params.error).toBe('access_denied');
    expect(params.code).toBeNull();
  });

  it('normalizes blank/whitespace params to null', () => {
    const params = parseJiraOAuthParams(convertToParamMap({ code: '   ', state: '' }));
    expect(params).toEqual({ code: null, state: null, error: null });
  });

  it('is all-null when no params are present', () => {
    expect(parseJiraOAuthParams(convertToParamMap({}))).toEqual({
      code: null,
      state: null,
      error: null,
    });
  });
});
