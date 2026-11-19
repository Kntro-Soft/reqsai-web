import { UserStoryResponse } from './discovery.models';
import {
  ImprovementCriterion,
  PendingValue,
  StoryImprovementProposal,
} from './story-improvement.models';

/** A `[[...]]` placeholder: a value the analyst still has to fill in. */
const TOKEN_PATTERN = /\[\[[^[\]]+\]\]/g;

/** The story parts that are a single line of the sentence. */
export type StoryField = 'title' | 'role' | 'action' | 'benefit';
/** The parts of a Given/When/Then criterion. */
export type CriterionField = 'scenario' | 'given' | 'when' | 'then';

/** The story as it is saved today, the "before" of the review. */
export interface StorySnapshot {
  title: string;
  role: string;
  action: string;
  benefit: string;
  acceptanceCriteria: ImprovementCriterion[];
}

/** One field of the review: what it says now, what the AI proposes and what the analyst has typed. */
export interface ImprovementField {
  /** Stable id (`title`, `criterion-0-given`...), used for the DOM ids and test ids. */
  id: string;
  /** The criterion it belongs to, or null for a part of the story sentence. */
  criterion: number | null;
  key: StoryField | CriterionField;
  before: string;
  after: string;
  /** True when the draft differs from the saved story. */
  changed: boolean;
  /** The placeholders still in the draft text. */
  tokens: string[];
}

export const STORY_FIELDS: readonly StoryField[] = ['title', 'role', 'action', 'benefit'];
export const CRITERION_FIELDS: readonly CriterionField[] = ['scenario', 'given', 'when', 'then'];

/** The distinct placeholders in a text, in the order they appear. */
export function tokensIn(text: string | null | undefined): string[] {
  return Array.from(new Set((text ?? '').match(TOKEN_PATTERN) ?? []));
}

/** The distinct placeholders left anywhere in the proposal. */
export function proposalTokens(proposal: StoryImprovementProposal): string[] {
  const tokens = new Set<string>();
  const add = (text: string | null) => tokensIn(text).forEach((t) => tokens.add(t));
  STORY_FIELDS.forEach((key) => add(proposal[key]));
  for (const c of proposal.acceptanceCriteria) CRITERION_FIELDS.forEach((key) => add(c[key]));
  return Array.from(tokens);
}

/** The hint of a placeholder, or null when the AI gave none. */
export function hintFor(token: string, pending: readonly PendingValue[]): string | null {
  return pending.find((p) => p.token === token)?.hint ?? null;
}

/** Reads the saved story as the "before" side: criteria without ids, missing scenarios as blank. */
export function snapshotOf(story: UserStoryResponse | null): StorySnapshot {
  return {
    title: story?.title ?? '',
    role: story?.role ?? '',
    action: story?.action ?? '',
    benefit: story?.benefit ?? '',
    acceptanceCriteria: (story?.acceptanceCriteria ?? []).map((c) => ({
      scenario: c.scenario ?? null,
      given: c.given,
      when: c.when,
      then: c.then,
    })),
  };
}

/** A copy of the proposal the analyst can edit without touching what the AI returned. */
export function cloneProposal(proposal: StoryImprovementProposal): StoryImprovementProposal {
  return {
    title: proposal.title,
    role: proposal.role,
    action: proposal.action,
    benefit: proposal.benefit,
    acceptanceCriteria: (proposal.acceptanceCriteria ?? []).map((c) => ({
      scenario: c.scenario ?? null,
      given: c.given,
      when: c.when,
      then: c.then,
    })),
  };
}

function differs(before: string, after: string): boolean {
  return before.trim() !== after.trim();
}

/**
 * Lines the draft up against the saved story, field by field: the story sentence first, then each
 * criterion's scenario, given, when and then (criteria are paired by position). A criterion the story
 * does not have yet reads as blank on the "before" side.
 */
export function improvementFields(
  before: StorySnapshot,
  draft: StoryImprovementProposal,
): ImprovementField[] {
  const fields: ImprovementField[] = STORY_FIELDS.map((key) => ({
    id: key,
    criterion: null,
    key,
    before: before[key],
    after: draft[key],
    changed: differs(before[key], draft[key]),
    tokens: tokensIn(draft[key]),
  }));
  draft.acceptanceCriteria.forEach((criterion, index) => {
    const saved = before.acceptanceCriteria[index];
    for (const key of CRITERION_FIELDS) {
      const was = saved?.[key] ?? '';
      const now = criterion[key] ?? '';
      // A criterion without a scenario heading has nothing to review in that line.
      if (key === 'scenario' && !was.trim() && !now.trim()) continue;
      fields.push({
        id: `criterion-${index}-${key}`,
        criterion: index,
        key,
        before: was,
        after: now,
        changed: differs(was, now),
        tokens: tokensIn(now),
      });
    }
  });
  return fields;
}

/** Returns the draft with one field replaced. */
export function withField(
  draft: StoryImprovementProposal,
  field: Pick<ImprovementField, 'criterion' | 'key'>,
  value: string,
): StoryImprovementProposal {
  if (field.criterion === null) return { ...draft, [field.key]: value };
  return {
    ...draft,
    acceptanceCriteria: draft.acceptanceCriteria.map((c, i) =>
      i === field.criterion ? { ...c, [field.key]: value } : c,
    ),
  };
}

/** The body to apply: every text trimmed and a blank scenario sent as null, like the criteria editor does. */
export function proposalToRequest(draft: StoryImprovementProposal): StoryImprovementProposal {
  return {
    title: draft.title.trim(),
    role: draft.role.trim(),
    action: draft.action.trim(),
    benefit: draft.benefit.trim(),
    acceptanceCriteria: draft.acceptanceCriteria.map((c) => ({
      scenario: c.scenario?.trim() || null,
      given: c.given.trim(),
      when: c.when.trim(),
      then: c.then.trim(),
    })),
  };
}

/** True when the proposal does not change anything of the saved story. */
export function isNoChange(before: StorySnapshot, proposal: StoryImprovementProposal): boolean {
  return (
    before.acceptanceCriteria.length === proposal.acceptanceCriteria.length &&
    improvementFields(before, proposal).every((f) => !f.changed)
  );
}

/** True when a required text of the draft is blank (the backend rejects it). */
export function hasBlankField(draft: StoryImprovementProposal): boolean {
  return (
    STORY_FIELDS.some((k) => !draft[k].trim()) ||
    draft.acceptanceCriteria.some((c) => !c.given.trim() || !c.when.trim() || !c.then.trim())
  );
}
