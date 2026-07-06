import {
  AcceptanceCriterionRequest,
  AcceptanceCriterionResponse,
  EditableCriterion,
  emptyEditableCriterion,
} from '../../data/discovery.models';

/**
 * A criterion row in the create/edit forms. Extends the plain
 * {@link EditableCriterion} with the persisted `id` (present once the criterion
 * exists server-side) so the edit page can PUT/DELETE it individually.
 */
export interface CriterionRow extends EditableCriterion {
  /** Server id, or null for a not-yet-saved row (Create page, or a new row on edit). */
  id: string | null;
}

/** A blank, unsaved criterion row ready to fill. */
export function emptyCriterionRow(): CriterionRow {
  return { id: null, ...emptyEditableCriterion() };
}

/** Seeds an editable row from a persisted criterion response. */
export function criterionToRow(c: AcceptanceCriterionResponse): CriterionRow {
  return {
    id: c.id,
    scenario: c.scenario ?? '',
    given: c.given,
    when: c.when,
    then: c.then,
  };
}

/**
 * True when a row has all three Given/When/Then parts filled (scenario is
 * optional). Blank rows are ignored on submit rather than sent as errors.
 */
export function isCompleteRow(row: EditableCriterion): boolean {
  return !!row.given.trim() && !!row.when.trim() && !!row.then.trim();
}

/** True when a row has no content at all (all four fields blank). */
export function isBlankRow(row: EditableCriterion): boolean {
  return !row.scenario.trim() && !row.given.trim() && !row.when.trim() && !row.then.trim();
}

/**
 * Maps an editable row to the criteria request body. Trims every field; a blank
 * scenario becomes null (the backend clears it).
 */
export function rowToRequest(row: EditableCriterion): AcceptanceCriterionRequest {
  const scenario = row.scenario.trim();
  return {
    scenario: scenario || null,
    given: row.given.trim(),
    when: row.when.trim(),
    then: row.then.trim(),
  };
}

/**
 * Partitions the Create form's rows for submit: the complete ones become
 * request bodies (sent as criteria), and any partially-filled (non-blank but
 * incomplete) row is reported by its zero-based index so the UI can flag it.
 */
export function partitionNewCriteria(rows: readonly EditableCriterion[]): {
  requests: AcceptanceCriterionRequest[];
  incompleteIndexes: number[];
} {
  const requests: AcceptanceCriterionRequest[] = [];
  const incompleteIndexes: number[] = [];
  rows.forEach((row, index) => {
    if (isBlankRow(row)) return;
    if (isCompleteRow(row)) requests.push(rowToRequest(row));
    else incompleteIndexes.push(index);
  });
  return { requests, incompleteIndexes };
}
