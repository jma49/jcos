// Job Hunt's part of the backend: Jincheng's applications and what Mail
// said about each (supabase/migrations/20260930062024_job_hunt.sql), which
// only Jincheng reads or writes, and the totals anyone may see. Kept here
// as one slice with its types, the Supabase side and the stand-in's, rather
// than spread through types.ts, supabase.ts and local.ts; both backends
// spread it into what getSocial() returns.

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '../../lib/database.types';
import { loadJSON, saveJSON } from '../core/storage';
import { SocialError, type Account } from './types';

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

const LADDER: JobReach[] = ['applied', 'assessment', 'interviewing', 'offer'];
/** The further of two stages along the way (closing isn't along it). */
const further = (a: JobReach, b: JobStage): JobReach => (b !== 'closed' && LADDER.indexOf(b) > LADDER.indexOf(a) ? b : a);

// ---------- Supabase ----------

const JOB_COLUMNS = 'id,company,role,stage,outcome,reached,applied_on,source,location,posting,notes,version,created_at,updated_at';
const EVENT_COLUMNS = 'id,application_id,kind,happened_at,subject,gmail_thread';

// The rows as the generated types have them (src/lib/database.types.ts).
// The stage, outcome, reach and kind are text there; the tables' checks
// hold them to the names above, so they're narrowed here.
type JobRow = Pick<
  Tables<'job_applications'>,
  'id' | 'company' | 'role' | 'stage' | 'outcome' | 'reached' | 'applied_on' | 'source' | 'location' | 'posting' | 'notes' | 'version' | 'created_at' | 'updated_at'
>;

type EventRow = Pick<Tables<'job_events'>, 'id' | 'application_id' | 'kind' | 'happened_at' | 'subject' | 'gmail_thread'>;

const jobOf = (row: JobRow): JobApplication => ({
  id: row.id,
  company: row.company,
  role: row.role,
  stage: row.stage as JobStage,
  outcome: row.outcome as JobOutcome | null,
  reached: row.reached as JobReach,
  appliedOn: row.applied_on,
  source: row.source,
  location: row.location,
  posting: row.posting,
  notes: row.notes,
  version: row.version,
  created: row.created_at,
  updated: row.updated_at
});

const eventOf = (row: EventRow): JobEvent => ({
  id: row.id,
  applicationId: row.application_id,
  kind: row.kind as JobKind,
  at: row.happened_at,
  subject: row.subject,
  thread: row.gmail_thread
});

const fieldsOf = (draft: JobDraft) => ({
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

const changedElsewhere = () => new SocialError('conflict', 'It was changed or deleted somewhere else since this copy was opened.');

/** Job Hunt over Supabase: `member` is the signed-in member (or a refusal), `refusal` how the backend words a database error. */
export function supabaseJobs(client: SupabaseClient<Database>, member: () => Account, refusal: (error: PostgrestError) => SocialError): JobsSocial {
  return {
    async jobTotals() {
      const { data, error } = await client.rpc('job_hunt_totals');
      if (error) throw refusal(error);
      return totalsOf(data);
    },

    async myJobs() {
      member();
      const [applications, events] = await Promise.all([
        client.from('job_applications').select(JOB_COLUMNS).order('applied_on', { ascending: false }).order('company'),
        client.from('job_events').select(EVENT_COLUMNS).order('happened_at')
      ]);
      if (applications.error) throw refusal(applications.error);
      if (events.error) throw refusal(events.error);
      return {
        applications: applications.data.map(jobOf),
        events: events.data.map(eventOf)
      };
    },

    // A save names the version it was made from, so one from an older copy
    // reaches no row and is refused rather than overwriting what's newer.
    async saveJob(draft) {
      member();
      const request = draft.id
        ? client.from('job_applications').update(fieldsOf(draft)).eq('id', draft.id).eq('version', draft.version ?? 0).select(JOB_COLUMNS).maybeSingle()
        : client.from('job_applications').insert(fieldsOf(draft)).select(JOB_COLUMNS).single();
      const { data, error } = await request;
      if (error) {
        if (error.code === '23505') throw new SocialError('already', `There’s already “${draft.company}” for that role.`);
        throw refusal(error);
      }
      if (!data) throw changedElsewhere();
      return jobOf(data);
    },

    async removeJob(id) {
      member();
      const { error } = await client.from('job_applications').delete().eq('id', id);
      if (error) throw refusal(error);
    }
  };
}

// ---------- The stand-in (astro dev) ----------

const JOBS_KEY = 'os-dev-jobs';
interface StoredJobs {
  applications: JobApplication[];
  events: JobEvent[];
}

/**
 * Job Hunt in this browser, with the database's rules: only `owner` (the
 * stand-in's Jincheng) reads or writes, anyone gets the totals.
 */
export function localJobs(owner: (what: string) => void): JobsSocial {
  const stored = () => loadJSON<StoredJobs>(JOBS_KEY, { applications: [], events: [] });
  const change = <T,>(write: (jobs: StoredJobs) => T): T => {
    const jobs = stored();
    const result = write(jobs);
    saveJSON(JOBS_KEY, jobs);
    return result;
  };
  return {
    async jobTotals() {
      const { applications } = stored();
      const at = (stage: JobReach) => applications.filter((a) => LADDER.indexOf(a.reached) >= LADDER.indexOf(stage)).length;
      return totalsOf({
        stages: Object.fromEntries(JOB_STAGES.map((s) => [s, applications.filter((a) => a.stage === s).length])),
        reached: { assessment: at('assessment'), interviewing: at('interviewing'), offer: at('offer') },
        updated: applications.reduce<string | null>((latest, a) => (!latest || a.updated > latest ? a.updated : latest), null)
      });
    },

    async myJobs() {
      owner('Job Hunt');
      return stored();
    },

    async saveJob(draft) {
      owner('Job Hunt');
      const fields = fieldsOf(draft);
      if (!fields.company || fields.company.length > 120 || /[\u0000-\u001f\u007f]/.test(fields.company) || fields.role.length > 160) {
        throw new SocialError('invalid', 'A company is one line of at most 120 characters, and a role at most 160.');
      }
      if (fields.posting && !/^https?:\/\/\S+$/.test(fields.posting)) throw new SocialError('invalid', 'A posting is a web address.');
      return change((jobs) => {
        const pair = (a: JobApplication) => a.company.toLowerCase() === fields.company.toLowerCase() && a.role.toLowerCase() === fields.role.toLowerCase();
        if (jobs.applications.some((a) => a.id !== draft.id && pair(a))) throw new SocialError('already', `There’s already “${fields.company}” for that role.`);
        const now = new Date().toISOString();
        const was = draft.id ? jobs.applications.find((a) => a.id === draft.id && a.version === draft.version) : undefined;
        if (draft.id && !was) throw changedElsewhere();
        const saved: JobApplication = {
          id: was?.id ?? crypto.randomUUID(),
          company: fields.company,
          role: fields.role,
          stage: fields.stage,
          outcome: fields.outcome,
          reached: further(was?.reached ?? 'applied', fields.stage),
          appliedOn: fields.applied_on,
          source: fields.source,
          location: fields.location,
          posting: fields.posting,
          notes: fields.notes,
          version: (was?.version ?? 0) + 1,
          created: was?.created ?? now,
          updated: now
        };
        jobs.applications = [...jobs.applications.filter((a) => a.id !== saved.id), saved];
        return saved;
      });
    },

    async removeJob(id) {
      owner('Job Hunt');
      change((jobs) => {
        jobs.applications = jobs.applications.filter((a) => a.id !== id);
        jobs.events = jobs.events.filter((e) => e.applicationId !== id);
      });
    }
  };
}
