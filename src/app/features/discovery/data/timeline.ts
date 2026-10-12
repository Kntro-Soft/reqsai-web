import { AssistantMessageResponse, DiscoverySessionResponse } from './discovery.models';
import { FeedItem, itemTime } from './feed';

/**
 * Pure assembly of the capture page's single chronological timeline. The assistant chat
 * (what the analyst types and ReqsAI answers) and the recorded sessions are two streams that
 * must read as one conversation in the order things happened:
 *
 * - sessions are ordered by their start time;
 * - a chat message sent while a session ran (its span: start to end, or open-ended while the
 *   session is live or still being processed) is interleaved into that session's items, right
 *   after the last timed item that happened before it;
 * - messages outside every span form chat groups placed between the sessions by time.
 *
 * Kept free of Angular so the ordering rules are unit-testable.
 */

/** The parts of a render block the timeline needs; the rest of the block is carried along. */
export interface TimelineBlock {
  session: DiscoverySessionResponse;
  items: FeedItem[];
}

/** One session of the timeline; `block.items` already includes the chat sent during it. */
export interface TimelineSession<B extends TimelineBlock> {
  kind: 'session';
  key: string;
  block: B;
}

/** A run of chat that happened between sessions (or before the first, or after the last). */
export interface TimelineChat {
  kind: 'chat';
  key: string;
  messages: AssistantMessageResponse[];
  /** The question awaiting its answer, when it belongs to this run. */
  pending: string | null;
}

export type TimelineEntry<B extends TimelineBlock> = TimelineSession<B> | TimelineChat;

export interface TimelineOptions {
  /** The message currently being answered; it is always the newest thing on the timeline. */
  pending?: string | null;
  /** The clock used to place the pending question (epoch ms). */
  now?: number;
  /**
   * Chat older than this (epoch ms) is left out. Used while older sessions are still to be
   * paged in, so the chat does not show up above history that has not loaded yet.
   */
  cutoff?: number | null;
}

/** Statuses of a session that has not finished: it keeps growing, so its span stays open. */
const OPEN_STATUSES: ReadonlySet<string> = new Set([
  'RECORDING',
  'PAUSED',
  'STOPPED',
  'PROCESSING',
]);

interface Span {
  start: number;
  end: number;
}

interface Placeable {
  time: number;
  message: AssistantMessageResponse | null;
}

function parse(iso: string | null | undefined): number {
  return iso ? Date.parse(iso) : Number.NaN;
}

/** When a session started: the real start, else its creation. NaN when neither parses. */
export function sessionStart(session: DiscoverySessionResponse): number {
  const started = parse(session.startedAt);
  return Number.isNaN(started) ? parse(session.createdAt) : started;
}

/**
 * The time span a session covers. Open-ended (`Infinity`) while it is live or being processed
 * without an end time; otherwise its end, stretched to its last timed item so a segment stamped
 * after `endedAt` still belongs to it.
 */
export function sessionSpan(block: TimelineBlock): Span {
  const start = sessionStart(block.session);
  const ended = parse(block.session.endedAt);
  if (Number.isNaN(ended) && OPEN_STATUSES.has(block.session.status)) {
    return { start, end: Number.POSITIVE_INFINITY };
  }
  let end = Number.isNaN(ended) ? start : ended;
  for (const item of block.items) {
    const time = itemTime(item);
    if (!Number.isNaN(time) && (Number.isNaN(end) || time > end)) end = time;
  }
  return { start, end };
}

/** Index BEFORE which a message sent at `time` goes among a session's items. */
function insertionIndex(items: readonly FeedItem[], time: number): number {
  let after = -1;
  let firstTimed = -1;
  items.forEach((item, index) => {
    const at = itemTime(item);
    if (Number.isNaN(at)) return;
    if (firstTimed < 0) firstTimed = index;
    if (at <= time) after = index;
  });
  if (after >= 0) return after + 1;
  // Before everything that has a time (but after any untimed transcript text).
  return firstTimed >= 0 ? firstTimed : items.length;
}

/** Interleaves messages into a session's items by time (the messages are ascending). */
export function mergeChatIntoItems(
  items: readonly FeedItem[],
  placed: readonly Placeable[],
  pendingText = '',
): FeedItem[] {
  const byIndex = new Map<number, FeedItem[]>();
  for (const { time, message } of placed) {
    const index = insertionIndex(items, time);
    const list = byIndex.get(index) ?? [];
    list.push(
      message
        ? { kind: 'chat', id: `c:${message.id}`, message }
        : { kind: 'chat-pending', id: 'chat-pending', text: pendingText },
    );
    byIndex.set(index, list);
  }
  const merged: FeedItem[] = [];
  for (let i = 0; i <= items.length; i++) {
    merged.push(...(byIndex.get(i) ?? []));
    if (i < items.length) merged.push(items[i]);
  }
  return merged;
}

/** Stable ascending sort that sinks NaN keys to the end. */
function byTime<T>(list: readonly T[], timeOf: (value: T) => number): T[] {
  return list
    .map((value, index) => ({ value, index, time: timeOf(value) }))
    .sort((a, b) => {
      if (Number.isNaN(a.time) && Number.isNaN(b.time)) return a.index - b.index;
      if (Number.isNaN(a.time)) return 1;
      if (Number.isNaN(b.time)) return -1;
      return a.time === b.time ? a.index - b.index : a.time - b.time;
    })
    .map((entry) => entry.value);
}

/** Builds the timeline: sessions by start time with the chat woven in by time. */
export function buildTimeline<B extends TimelineBlock>(
  blocks: readonly B[],
  messages: readonly AssistantMessageResponse[],
  options: TimelineOptions = {},
): TimelineEntry<B>[] {
  const sessions = byTime(
    blocks.map((block) => ({ block, ...sessionSpan(block) })),
    (s) => s.start,
  );

  // A message with no readable time is treated as the newest (it cannot be placed any better).
  const timed = messages
    .map((message) => {
      const time = parse(message.createdAt);
      return { message, time: Number.isNaN(time) ? Number.POSITIVE_INFINITY : time };
    })
    .filter(({ time }) => options.cutoff == null || time >= options.cutoff);
  const placeables: Placeable[] = byTime(timed, (m) => m.time);

  const pending = options.pending ?? null;
  if (pending !== null) {
    const newest = placeables.reduce((max, p) => Math.max(max, p.time), options.now ?? 0);
    placeables.push({ time: Number.isFinite(newest) ? newest : (options.now ?? 0), message: null });
  }

  // Each message belongs to the latest-starting session whose span holds it, else to the gap
  // after the sessions that started before it.
  const inSession = new Map<number, Placeable[]>();
  const inGap = new Map<number, Placeable[]>();
  for (const placeable of placeables) {
    let owner = -1;
    sessions.forEach((s, index) => {
      if (s.start <= placeable.time && placeable.time <= s.end) owner = index;
    });
    const bucket = owner >= 0 ? inSession : inGap;
    const slot = owner >= 0 ? owner : sessions.filter((s) => s.start <= placeable.time).length;
    const list = bucket.get(slot) ?? [];
    list.push(placeable);
    bucket.set(slot, list);
  }

  const entries: TimelineEntry<B>[] = [];
  const pushGap = (slot: number): void => {
    const run = inGap.get(slot);
    if (!run) return;
    const chatMessages = run.flatMap((p) => (p.message ? [p.message] : []));
    const hasPending = run.some((p) => !p.message);
    entries.push({
      kind: 'chat',
      key: `chat:${chatMessages[0]?.id ?? 'pending'}`,
      messages: chatMessages,
      pending: hasPending ? pending : null,
    });
  };

  pushGap(0);
  sessions.forEach(({ block }, index) => {
    const run = inSession.get(index);
    const merged = run
      ? {
          ...block,
          items: mergeChatIntoItems(block.items, run, pending ?? ''),
        }
      : block;
    entries.push({ kind: 'session', key: `session:${block.session.id}`, block: merged });
    pushGap(index + 1);
  });
  return entries;
}
