/** Rows created during the week that starts on `weekStart` (a Monday, UTC, `YYYY-MM-DD`). */
export interface WeekCount {
  weekStart: string;
  count: number;
}

export interface StorySummary {
  id: string;
  projectId: string;
  title: string;
  status: string;
  priority: string;
  createdAt: string;
}

export interface SessionSummary {
  id: string;
  projectId: string;
  title: string;
  status: string;
  createdAt: string;
}

export interface BacklogOverview {
  total: number;
  /** Stories per status, every status present. */
  byStatus: Record<string, number>;
  /** Stories per priority, every priority present. */
  byPriority: Record<string, number>;
  storyPoints: { total: number; approved: number; unestimated: number };
  coverage: {
    live: number;
    withAcceptanceCriteria: number;
    withOrigin: number;
    linkedToCode: number;
  };
  createdByWeek: WeekCount[];
  /** The newest stories; empty on the organization overview. */
  recent: StorySummary[];
}

export interface DiscoveryOverview {
  sessions: number;
  byStatus: Record<string, number>;
  createdByWeek: WeekCount[];
  assistance: {
    accepted: number;
    dismissed: number;
    pending: number;
    questions: number;
    /** Accepted share of the decided proposals (0 to 1); null until one is decided. */
    acceptanceRate: number | null;
  };
  recent: SessionSummary[];
}

/** A figure is null when the caller may not read that part of the project. */
export interface KnowledgeOverview {
  glossaryTerms: number | null;
  constraints: number | null;
  documents: number | null;
  assignedMembers: number | null;
}

export interface CodeOverview {
  repositories: number;
  ready: number;
  failed: number;
  modules: number;
  files: number;
  lastIndexedAt: string | null;
}

/** A section is null when the caller's project permissions do not let them read it. */
export interface ProjectOverviewResponse {
  generatedAt: string;
  weeks: number;
  backlog: BacklogOverview | null;
  discovery: DiscoveryOverview | null;
  knowledge: KnowledgeOverview | null;
  code: CodeOverview | null;
}

export interface MembersOverview {
  active: number;
  pending: number;
  byRole: Record<string, number>;
}

export interface TopProject {
  projectId: string;
  name: string;
  demo: boolean;
  stories: number;
  sessions: number;
  lastActivityAt: string | null;
}

export interface OrganizationOverviewResponse {
  generatedAt: string;
  weeks: number;
  projects: number;
  /** Null unless the caller is an owner or admin. */
  members: MembersOverview | null;
  backlog: BacklogOverview;
  discovery: DiscoveryOverview;
  topProjects: TopProject[];
  code: CodeOverview;
}
