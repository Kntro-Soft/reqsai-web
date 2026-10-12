import { SuggestionResponse } from './discovery.models';
import { FeedItem } from './feed';
import { SpeakerView, speakerName } from './speakers';

/**
 * Pure rules for a suggestion's evidence: which transcript bubble of the feed it points at, how
 * that bubble is addressed in the DOM, and how its speaker is named. Kept free of Angular so they
 * are unit-testable.
 */

/** The DOM key of a transcript bubble (`data-segment`): `{sessionId}:{sequence}`. */
export function segmentKey(sessionId: string, sequence: number): string {
  return `${sessionId}:${sequence}`;
}

/** The transcript segment a suggestion's evidence points at, as loaded in the feed. */
export interface EvidenceSegment {
  sessionId: string;
  sequence: number;
  /** When the segment was said (ISO 8601). */
  occurredAt: string;
  /** Who said it; null when the session has no diarization. */
  speaker: SpeakerView | null;
}

/** The parts of a feed block the lookup needs (a {@link RenderBlock}). */
interface EvidenceBlock {
  session: { id: string };
  items: readonly FeedItem[];
  speakers: ReadonlyMap<string, SpeakerView>;
}

/**
 * Finds the loaded transcript segment a suggestion's evidence points at. Null when the suggestion
 * has no session or no evidence, or when that segment is not loaded in the feed (an unloaded
 * session, or an older chunk of a long one).
 */
export function locateEvidence(
  blocks: readonly EvidenceBlock[],
  suggestion: Pick<SuggestionResponse, 'sessionId' | 'evidence'>,
): EvidenceSegment | null {
  const sessionId = suggestion.sessionId;
  const sequence = suggestion.evidence?.sequence;
  if (!sessionId || typeof sequence !== 'number') return null;
  const block = blocks.find((b) => b.session.id === sessionId);
  if (!block) return null;
  for (const item of block.items) {
    if (item.kind !== 'segment' || item.segment.sequence !== sequence) continue;
    const label = item.segment.speakerLabel?.trim();
    return {
      sessionId,
      sequence,
      occurredAt: item.segment.occurredAt,
      speaker: label ? (block.speakers.get(label) ?? null) : null,
    };
  }
  return null;
}

/**
 * The speaker as the evidence line names them, like the transcript bubbles: the analyst's name or
 * the default "Hablante N", followed by their side when set ("Ana (Cliente)"). Null without a
 * speaker.
 */
export function evidenceSpeakerLabel(
  speaker: SpeakerView | null | undefined,
  defaultName: (index: number) => string,
  sideName: (side: NonNullable<SpeakerView['role']>) => string,
): string | null {
  if (!speaker) return null;
  const name = speakerName(speaker, defaultName);
  return speaker.role ? `${name} (${sideName(speaker.role)})` : name;
}
