/** Where a story comes from in the meetings (GET /projects/{projectId}/stories/{storyId}/sources, US72). */

/**
 * `SESSION`: the story has fragments of a meeting. `UNAVAILABLE`: it was generated in a session but no
 * fragment was kept (a story from before fragments were stored). `MANUAL`: it does not come from a session.
 */
type StorySourceOrigin = 'SESSION' | 'UNAVAILABLE' | 'MANUAL';

/** One fragment of a meeting the story comes from, with the moment it was said. */
export interface StorySourceFragmentResponse {
  id: string;
  sessionId: string;
  /** Null when the session no longer exists. */
  sessionTitle: string | null;
  /** When the session started (ISO 8601); null when the session no longer exists. */
  sessionStartedAt: string | null;
  /** The verbatim fragment of the conversation the story is based on. */
  quote: string;
  /** The transcript text of the segments the quote runs across; null when it was not located. */
  transcriptText: string | null;
  startSequence: number | null;
  endSequence: number | null;
  /** Offset (ms) from the start of the recording where the fragment begins; null when not located. */
  startMs: number | null;
  /** Offset (ms) from the start of the recording where the fragment ends; null when not located. */
  endMs: number | null;
  /** Wall-clock instant the fragment was said (ISO 8601); null when not located. */
  occurredAt: string | null;
  /** The name the analyst gave the speaker, or "Hablante N"; null when the transcript has no speakers. */
  speakerName: string | null;
}

export interface StorySourcesResponse {
  storyId: string;
  origin: StorySourceOrigin;
  /** The session the story was generated in; only set for `UNAVAILABLE`. */
  sessionId: string | null;
  sessionTitle: string | null;
  sessionStartedAt: string | null;
  /** Oldest first; empty unless `SESSION`. */
  fragments: StorySourceFragmentResponse[];
}
