// Job Hunt's part of the backend: Jincheng's applications and what Mail
// said about each (supabase/migrations/20260930062024_job_hunt.sql), which
// only Jincheng reads or writes, and the totals anyone may see. The
// Supabase side is supabase/jobs.ts, the stand-in's local/jobs.ts.

import { SocialError } from './errors';

export const JOB_STAGES = ['applied', 'assessment', 'interviewing', 'offer', 'closed'] as const;
export type JobStage = (typeof JOB_STAGES)[number];
/** The stages an application can get as far as (closing doesn't count). */
export type JobReach = Exclude<JobStage, 'closed'>;
export const JOB_OUTCOMES = ['rejected', 'withdrew', 'no_reply', 'declined'] as const;
export type JobOutcome = (typeof JOB_OUTCOMES)[number];
export type JobKind = 'applied' | 'assessment' | 'interview' | 'offer' | 'rejection' | 'withdrawal' | 'reminder' | 'other';

/** A company Jincheng applied to, for a role. */
export interface JobApplication {
  id: string;
  company: string;
  role: string;
  stage: JobStage;
  /** Why it closed, once it has. */
  outcome: JobOutcome | null;
  /** The furthest it got, which closing doesn't undo. */
  reached: JobReach;
  /** The day it was applied for (YYYY-MM-DD). */
  appliedOn: string;
  /** Where: Greenhouse, Lever, a referral… */
  source: string;
  location: string;
  /** The posting's address, or ''. */
  posting: string;
  notes: string;
  /** Counts saves: a save names the version it was made from. */
  version: number;
  created: string;
  updated: string;
}

/** A message Mail had about an application. */
export interface JobEvent {
  id: string;
  applicationId: string;
  kind: JobKind;
  /** When it came (ISO 8601). */
  at: string;
  subject: string;
  /** The Gmail thread it's in, to open it there. */
  thread: string | null;
}

/** An application as it's saved: `id` and `version` for one that's there. */
export type JobDraft = Pick<JobApplication, 'company' | 'role' | 'stage' | 'outcome' | 'appliedOn' | 'source' | 'location' | 'posting' | 'notes'> & {
  id?: string;
  version?: number;
};

/** What anyone may see of Job Hunt: how many are at each stage, and how far they got. */
export interface JobTotals {
  stages: Record<JobStage, number>;
  reached: Record<Exclude<JobReach, 'applied'>, number>;
  /** When anything last changed; null with nothing there. */
  updated: string | null;
}

export interface JobsSocial {
  /** How many applications are at each stage and how far they got. Anyone may ask; it names no company. */
  jobTotals: () => Promise<JobTotals>;
  /** Jincheng's applications and what Mail said about them; nothing for anyone else. */
  myJobs: () => Promise<{ applications: JobApplication[]; events: JobEvent[] }>;
  /** Adds one (no `id`), or saves one from `version`: refused ('conflict') if it was saved or deleted since. */
  saveJob: (draft: JobDraft) => Promise<JobApplication>;
  removeJob: (id: string) => Promise<void>;
}

/** Nothing there yet, or no database to ask: every stage at nought. */
export const EMPTY_TOTALS: JobTotals = {
  stages: { applied: 0, assessment: 0, interviewing: 0, offer: 0, closed: 0 },
  reached: { assessment: 0, interviewing: 0, offer: 0 },
  updated: null
};

/** The totals as the database answers them, whatever it leaves out. */
export function totalsOf(answer: unknown): JobTotals {
  const a = (answer && typeof answer === 'object' ? answer : {}) as { stages?: Record<string, unknown>; reached?: Record<string, unknown>; updated?: unknown };
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  return {
    stages: Object.fromEntries(JOB_STAGES.map((s) => [s, n(a.stages?.[s])])) as JobTotals['stages'],
    reached: { assessment: n(a.reached?.assessment), interviewing: n(a.reached?.interviewing), offer: n(a.reached?.offer) },
    updated: typeof a.updated === 'string' ? a.updated : null
  };
}

/** The stages along the way, in order (closing isn't along it). */
export const LADDER: JobReach[] = ['applied', 'assessment', 'interviewing', 'offer'];
/** The further of two stages along the way (closing isn't along it). */
export const further = (a: JobReach, b: JobStage): JobReach => (b !== 'closed' && LADDER.indexOf(b) > LADDER.indexOf(a) ? b : a);

/** An application's fields as the table names them, trimmed as both backends save them. */
export const fieldsOf = (draft: JobDraft) => ({
  company: draft.company.trim(),
  role: draft.role.trim(),
  stage: draft.stage,
  outcome: draft.stage === 'closed' ? draft.outcome : null,
  applied_on: draft.appliedOn,
  source: draft.source.trim(),
  location: draft.location.trim(),
  posting: draft.posting.trim(),
  notes: draft.notes
});

/** A save refused because another one landed first, or the application is gone. */
export const jobChangedElsewhere = () => new SocialError('conflict', 'It was changed or deleted somewhere else since this copy was opened.');
