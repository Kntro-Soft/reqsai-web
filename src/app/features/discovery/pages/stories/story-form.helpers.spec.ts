import { AcceptanceCriterionResponse } from '../../data/discovery.models';
import {
  criterionToRow,
  emptyCriterionRow,
  isBlankRow,
  isCompleteRow,
  partitionNewCriteria,
  rowToRequest,
} from './story-form.helpers';

describe('story-form helpers', () => {
  it('emptyCriterionRow is blank with a null id', () => {
    const row = emptyCriterionRow();
    expect(row.id).toBeNull();
    expect(isBlankRow(row)).toBe(true);
    expect(isCompleteRow(row)).toBe(false);
  });

  it('criterionToRow maps a persisted response, coercing a null scenario to ""', () => {
    const c: AcceptanceCriterionResponse = {
      id: 'c1',
      storyId: 's1',
      scenario: null,
      given: 'g',
      when: 'w',
      then: 't',
      createdAt: null,
      updatedAt: null,
    };
    expect(criterionToRow(c)).toEqual({ id: 'c1', scenario: '', given: 'g', when: 'w', then: 't' });
  });

  it('isCompleteRow requires all three G/W/T parts', () => {
    expect(isCompleteRow({ scenario: '', given: 'g', when: 'w', then: 't' })).toBe(true);
    expect(isCompleteRow({ scenario: 's', given: 'g', when: '', then: 't' })).toBe(false);
  });

  it('rowToRequest trims fields and nulls a blank scenario', () => {
    expect(rowToRequest({ scenario: '  ', given: ' g ', when: ' w ', then: ' t ' })).toEqual({
      scenario: null,
      given: 'g',
      when: 'w',
      then: 't',
    });
    expect(rowToRequest({ scenario: ' Happy ', given: 'g', when: 'w', then: 't' }).scenario).toBe(
      'Happy',
    );
  });

  it('partitionNewCriteria keeps complete rows, flags partial rows, drops blanks', () => {
    const rows = [
      { scenario: '', given: 'g1', when: 'w1', then: 't1' }, // complete
      { scenario: '', given: '', when: '', then: '' }, // blank -> dropped
      { scenario: 'x', given: 'g', when: '', then: '' }, // partial -> index 2
      { scenario: '', given: 'g3', when: 'w3', then: 't3' }, // complete
    ];
    const { requests, incompleteIndexes } = partitionNewCriteria(rows);
    expect(requests).toHaveLength(2);
    expect(requests[0].given).toBe('g1');
    expect(incompleteIndexes).toEqual([2]);
  });
});
