import { describe, expect, it } from 'vitest';
import {
  appendExchange,
  ASSISTANT_MESSAGE_MAX,
  messageToSend,
  replaceSuggestion,
  updateReplySuggestion,
} from './assistant-chat';
import { AssistantMessageResponse, SuggestionResponse } from './discovery.models';

function suggestion(
  id: string,
  status: SuggestionResponse['status'] = 'PENDING',
): SuggestionResponse {
  return {
    id,
    sessionId: null,
    projectId: 'p1',
    type: 'NEW_STORY',
    status,
    draftTitle: 'Cancelar reserva',
    draftRole: 'comensal',
    draftAction: 'cancelar mi reserva',
    draftBenefit: 'liberar la mesa',
    draftPriority: 'HIGH',
    draftStoryPoints: 2,
    relatedTopic: null,
    targetStoryId: null,
    question: null,
    resolvedStoryId: null,
    createdAt: '2026-10-08T12:00:00Z',
  } as SuggestionResponse;
}

function message(id: string, suggestions: SuggestionResponse[] = []): AssistantMessageResponse {
  return {
    id,
    role: suggestions.length ? 'ASSISTANT' : 'ANALYST',
    content: id,
    createdAt: '2026-10-08T12:00:00Z',
    suggestions,
  };
}

describe('messageToSend', () => {
  it('trims what the analyst typed', () => {
    expect(messageToSend('  ¿Cuántas historias hay?  ')).toBe('¿Cuántas historias hay?');
  });

  it('refuses blank or too long text', () => {
    expect(messageToSend('   ')).toBeNull();
    expect(messageToSend('x'.repeat(ASSISTANT_MESSAGE_MAX + 1))).toBeNull();
  });
});

describe('appendExchange', () => {
  it('appends the question and the answer in order', () => {
    expect(appendExchange([message('a')], message('b'), message('c')).map((m) => m.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('skips messages that are already in the chat', () => {
    expect(appendExchange([message('a')], message('a'), message('b')).map((m) => m.id)).toEqual([
      'a',
      'b',
    ]);
  });
});

describe('replaceSuggestion', () => {
  it('updates the decided suggestion inside its reply and leaves the others alone', () => {
    const chat = [message('q'), message('r', [suggestion('s1'), suggestion('s2')])];

    const next = replaceSuggestion(chat, suggestion('s1', 'ACCEPTED'));

    expect(next[1].suggestions.map((s) => s.status)).toEqual(['ACCEPTED', 'PENDING']);
    expect(next[0]).toBe(chat[0]);
  });
});

describe('updateReplySuggestion', () => {
  it('changes only the matching suggestion of the reply that carries it', () => {
    const chat = [
      message('q'),
      message('r', [suggestion('s1'), suggestion('s2')]),
      message('r2', [suggestion('s3')]),
    ];

    const next = updateReplySuggestion(chat, 's2', (s) => ({ ...s, draftTitle: 'Cambiada' }));

    expect(next[1].suggestions.map((s) => s.draftTitle)).toEqual(['Cancelar reserva', 'Cambiada']);
    expect(next[0]).toBe(chat[0]);
    expect(next[2]).toBe(chat[2]);
  });

  it('leaves the chat as it was when no reply carries the suggestion', () => {
    const chat = [message('r', [suggestion('s1')])];

    expect(updateReplySuggestion(chat, 'missing', (s) => ({ ...s, draftTitle: 'x' }))).toEqual(
      chat,
    );
  });
});
