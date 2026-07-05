import {
  AcceptanceCriterion,
  EditableSuggestion,
  SuggestionResponse,
  draftToEditable,
  editableToAcceptRequest,
  emptyEditableCriterion,
  suggestionCriteria,
} from './discovery.models';

/** A NEW_STORY suggestion fixture; override per test. */
function suggestion(overrides: Partial<SuggestionResponse> = {}): SuggestionResponse {
  return {
    id: 'sug-1',
    sessionId: 'sess-1',
    projectId: 'proj-1',
    type: 'NEW_STORY',
    status: 'PENDING',
    draftTitle: 'Export invoices',
    draftRole: 'accountant',
    draftAction: 'export invoices as PDF',
    draftBenefit: 'share them with clients',
    draftPriority: 'MEDIUM',
    draftStoryPoints: 3,
    relatedTopic: null,
    targetStoryId: null,
    question: null,
    resolvedStoryId: null,
    draftAcceptanceCriteria: null,
    createdAt: '2026-07-04T12:10:00Z',
    updatedAt: '2026-07-04T12:10:00Z',
    ...overrides,
  };
}

describe('suggestionCriteria', () => {
  it('returns an empty list for absent, null or non-array input', () => {
    expect(suggestionCriteria(undefined)).toEqual([]);
    expect(suggestionCriteria(null)).toEqual([]);
    // Malformed (not an array) tolerated defensively.
    expect(suggestionCriteria('given/when/then' as unknown as AcceptanceCriterion[])).toEqual([]);
  });

  it('keeps well-formed criteria, trimming fields and preserving the scenario', () => {
    const raw: AcceptanceCriterion[] = [
      { scenario: '  Happy path  ', given: '  a user  ', when: ' clicks ', then: ' it opens ' },
    ];
    expect(suggestionCriteria(raw)).toEqual([
      { scenario: 'Happy path', given: 'a user', when: 'clicks', then: 'it opens' },
    ]);
  });

  it('normalizes a blank/absent scenario to null', () => {
    const raw: AcceptanceCriterion[] = [
      { scenario: '   ', given: 'a', when: 'b', then: 'c' },
      { given: 'd', when: 'e', then: 'f' },
    ];
    const out = suggestionCriteria(raw);
    expect(out[0].scenario).toBeNull();
    expect(out[1].scenario).toBeNull();
  });

  it('drops entries missing any of given/when/then', () => {
    const raw = [
      { given: 'a', when: 'b', then: 'c' },
      { given: '', when: 'b', then: 'c' },
      { given: 'a', when: '   ', then: 'c' },
      { given: 'a', when: 'b', then: '' },
      null,
      undefined,
      'not an object',
    ] as unknown as AcceptanceCriterion[];
    const out = suggestionCriteria(raw);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ scenario: null, given: 'a', when: 'b', then: 'c' });
  });
});

describe('draftToEditable', () => {
  it('seeds the editable model from the draft fields', () => {
    const model = draftToEditable(suggestion());
    expect(model).toEqual({
      title: 'Export invoices',
      role: 'accountant',
      action: 'export invoices as PDF',
      benefit: 'share them with clients',
      priority: 'MEDIUM',
      storyPoints: 3,
      criteria: [],
    });
  });

  it('falls back to empty strings and MEDIUM priority for null drafts', () => {
    const model = draftToEditable(
      suggestion({
        draftTitle: null,
        draftRole: null,
        draftAction: null,
        draftBenefit: null,
        draftPriority: null,
        draftStoryPoints: null,
      }),
    );
    expect(model.title).toBe('');
    expect(model.priority).toBe('MEDIUM');
    expect(model.storyPoints).toBeNull();
  });

  it('maps draft criteria into editable rows (blank scenario as empty string)', () => {
    const model = draftToEditable(
      suggestion({
        draftAcceptanceCriteria: [
          { scenario: 'Happy path', given: 'a', when: 'b', then: 'c' },
          { given: 'd', when: 'e', then: 'f' },
        ],
      }),
    );
    expect(model.criteria).toEqual([
      { scenario: 'Happy path', given: 'a', when: 'b', then: 'c' },
      { scenario: '', given: 'd', when: 'e', then: 'f' },
    ]);
  });

  it('seeds EDGE_CASE with one empty criterion when the draft carries none', () => {
    const model = draftToEditable(suggestion({ type: 'EDGE_CASE', draftAcceptanceCriteria: null }));
    expect(model.criteria).toEqual([{ scenario: '', given: '', when: '', then: '' }]);
  });

  it('seeds EDGE_CASE from the draft criterion when present', () => {
    const model = draftToEditable(
      suggestion({
        type: 'EDGE_CASE',
        draftAcceptanceCriteria: [{ scenario: 'Empty cart', given: 'no items', when: 'checkout', then: 'blocked' }],
      }),
    );
    expect(model.criteria).toEqual([
      { scenario: 'Empty cart', given: 'no items', when: 'checkout', then: 'blocked' },
    ]);
  });
});

describe('editableToAcceptRequest', () => {
  function editable(overrides: Partial<EditableSuggestion> = {}): EditableSuggestion {
    return { ...draftToEditable(suggestion()), ...overrides };
  }

  it('sends nothing when the model still matches the draft (NEW_STORY)', () => {
    expect(editableToAcceptRequest(suggestion(), editable())).toEqual({});
  });

  it('sends only the fields that changed', () => {
    const req = editableToAcceptRequest(
      suggestion(),
      editable({ title: 'Export invoices as PDF', priority: 'HIGH', storyPoints: 5 }),
    );
    expect(req).toEqual({
      editedTitle: 'Export invoices as PDF',
      editedPriority: 'HIGH',
      editedStoryPoints: 5,
    });
  });

  it('trims edits and never overwrites a draft with a blank field', () => {
    const req = editableToAcceptRequest(
      suggestion(),
      editable({ title: '  Renamed  ', role: '   ' }),
    );
    expect(req.editedTitle).toBe('Renamed');
    expect(req.editedRole).toBeUndefined();
  });

  it('collects NEW_STORY edited criteria, dropping incomplete rows', () => {
    const req = editableToAcceptRequest(
      suggestion(),
      editable({
        criteria: [
          { scenario: 'Happy', given: 'a', when: 'b', then: 'c' },
          { scenario: '', given: 'd', when: '', then: 'f' },
        ],
      }),
    );
    expect(req.editedAcceptanceCriteria).toEqual([
      { scenario: 'Happy', given: 'a', when: 'b', then: 'c' },
    ]);
  });

  it('omits editedAcceptanceCriteria for UPDATE_STORY (criteria are not edited there)', () => {
    const s = suggestion({ type: 'UPDATE_STORY' });
    const req = editableToAcceptRequest(s, {
      ...draftToEditable(s),
      criteria: [{ scenario: 'x', given: 'a', when: 'b', then: 'c' }],
    });
    expect(req.editedAcceptanceCriteria).toBeUndefined();
  });

  it('projects an EDGE_CASE criterion onto both flat fields and the structured list', () => {
    const s = suggestion({
      type: 'EDGE_CASE',
      draftTitle: null,
      draftRole: null,
      draftAction: null,
      draftBenefit: null,
      draftAcceptanceCriteria: null,
    });
    const model: EditableSuggestion = {
      ...draftToEditable(s),
      criteria: [{ scenario: 'Empty cart', given: 'no items', when: 'checkout', then: 'blocked' }],
    };
    const req = editableToAcceptRequest(s, model);
    // Flat fields today's backend composes its Gherkin line from.
    expect(req.editedTitle).toBe('Empty cart');
    expect(req.editedRole).toBe('no items');
    expect(req.editedAction).toBe('checkout');
    expect(req.editedBenefit).toBe('blocked');
    // Structured criterion for the newer backend.
    expect(req.editedAcceptanceCriteria).toEqual([
      { scenario: 'Empty cart', given: 'no items', when: 'checkout', then: 'blocked' },
    ]);
  });

  it('sends no structured criterion for EDGE_CASE when the row is incomplete', () => {
    const s = suggestion({ type: 'EDGE_CASE', draftAcceptanceCriteria: null });
    const model: EditableSuggestion = {
      ...draftToEditable(s),
      criteria: [{ scenario: 'x', given: 'a', when: '', then: 'c' }],
    };
    const req = editableToAcceptRequest(s, model);
    expect(req.editedAcceptanceCriteria).toBeUndefined();
  });

  it('empty editable criterion helper is fully blank', () => {
    expect(emptyEditableCriterion()).toEqual({ scenario: '', given: '', when: '', then: '' });
  });
});
