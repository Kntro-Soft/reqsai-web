import { describe, expect, it } from 'vitest';
import { UserStoryResponse } from './discovery.models';
import {
  cloneProposal,
  hasBlankField,
  hintFor,
  improvementFields,
  isNoChange,
  proposalToRequest,
  proposalTokens,
  snapshotOf,
  tokensIn,
  withField,
} from './story-improvement';
import { StoryImprovementProposal } from './story-improvement.models';

const STORY = {
  id: 's1',
  projectId: 'p1',
  title: 'Ver el menú',
  role: 'comensal',
  action: 'ver el menú rápido',
  benefit: 'decidir qué pedir',
  priority: 'MEDIUM',
  storyPoints: null,
  status: 'DRAFT',
  sessionId: null,
  acceptanceCriteria: [
    { id: 'c1', storyId: 's1', scenario: null, given: 'g', when: 'w', then: 't' },
  ],
} as unknown as UserStoryResponse;

const PROPOSAL: StoryImprovementProposal = {
  title: 'Ver el menú',
  role: 'comensal',
  action: 'ver el menú en [[tiempo máximo de respuesta]]',
  benefit: 'decidir qué pedir',
  acceptanceCriteria: [
    { scenario: null, given: 'g', when: 'w', then: 'responde en [[segundos]] y [[segundos]]' },
    { scenario: 'Menú vacío', given: 'g2', when: 'w2', then: 't2' },
  ],
};

describe('story improvement helpers', () => {
  it('finds each distinct placeholder once, in order', () => {
    expect(tokensIn('a [[x y]] b [[z]] c [[x y]]')).toEqual(['[[x y]]', '[[z]]']);
    expect(tokensIn('sin marcadores [ ] [[]]')).toEqual([]);
    expect(tokensIn(null)).toEqual([]);
  });

  it('collects the placeholders left anywhere in the proposal', () => {
    expect(proposalTokens(PROPOSAL)).toEqual(['[[tiempo máximo de respuesta]]', '[[segundos]]']);
    expect(proposalTokens(withField(PROPOSAL, { criterion: null, key: 'action' }, 'ok'))).toEqual([
      '[[segundos]]',
    ]);
  });

  it('looks a hint up by its token', () => {
    const pending = [{ token: '[[a]]', hint: '¿A?' }];
    expect(hintFor('[[a]]', pending)).toBe('¿A?');
    expect(hintFor('[[b]]', pending)).toBeNull();
  });

  it('lines the draft up with the saved story and flags what changed', () => {
    const fields = improvementFields(snapshotOf(STORY), PROPOSAL);
    const byId = Object.fromEntries(fields.map((f) => [f.id, f]));
    expect(byId['title'].changed).toBe(false);
    expect(byId['action'].changed).toBe(true);
    expect(byId['action'].tokens).toEqual(['[[tiempo máximo de respuesta]]']);
    expect(byId['criterion-0-given'].changed).toBe(false);
    expect(byId['criterion-0-then'].changed).toBe(true);
    // a new criterion reads as blank before; a criterion without scenario skips that line
    expect(byId['criterion-1-given'].before).toBe('');
    expect(byId['criterion-1-given'].changed).toBe(true);
    expect(byId['criterion-1-scenario'].after).toBe('Menú vacío');
    expect(byId['criterion-0-scenario']).toBeUndefined();
  });

  it('replaces one field without touching the others or the original', () => {
    const next = withField(PROPOSAL, { criterion: 1, key: 'then' }, 'nuevo');
    expect(next.acceptanceCriteria[1].then).toBe('nuevo');
    expect(next.acceptanceCriteria[0]).toBe(PROPOSAL.acceptanceCriteria[0]);
    expect(PROPOSAL.acceptanceCriteria[1].then).toBe('t2');
  });

  it('clones the proposal so edits do not leak into the AI answer', () => {
    const copy = cloneProposal(PROPOSAL);
    copy.acceptanceCriteria[0].given = 'otro';
    expect(PROPOSAL.acceptanceCriteria[0].given).toBe('g');
  });

  it('trims the body to apply and sends a blank scenario as null', () => {
    const body = proposalToRequest({
      ...PROPOSAL,
      title: '  Título  ',
      acceptanceCriteria: [{ scenario: '  ', given: ' g ', when: 'w', then: 't' }],
    });
    expect(body.title).toBe('Título');
    expect(body.acceptanceCriteria[0]).toEqual({
      scenario: null,
      given: 'g',
      when: 'w',
      then: 't',
    });
  });

  it('recognises a proposal that changes nothing', () => {
    const same: StoryImprovementProposal = {
      title: STORY.title,
      role: STORY.role,
      action: STORY.action,
      benefit: STORY.benefit,
      acceptanceCriteria: [{ scenario: null, given: 'g', when: 'w', then: 't' }],
    };
    expect(isNoChange(snapshotOf(STORY), same)).toBe(true);
    expect(isNoChange(snapshotOf(STORY), PROPOSAL)).toBe(false);
    expect(isNoChange(snapshotOf(STORY), { ...same, acceptanceCriteria: [] })).toBe(false);
  });

  it('detects blank required texts', () => {
    expect(hasBlankField(PROPOSAL)).toBe(false);
    expect(hasBlankField(withField(PROPOSAL, { criterion: null, key: 'role' }, ' '))).toBe(true);
    expect(hasBlankField(withField(PROPOSAL, { criterion: 0, key: 'when' }, ''))).toBe(true);
  });
});
