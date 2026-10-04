// Job Hunt in this browser, with the database's rules: only the owner (the
// stand-in's Jincheng) reads or writes, anyone gets the totals.

import { loadJSON, saveJSON } from '../../core/storage';
import { SocialError } from '../errors';
import { fieldsOf, further, JOB_STAGES, jobChangedElsewhere, LADDER, totalsOf, type JobApplication, type JobEvent, type JobReach, type JobsSocial } from '../jobs';
import type { LocalContext } from './context';

const JOBS_KEY = 'os-dev-jobs';
interface StoredJobs {
  applications: JobApplication[];
  events: JobEvent[];
}

export function localJobs({ owner }: LocalContext): JobsSocial {
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
        if (draft.id && !was) throw jobChangedElsewhere();
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
