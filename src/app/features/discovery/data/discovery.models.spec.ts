import { AcceptanceCriterion, suggestionCriteria } from './discovery.models';

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
