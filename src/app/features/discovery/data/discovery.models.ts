/** Mirrors the discovery REST + realtime contracts (backend discovery context). */

export type SessionStatus =
  | 'DRAFT'
  | 'RECORDING'
  | 'PAUSED'
  | 'STOPPED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED';

export interface DiscoverySessionResponse {
  id: string;
  projectId: string;
  title: string;
  language: string;
  status: SessionStatus;
  startedAt: string | null;
  endedAt: string | null;
  audioDurationMs: number;
  processingError: string | null;
  createdAt: string;
  updatedAt: string;
  // Per-session stats being added by a parallel backend branch — absent on older
  // deployments, so every consumer must degrade gracefully when undefined.
  storiesGeneratedCount?: number | null;
  storiesAcceptedCount?: number | null;
  pendingSuggestionsCount?: number | null;
  questionsCount?: number | null;
}

/** Raw transcript of a session (GET /sessions/{id}/transcript; large text kept off the session resource). */
export interface TranscriptResponse {
  sessionId: string;
  transcript: string | null;
}

/**
 * A persisted final transcript segment (GET /sessions/{id}/segments), used to
 * replay a historical session's conversation as timestamped bubbles. Added by a
 * parallel backend branch — consumers must degrade gracefully when the endpoint
 * is absent (404) and fall back to the joined transcript string.
 */
export interface SessionSegmentResponse {
  sequence: number;
  text: string;
  speakerLabel: string | null;
  startMs: number;
  endMs: number;
  /** Wall-clock time the segment was recorded (ISO 8601). */
  occurredAt: string;
}

/**
 * A cursor page of segments (GET /sessions/{id}/segments?beforeSequence&limit).
 * The backend shape is still settling — it may return a bare array, an object
 * with a `hasMore` flag, or a full {@link PageResponse}. Consumers normalize
 * every shape through {@link normalizeSegmentPage} in feed.ts.
 */
export interface SegmentPage {
  /** Up to `limit` final segments with sequence < beforeSequence, ascending. */
  segments: SessionSegmentResponse[];
  /** Whether older segments remain before the returned chunk. */
  hasMore: boolean;
}

export interface CreateDiscoverySessionRequest {
  title: string;
  language: string;
}

/** Backlog priority accepted by the manual story-create endpoint. */
export type StoryPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** Sortable columns of the project backlog (POST params on the list endpoint). */
export type StorySort = 'createdAt' | 'title' | 'priority' | 'status';

/** Sort direction accepted by the project backlog list endpoint. */
export type StorySortDirection = 'ASC' | 'DESC';

/** The review statuses the backend filters stories by (list endpoint `status` param). */
export type StoryStatus = 'DRAFT' | 'APPROVED' | 'REJECTED' | 'MERGED' | 'EXPORTED';

/** Request body to manually create a user story (POST /projects/{projectId}/stories). */
export interface CreateUserStoryRequest {
  title: string;
  role: string;
  action: string;
  benefit: string;
  priority: StoryPriority;
  /** Optional effort estimate; omit for none. */
  storyPoints?: number | null;
}

/**
 * Request body to edit an existing story's core fields (PUT
 * /projects/{projectId}/stories/{storyId}). Same shape as create.
 */
export type UpdateUserStoryRequest = CreateUserStoryRequest;

/**
 * Optional server-side filters for the project backlog list endpoint. Every field
 * is optional; an omitted one leaves that dimension unrestricted. `createdAfter`
 * is inclusive, `createdBefore` exclusive — both ISO-8601 instants.
 */
export interface StoryListFilters {
  page?: number;
  size?: number;
  sortBy?: StorySort;
  sortDirection?: StorySortDirection;
  search?: string;
  status?: StoryStatus;
  priority?: StoryPriority;
  createdAfter?: string;
  createdBefore?: string;
}

/** Body for the backlog batch-delete (POST /stories/batch-delete): the story ids to remove. */
export interface BatchDeleteStoriesRequest {
  storyIds: string[];
}

/** Result of a batch delete: how many stories were actually removed. */
export interface BatchDeleteStoriesResult {
  deleted: number;
}

/**
 * A persisted acceptance criterion resource (criteria REST). Carries its own `id`
 * so the detail/edit page can PUT/DELETE it individually — unlike the display-only
 * {@link AcceptanceCriterion} used for suggestion previews and side-panel cards.
 */
export interface AcceptanceCriterionResponse {
  id: string;
  storyId: string;
  scenario: string | null;
  given: string;
  when: string;
  then: string;
  createdAt: string | null;
  updatedAt: string | null;
}

/**
 * Request body to add/replace an acceptance criterion (POST/PUT
 * /stories/{storyId}/criteria). `scenario` is optional (null clears it on update).
 */
export interface AcceptanceCriterionRequest {
  scenario?: string | null;
  given: string;
  when: string;
  then: string;
}

/** A generated/backlog user story (REST), normalized for display alongside live ones. */
export interface UserStoryResponse {
  id: string;
  projectId: string;
  sessionId: string | null;
  title: string;
  role: string;
  action: string;
  benefit: string;
  priority: string;
  storyPoints: number | null;
  status: string;
  /** When the story was created (ISO 8601); optional on older backends. */
  createdAt?: string | null;
  /** When the story was last updated (ISO 8601); optional on older backends. */
  updatedAt?: string | null;
  /**
   * The story's Given/When/Then acceptance criteria; absent on older backends.
   * Each item may be a persisted {@link AcceptanceCriterionResponse} (carries an
   * `id`, from the story detail endpoint) or a bare display {@link AcceptanceCriterion}
   * (from realtime/older payloads) — consumers that need the id must narrow.
   */
  acceptanceCriteria?: (AcceptanceCriterionResponse | AcceptanceCriterion)[] | null;
}

export interface ProcessTranscriptResponse {
  session: DiscoverySessionResponse;
  stories: UserStoryResponse[];
}

/** Unified story shape the chat renders (fed by both REST and STORY_GENERATED events). */
export interface DisplayStory {
  id: string;
  title: string;
  role: string;
  action: string;
  benefit: string;
  priority: string;
  storyPoints: number | null;
  /**
   * When the story was generated (ISO 8601); used to place it chronologically in
   * the feed. Null when the source (older REST payloads) carried no timestamp.
   */
  createdAt?: string | null;
  /**
   * The story's Given/When/Then acceptance criteria, shown in the side panel's
   * expanded story card. Empty when the source carried none (STORY_GENERATED
   * events, older REST payloads).
   */
  acceptanceCriteria: AcceptanceCriterion[];
}

export interface PageResponse<T> {
  content: T[];
  page: {
    number: number;
    size: number;
    totalElements: number;
    totalPages: number;
    first: boolean;
    last: boolean;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

// ---- AI suggestions (review flow) ----

export type SuggestionType = 'NEW_STORY' | 'UPDATE_STORY' | 'EDGE_CASE' | 'CLARIFYING_QUESTION';
export type SuggestionStatus = 'PENDING' | 'ACCEPTED' | 'DISMISSED';
export type SuggestionPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface SuggestionResponse {
  id: string;
  sessionId: string;
  projectId: string;
  type: SuggestionType;
  status: SuggestionStatus;
  draftTitle: string | null;
  draftRole: string | null;
  draftAction: string | null;
  draftBenefit: string | null;
  draftPriority: SuggestionPriority | null;
  draftStoryPoints: number | null;
  relatedTopic: string | null;
  targetStoryId: string | null;
  question: string | null;
  resolvedStoryId: string | null;
  createdAt: string;
  updatedAt: string;
  /**
   * When the suggestion was accepted/dismissed. Being added by a parallel backend
   * branch; absent on older deployments, so consumers fall back to `updatedAt`.
   */
  resolvedAt?: string | null;
  /**
   * Proposed acceptance criteria (NEW_STORY) or the scenario/criterion to add
   * (EDGE_CASE), previewed on the card. Each item is a structured Given/When/Then
   * with an optional scenario heading. Absent on older deployments and the shape
   * may still be settling on a parallel backend branch, so normalize through
   * {@link suggestionCriteria} before rendering.
   */
  draftAcceptanceCriteria?: AcceptanceCriterion[] | null;
}

/** A structured acceptance criterion: Given/When/Then plus an optional scenario heading. */
export interface AcceptanceCriterion {
  scenario?: string | null;
  given: string;
  when: string;
  then: string;
}

/**
 * Defensively coerces a suggestion's proposed criteria into a clean list. Tolerates
 * an absent/null value or malformed entries, keeping only items whose given/when/then
 * are all non-empty (trimmed); the optional scenario is preserved when present.
 */
export function suggestionCriteria(
  raw: AcceptanceCriterion[] | null | undefined,
): AcceptanceCriterion[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is AcceptanceCriterion => !!c && typeof c === 'object')
    .map((c) => ({
      scenario: typeof c.scenario === 'string' && c.scenario.trim() ? c.scenario.trim() : null,
      given: typeof c.given === 'string' ? c.given.trim() : '',
      when: typeof c.when === 'string' ? c.when.trim() : '',
      then: typeof c.then === 'string' ? c.then.trim() : '',
    }))
    .filter((c) => c.given.length > 0 && c.when.length > 0 && c.then.length > 0);
}

/**
 * Accept payload; every field optional — omitted/null keeps the original draft.
 *
 * The flat `edited*` fields are the shape today's backend reads. A parallel
 * backend branch is teaching accept to persist edited acceptance criteria too:
 * we send `editedAcceptanceCriteria` alongside the flat fields so a newer
 * backend picks it up while an older one simply ignores the unknown property
 * and still commits the flat edits. See {@link editableToAcceptRequest}.
 */
export interface AcceptSuggestionRequest {
  editedTitle?: string;
  editedRole?: string;
  editedAction?: string;
  editedBenefit?: string;
  editedPriority?: SuggestionPriority;
  editedStoryPoints?: number;
  /** Edited Given/When/Then criteria (NEW_STORY list, or the EDGE_CASE single criterion). */
  editedAcceptanceCriteria?: AcceptanceCriterion[];
}

/**
 * An editable acceptance criterion in the card's inline form. Unlike the
 * validated {@link AcceptanceCriterion}, every field may be blank while the
 * analyst is typing; blanks are pruned when the payload is built.
 */
export interface EditableCriterion {
  scenario: string;
  given: string;
  when: string;
  then: string;
}

/** The card's editable model for a story-shaped suggestion (NEW_STORY / UPDATE_STORY / EDGE_CASE). */
export interface EditableSuggestion {
  title: string;
  role: string;
  action: string;
  benefit: string;
  priority: SuggestionPriority;
  storyPoints: number | null;
  criteria: EditableCriterion[];
}

/** An empty, ready-to-fill editable criterion row. */
export function emptyEditableCriterion(): EditableCriterion {
  return { scenario: '', given: '', when: '', then: '' };
}

/**
 * Seeds the inline edit form from a suggestion's draft. For EDGE_CASE the four
 * Given/When/Then fields live in `draftAcceptanceCriteria[0]` (parallel backend
 * branch); on an older backend that carried the edge case in the plain draft
 * fields there is no criterion, so the criteria list starts with one empty row
 * for the analyst to fill.
 */
export function draftToEditable(suggestion: SuggestionResponse): EditableSuggestion {
  const criteria = suggestionCriteria(suggestion.draftAcceptanceCriteria).map((c) => ({
    scenario: c.scenario ?? '',
    given: c.given,
    when: c.when,
    then: c.then,
  }));
  if (suggestion.type === 'EDGE_CASE' && criteria.length === 0) {
    criteria.push(emptyEditableCriterion());
  }
  return {
    title: suggestion.draftTitle ?? '',
    role: suggestion.draftRole ?? '',
    action: suggestion.draftAction ?? '',
    benefit: suggestion.draftBenefit ?? '',
    priority: suggestion.draftPriority ?? 'MEDIUM',
    storyPoints: suggestion.draftStoryPoints,
    criteria,
  };
}

/** Trims an editable criterion and reports whether all three G/W/T parts are present. */
function cleanCriterion(c: EditableCriterion): AcceptanceCriterion | null {
  const scenario = c.scenario.trim();
  const given = c.given.trim();
  const when = c.when.trim();
  const then = c.then.trim();
  if (!given || !when || !then) return null;
  return { scenario: scenario || null, given, when, then };
}

/**
 * Maps the card's edited model into an {@link AcceptSuggestionRequest}. Only
 * fields that differ from the original draft are sent (an omitted field keeps
 * the draft server-side); empty strings are dropped rather than overwriting a
 * draft with blank. For EDGE_CASE the single edited criterion is ALSO projected
 * onto the flat `edited*` fields the current backend composes its Gherkin line
 * from (scenario→title, given→role, when→action, then→benefit), so the edit
 * takes effect even before the richer backend ships.
 */
export function editableToAcceptRequest(
  suggestion: SuggestionResponse,
  edited: EditableSuggestion,
): AcceptSuggestionRequest {
  const request: AcceptSuggestionRequest = {};
  const put = (
    key: 'editedTitle' | 'editedRole' | 'editedAction' | 'editedBenefit',
    value: string,
    original: string | null,
  ): void => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== (original ?? '')) request[key] = trimmed;
  };

  if (suggestion.type === 'EDGE_CASE') {
    const first = edited.criteria[0] ?? emptyEditableCriterion();
    // Project the edited criterion onto the flat fields the current backend
    // reads (scenario/given/when/then) AND send it structured for the new one.
    put('editedTitle', first.scenario, suggestion.draftTitle);
    put('editedRole', first.given, suggestion.draftRole);
    put('editedAction', first.when, suggestion.draftAction);
    put('editedBenefit', first.then, suggestion.draftBenefit);
    const criterion = cleanCriterion(first);
    if (criterion) request.editedAcceptanceCriteria = [criterion];
    return request;
  }

  put('editedTitle', edited.title, suggestion.draftTitle);
  put('editedRole', edited.role, suggestion.draftRole);
  put('editedAction', edited.action, suggestion.draftAction);
  put('editedBenefit', edited.benefit, suggestion.draftBenefit);
  if (edited.priority !== (suggestion.draftPriority ?? 'MEDIUM')) {
    request.editedPriority = edited.priority;
  }
  if (edited.storyPoints != null && edited.storyPoints !== suggestion.draftStoryPoints) {
    request.editedStoryPoints = edited.storyPoints;
  }
  // NEW_STORY and UPDATE_STORY both carry an editable criteria list (the
  // product owner confirmed UPDATE_STORY edits content AND its criteria).
  if (suggestion.type === 'NEW_STORY' || suggestion.type === 'UPDATE_STORY') {
    const criteria = edited.criteria
      .map(cleanCriterion)
      .filter((c): c is AcceptanceCriterion => c !== null);
    if (criteria.length > 0) request.editedAcceptanceCriteria = criteria;
  }
  return request;
}

// ---- Realtime (STOMP topic /topic/sessions/{id}) ----

export type SessionEventType =
  | 'RECORDING_STARTED'
  | 'RECORDING_PAUSED'
  | 'RECORDING_RESUMED'
  | 'RECORDING_STOPPED'
  | 'SESSION_RESET'
  | 'TRANSCRIPT_SEGMENT'
  | 'TRANSCRIPT_UPLOADED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'STORY_GENERATED'
  | 'SUGGESTION_GENERATED'
  | 'SUGGESTION_ACCEPTED'
  | 'SUGGESTION_DISMISSED'
  | 'PRESENCE_STATE';

interface SessionRealtimeBase {
  sessionId: string;
  type: SessionEventType;
  occurredAt: string;
}

export interface SessionTranscriptSegmentMessage extends SessionRealtimeBase {
  type: 'TRANSCRIPT_SEGMENT';
  sequence: number;
  speakerLabel: string | null;
  text: string;
  startMs: number;
  endMs: number;
  isFinal: boolean;
}

export interface SessionStoryGeneratedMessage extends SessionRealtimeBase {
  type: 'STORY_GENERATED';
  storyId: string;
  title: string;
  role: string;
  action: string;
  benefit: string;
  priority: string;
  storyPoints: number | null;
}

export interface SessionProcessingFailedMessage extends SessionRealtimeBase {
  type: 'FAILED';
  reason: string;
}

export interface SessionSuggestionMessage extends SessionRealtimeBase {
  type: 'SUGGESTION_GENERATED' | 'SUGGESTION_ACCEPTED' | 'SUGGESTION_DISMISSED';
  suggestionId: string;
  suggestionType: SuggestionType;
  status: SuggestionStatus;
  draftTitle: string | null;
  draftRole: string | null;
  draftAction: string | null;
  draftBenefit: string | null;
  draftPriority: SuggestionPriority | null;
  draftStoryPoints: number | null;
  relatedTopic: string | null;
  targetStoryId: string | null;
  question: string | null;
  resolvedStoryId: string | null;
  /** Proposed acceptance criteria; see {@link SuggestionResponse.draftAcceptanceCriteria}. */
  draftAcceptanceCriteria?: AcceptanceCriterion[] | null;
}

/** One user currently viewing a live session, carried by {@link SessionPresenceMessage}. */
export interface SessionParticipant {
  userId: string;
  displayName: string;
  /** Public avatar serve path, loadable directly by an `<img>` (no bearer token needed). */
  avatarUrl: string;
}

/**
 * Roster snapshot of who is currently viewing a live session. A full snapshot (not a delta), so it
 * renders idempotently; `count` is the number of distinct participants (a user on two tabs counts
 * once). Travels on the same per-session topic as every other session event.
 */
export interface SessionPresenceMessage extends SessionRealtimeBase {
  type: 'PRESENCE_STATE';
  participants: SessionParticipant[];
  count: number;
}

export type SessionRealtimeMessage =
  | SessionRealtimeBase
  | SessionTranscriptSegmentMessage
  | SessionStoryGeneratedMessage
  | SessionProcessingFailedMessage
  | SessionSuggestionMessage
  | SessionPresenceMessage;

// ---- Realtime (project-level lifecycle topic /topic/projects/{id}) ----

/**
 * A session lifecycle event broadcast on the project topic, so every project
 * member learns about sessions started/stopped by others without polling.
 * Being added by a parallel backend branch — consumers must subscribe
 * defensively: the topic may not exist yet, and any field besides `sessionId`
 * may be absent on older payloads.
 */
export interface ProjectSessionLifecycleMessage {
  sessionId: string;
  status?: SessionStatus | string | null;
  title?: string | null;
  language?: string | null;
  startedAt?: string | null;
}
