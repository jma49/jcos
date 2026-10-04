import { afterEach, describe, expect, test, vi } from 'vitest';
import type { JobDraft } from '../jobs';
import { backends, OWNER, type Backend } from './backends';

// Job Hunt, the same on both backends: the applications are the owner's
// alone, anyone gets the totals, a company and role are kept once, and a
// save from an older copy is refused.

afterEach(() => {
  vi.unstubAllGlobals();
});

const acme: JobDraft = {
  company: 'Acme',
  role: 'Engineer',
  stage: 'applied',
  outcome: null,
  appliedOn: '2026-10-01',
  source: 'Greenhouse',
  location: 'Remote',
  posting: '',
  notes: ''
};
const jobRow = (id: string, version = 1, more = {}) => ({
  id,
  company: 'Acme',
  role: 'Engineer',
  stage: 'applied',
  outcome: null,
  reached: 'applied',
  applied_on: '2026-10-01',
  source: 'Greenhouse',
  location: 'Remote',
  posting: '',
  notes: '',
  version,
  created_at: '2026-10-02T10:00:00Z',
  updated_at: '2026-10-02T10:00:00Z',
  ...more
});

describe.each(backends)('jobs: $name', ({ make }) => {
  let b: Backend;

  test('anyone gets the totals, which name no company', async () => {
    b = make();
    const totals = await b.social.jobTotals();
    expect(totals.stages.applied).toBe(0);
    expect(JSON.stringify(totals)).not.toContain('Acme');
  });

  test('the applications are the owner’s alone', async () => {
    b = make();
    await expect(b.social.myJobs()).rejects.toMatchObject({ reason: 'signed-out' });
    await b.signUp('alice');
    // Row-level security gives anyone else nothing to read, and refuses a write.
    expect(await b.social.myJobs()).toEqual({ applications: [], events: [] });
    await b.given({ supabase: (db) => db.refuse('job_applications.insert', '42501') });
    await expect(b.social.saveJob(acme)).rejects.toMatchObject({ reason: 'failed', message: 'Only Jincheng can change Job Hunt.' });
  });

  test('a company and role are kept once, and a save names its version', async () => {
    b = make();
    await b.signUp(OWNER);
    await b.given({
      supabase: (db) => {
        db.answer('job_applications.insert', { data: jobRow('j') });
        db.refuse('job_applications.insert', '23505');
      }
    });
    const made = await b.social.saveJob(acme);
    await expect(b.social.saveJob({ ...acme, company: 'ACME', role: 'engineer' })).rejects.toMatchObject({ reason: 'already' });
    await b.given({ supabase: (db) => db.answer('job_applications.update', { data: jobRow(made.id, 2, { stage: 'interviewing', reached: 'interviewing' }) }) });
    const moved = await b.social.saveJob({ ...acme, id: made.id, version: 1, stage: 'interviewing' });
    expect([moved.stage, moved.reached, moved.version]).toEqual(['interviewing', 'interviewing', 2]);
    if (b.db) expect(b.db.last('job_applications')?.filters).toContainEqual(['eq', 'version', 1]);
    await expect(b.social.saveJob({ ...acme, id: made.id, version: 1 })).rejects.toMatchObject({ reason: 'conflict' });
  });
});
