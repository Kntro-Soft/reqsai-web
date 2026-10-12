import {
  VERIFY_TIMEOUT_MS,
  codeBannerKind,
  failVerification,
  hasLines,
  isVerifying,
  lineReferenceLabel,
  safeReferenceUrl,
  startVerifying,
  updateSuggestion,
  verifyStateOf,
  withCodeUpdate,
} from './code-verification';
import { SuggestionCodeInsight } from './codebase.models';
import { SuggestionResponse } from './discovery.models';

function suggestion(code?: SuggestionCodeInsight | null): SuggestionResponse {
  return {
    id: 's1',
    sessionId: 'sess',
    projectId: 'p1',
    type: 'NEW_STORY',
    status: 'PENDING',
    draftTitle: 'Cancelar reserva',
    draftRole: 'comensal',
    draftAction: 'cancelar',
    draftBenefit: 'no perder dinero',
    draftPriority: 'HIGH',
    draftStoryPoints: 3,
    relatedTopic: null,
    targetStoryId: null,
    question: null,
    resolvedStoryId: null,
    createdAt: '2026-10-11T10:00:00Z',
    updatedAt: '2026-10-11T10:00:00Z',
    code,
  } as SuggestionResponse;
}

describe('code verification rules', () => {
  it('shows a banner per deep verdict, and the quick finding without one', () => {
    const base = { finding: null, note: null, references: [] };
    expect(codeBannerKind({ ...base, verdict: 'ALREADY_EXISTS' })).toBe('exists');
    expect(codeBannerKind({ ...base, verdict: 'CONFLICTS_WITH_CODE' })).toBe('conflicts');
    expect(codeBannerKind({ ...base, verdict: 'NOT_FOUND' })).toBe('notFound');
    expect(codeBannerKind({ ...base, verdict: 'UNSURE' })).toBe('unsure');
    expect(codeBannerKind({ ...base, finding: 'CONFLICTS_WITH_CODE' })).toBe('conflicts');
    expect(codeBannerKind({ ...base, finding: 'ALREADY_EXISTS' })).toBe('exists');
    expect(codeBannerKind(base)).toBeNull();
    expect(codeBannerKind(null)).toBeNull();
    expect(codeBannerKind(undefined)).toBeNull();
  });

  it('a deep verdict wins over an older quick finding', () => {
    expect(
      codeBannerKind({
        finding: 'ALREADY_EXISTS',
        note: null,
        references: [],
        verdict: 'NOT_FOUND',
      }),
    ).toBe('notFound');
  });

  it('reads the verification state, ignoring unknown values', () => {
    expect(verifyStateOf(suggestion())).toBeNull();
    expect(verifyStateOf(suggestion({ finding: null, note: null, references: [] }))).toBeNull();
    expect(
      verifyStateOf(
        suggestion({ finding: null, note: null, references: [], verifyState: 'VERIFYING' }),
      ),
    ).toBe('VERIFYING');
    expect(
      verifyStateOf(
        suggestion({
          finding: null,
          note: null,
          references: [],
          verifyState: 'WEIRD' as unknown as 'FAILED',
        }),
      ),
    ).toBeNull();
  });

  it('starts verifying without losing what the quick pass said', () => {
    const quick = suggestion({
      finding: 'ALREADY_EXISTS',
      note: 'ya existe',
      references: [{ repository: 'a/b', path: 'src', name: 'Src', url: null }],
    });

    const running = startVerifying(quick);

    expect(isVerifying(running)).toBe(true);
    expect(running.code?.note).toBe('ya existe');
    expect(running.code?.references).toHaveLength(1);
    expect(running.code?.verifyError).toBeNull();
    expect(isVerifying(quick)).toBe(false);
  });

  it('starts verifying a suggestion the code never mentioned', () => {
    const running = startVerifying(suggestion(null));

    expect(running.code).toEqual({
      finding: null,
      note: null,
      references: [],
      verifyState: 'VERIFYING',
      verifyError: null,
    });
  });

  it('fails a verification with the reason, keeping the earlier insight', () => {
    const failed = failVerification(startVerifying(suggestion()), 'timeout');

    expect(failed.code?.verifyState).toBe('FAILED');
    expect(failed.code?.verifyError).toBe('timeout');
    expect(failVerification(suggestion()).code?.verifyError).toBeNull();
  });

  it('applies a realtime code update and ignores an empty one', () => {
    const update: SuggestionCodeInsight = {
      finding: 'CONFLICTS_WITH_CODE',
      note: 'El código permite 2 h',
      references: [],
      verdict: 'CONFLICTS_WITH_CODE',
      verifyState: 'VERIFIED',
      verifiedAt: '2026-10-11T10:00:20Z',
    };

    expect(withCodeUpdate(startVerifying(suggestion()), update).code).toEqual(update);
    const unchanged = suggestion();
    expect(withCodeUpdate(unchanged, null)).toBe(unchanged);
  });

  it('updates only the matching entry', () => {
    const list = [suggestion(), { ...suggestion(), id: 's2' }];

    const next = updateSuggestion(list, 's2', startVerifying);

    expect(next[0]).toBe(list[0]);
    expect(isVerifying(next[1])).toBe(true);
    expect(updateSuggestion(list, 'missing', startVerifying)).toEqual(list);
  });

  it('writes a reference with lines as path:start-end and a module as nothing', () => {
    const base = { repository: 'a/b', path: 'src', name: 'x.ts', url: 'https://github.com/a/b' };
    expect(lineReferenceLabel({ ...base, file: 'src/x.ts', lineStart: 12, lineEnd: 20 })).toBe(
      'src/x.ts:12-20',
    );
    expect(lineReferenceLabel({ ...base, file: 'src/x.ts', lineStart: 12, lineEnd: 12 })).toBe(
      'src/x.ts:12',
    );
    expect(lineReferenceLabel({ ...base, file: 'src/x.ts', lineStart: 7 })).toBe('src/x.ts:7');
    expect(lineReferenceLabel(base)).toBeNull();
    expect(hasLines({ file: 'src/x.ts', lineStart: 0 })).toBe(false);
    expect(hasLines({ file: null, lineStart: 3 })).toBe(false);
  });

  it('only links http(s) urls', () => {
    expect(safeReferenceUrl('https://github.com/a/b/blob/abc/x.ts#L1-L2')).toBe(
      'https://github.com/a/b/blob/abc/x.ts#L1-L2',
    );
    expect(safeReferenceUrl('javascript:alert(1)')).toBeNull();
    expect(safeReferenceUrl('not a url')).toBeNull();
    expect(safeReferenceUrl(null)).toBeNull();
  });

  it('waits longer than the API budget before giving up', () => {
    expect(VERIFY_TIMEOUT_MS).toBeGreaterThan(25_000);
  });
});
