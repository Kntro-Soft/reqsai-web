import {
  SessionSpeakerResponse,
  SessionSpeakerUpdatedMessage,
  SpeakerOverlapsResponse,
  SpeakerSide,
} from './discovery.models';

/**
 * Pure rules for the diarized speakers of a session (US40): how the API's speakers merge with the
 * labels seen in the feed, their default names, colors and feed side, and the overlapping-speech
 * notice. Kept free of Angular so they are unit-testable.
 */

/** Longest speaker name the API accepts. */
export const SPEAKER_NAME_MAX = 80;

/** One speaker's color: a dot and a readable text tone. Literal classes so Tailwind generates them. */
export interface SpeakerColor {
  dot: string;
  text: string;
}

/**
 * Speaker colors, cycled by speaker index. Red, violet, emerald and amber are left out: the app
 * already uses them for the brand, the AI, validated content and pending review.
 */
export const SPEAKER_COLORS: readonly SpeakerColor[] = [
  { dot: 'bg-sky-500', text: 'text-sky-600' },
  { dot: 'bg-teal-500', text: 'text-teal-600' },
  { dot: 'bg-indigo-500', text: 'text-indigo-500' },
  { dot: 'bg-fuchsia-500', text: 'text-fuchsia-600' },
  { dot: 'bg-lime-600', text: 'text-lime-700' },
  { dot: 'bg-cyan-600', text: 'text-cyan-700' },
  { dot: 'bg-orange-500', text: 'text-orange-600' },
  { dot: 'bg-slate-500', text: 'text-slate-500' },
];

/** The color of the speaker that appeared `index`-th (1-based), cycling through the palette. */
export function speakerColor(index: number): SpeakerColor {
  const position = Math.max(0, Math.floor(index) - 1) % SPEAKER_COLORS.length;
  return SPEAKER_COLORS[position];
}

/** A speaker as the feed renders it. */
export interface SpeakerView {
  /** Diarization label from the provider. */
  label: string;
  /** 1-based position by first appearance (drives "Hablante N" and the color). */
  index: number;
  /** Name the analyst gave, or null for the default "Hablante N". */
  displayName: string | null;
  /** Client or team, when the analyst set it. */
  role: SpeakerSide | null;
  /** Which side of the feed the speaker's bubbles sit on. */
  side: 'left' | 'right';
  /** Final segments attributed to the speaker (0 for one the API does not know yet). */
  segmentCount: number;
}

/**
 * Feed side of a speaker: the client on the left and the team on the right, like the two sides of a
 * conversation; a speaker without a side alternates by index (1st left, 2nd right, …).
 */
export function feedSide(index: number, role: SpeakerSide | null): 'left' | 'right' {
  if (role === 'CLIENT') return 'left';
  if (role === 'TEAM') return 'right';
  return index % 2 === 1 ? 'left' : 'right';
}

/**
 * Merges the API's speakers (numbered by first appearance across the whole session) with the labels
 * of the loaded segments: a label the API does not know yet (someone who just started talking) is
 * appended with the next number, in first-seen order. Empty when nothing carries a label.
 */
export function buildSpeakerViews(
  known: readonly SessionSpeakerResponse[] | null | undefined,
  segments: readonly { speakerLabel: string | null }[],
): SpeakerView[] {
  const views: SpeakerView[] = [...(known ?? [])]
    .sort((a, b) => a.index - b.index)
    .map((s) => ({
      label: s.label,
      index: s.index,
      displayName: s.displayName,
      role: s.side,
      side: feedSide(s.index, s.side),
      segmentCount: s.segmentCount,
    }));
  const seen = new Set(views.map((v) => v.label));
  let next = views.reduce((max, v) => Math.max(max, v.index), 0);
  for (const segment of segments) {
    const label = segment.speakerLabel?.trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    next += 1;
    views.push({
      label,
      index: next,
      displayName: null,
      role: null,
      side: feedSide(next, null),
      segmentCount: 0,
    });
  }
  return views;
}

/** The views keyed by label, for per-segment lookups. */
export function speakerMap(views: readonly SpeakerView[]): Map<string, SpeakerView> {
  return new Map(views.map((v) => [v.label, v]));
}

/**
 * When to (re)load a session's speakers: a key built from the session status and the distinct labels
 * of its loaded segments, so a new speaker or the end of the meeting refreshes the names and the
 * overlap report. Null when no segment carries a label (no diarization, nothing to load).
 */
export function speakersLoadKey(
  status: string,
  segments: readonly { speakerLabel: string | null }[],
): string | null {
  const labels = new Set<string>();
  for (const segment of segments) {
    const label = segment.speakerLabel?.trim();
    if (label) labels.add(label);
  }
  if (labels.size === 0) return null;
  return `${status}|${[...labels].sort().join(',')}`;
}

/** The name to show: the analyst's, else the localized default ("Hablante N"). */
export function speakerName(
  speaker: { displayName: string | null; index: number },
  defaultName: (index: number) => string,
): string {
  const name = speaker.displayName?.trim();
  return name ? name : defaultName(speaker.index);
}

/** The name as the API stores it: whitespace collapsed and trimmed, capped, null when blank. */
export function normalizeSpeakerName(input: string | null | undefined): string | null {
  const clean = (input ?? '').replace(/\s+/g, ' ').trim().slice(0, SPEAKER_NAME_MAX).trim();
  return clean.length > 0 ? clean : null;
}

/** Applies a SPEAKER_UPDATED event (or a PUT result) to the known speakers, keeping their order. */
export function applySpeakerUpdate(
  known: readonly SessionSpeakerResponse[] | null | undefined,
  update: Pick<SessionSpeakerUpdatedMessage, 'speakerLabel' | 'displayName' | 'side'>,
): SessionSpeakerResponse[] {
  const list = [...(known ?? [])];
  const at = list.findIndex((s) => s.label === update.speakerLabel);
  if (at >= 0) {
    const current = list[at];
    list[at] = {
      ...current,
      displayName: update.displayName,
      side: update.side,
      name: update.displayName ?? `Hablante ${current.index}`,
    };
    return list;
  }
  const index = list.reduce((max, s) => Math.max(max, s.index), 0) + 1;
  list.push({
    label: update.speakerLabel,
    index,
    displayName: update.displayName,
    name: update.displayName ?? `Hablante ${index}`,
    side: update.side,
    segmentCount: 0,
  });
  return list;
}

/** The overlapping-speech warning to show, or null when the speakers never talked over each other. */
export function overlapNotice(
  overlaps: SpeakerOverlapsResponse | null | undefined,
): { key: string; params: { count: number } } | null {
  const count = overlaps?.count ?? 0;
  if (count <= 0) return null;
  return { key: 'discovery.speakers.overlapWarning', params: { count } };
}
