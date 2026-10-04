// Job Hunt in public.job_applications and public.job_events, which only
// the owner reads or writes, and job_hunt_totals(), which anyone may ask.

import type { Tables } from '../../../lib/database.types';
import { SocialError } from '../errors';
import {
  fieldsOf,
  jobChangedElsewhere,
  totalsOf,
  type JobApplication,
  type JobEvent,
  type JobKind,
  type JobOutcome,
  type JobReach,
  type JobsSocial,
  type JobStage
} from '../jobs';
import { notOwner, refusal, type SupabaseContext } from './context';

const JOB_COLUMNS = 'id,company,role,stage,outcome,reached,applied_on,source,location,posting,notes,version,created_at,updated_at';
const EVENT_COLUMNS = 'id,application_id,kind,happened_at,subject,gmail_thread';

// The rows as the generated types have them (src/lib/database.types.ts).
// The stage, outcome, reach and kind are text there; the tables' checks
// hold them to the names in jobs.ts, so they're narrowed here.
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

export function supabaseJobs({ client, member }: SupabaseContext): JobsSocial {
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
        if (error.code === '42501') throw notOwner('Job Hunt');
        if (error.code === '23505') throw new SocialError('already', `There’s already “${draft.company}” for that role.`);
        throw refusal(error);
      }
      if (!data) throw jobChangedElsewhere();
      return jobOf(data);
    },

    async removeJob(id) {
      member();
      const { error } = await client.from('job_applications').delete().eq('id', id);
      if (error) throw error.code === '42501' ? notOwner('Job Hunt') : refusal(error);
    }
  };
}
