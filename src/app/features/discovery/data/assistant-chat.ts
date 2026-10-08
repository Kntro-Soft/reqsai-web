import { AssistantMessageResponse, SuggestionResponse } from './discovery.models';

/**
 * Pure helpers of the assistant chat, kept free of Angular so they are unit-testable.
 */

/** Longest message the analyst may send (mirrors the API's limit). */
export const ASSISTANT_MESSAGE_MAX = 2000;

/** The text to send, or null when there is nothing worth sending (blank or over the limit). */
export function messageToSend(raw: string): string | null {
  const text = raw.trim();
  if (!text || text.length > ASSISTANT_MESSAGE_MAX) return null;
  return text;
}

/** Appends one exchange, ignoring messages already present (a retried or duplicated response). */
export function appendExchange(
  messages: readonly AssistantMessageResponse[],
  ...incoming: AssistantMessageResponse[]
): AssistantMessageResponse[] {
  const known = new Set(messages.map((m) => m.id));
  return [...messages, ...incoming.filter((m) => !known.has(m.id))];
}

/** Replaces a suggestion (after a decision) wherever a reply carries it. */
export function replaceSuggestion(
  messages: readonly AssistantMessageResponse[],
  updated: SuggestionResponse,
): AssistantMessageResponse[] {
  return messages.map((m) =>
    m.suggestions.some((s) => s.id === updated.id)
      ? { ...m, suggestions: m.suggestions.map((s) => (s.id === updated.id ? updated : s)) }
      : m,
  );
}
