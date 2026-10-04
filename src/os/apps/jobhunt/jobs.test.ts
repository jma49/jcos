import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { JobApplication, JobEvent, JobTotals } from '../../social/jobs';

// Job Hunt's data (jobs.ts): the days, what the board shows, and the store,
// which reads Jincheng's applications for Jincheng and only the totals for
// anyone else, shows a change at once and takes it back if refused.

const backend = vi.hoisted(() => ({ social: null as null | Record<string, (...args: never[]) => unknown> }));
vi.mock('../../social/social', () => ({ getSocial: async () => backend.social }));

const job = (id: string, more: Partial<JobApplication> = {}): JobApplication => ({
  id,
  company: id,
  role: 'Software Engineer',
  stage: 'applied',
  outcome: null,
  reached: 'applied',
  appliedOn: '2026-09-10',
  source: 'Greenhouse',
  location: '',
  posting: '',
  notes: '',
  version: 1,
  created: '2026-09-10T10:00:00Z',
  updated: '2026-09-10T10:00:00Z',
  ...more
});
const heard = (applicationId: string, kind: JobEvent['kind'], at: string): JobEvent => ({
  id: `${applicationId}-${kind}-${at}`,
  applicationId,
  kind,
  at,
  subject: '',
  thread: null
});
const TOTALS: JobTotals = {
  stages: { applied: 3, assessment: 1, interviewing: 1, offer: 0, closed: 2 },
  reached: { assessment: 3, interviewing: 1, offer: 0 },
  updated: '2026-09-29T10:00:00Z'
};

/** A backend with Jincheng's applications, which keeps what's saved and which a test can slow down or make refuse. */
function database(applications: JobApplication[], events: JobEvent[] = []) {
  const answer = {
    applications: structuredClone(applications),
    events: structuredClone(events),
    wait: Promise.resolve(),
    saving: Promise.resolve(),
    refuse: false
  };
  const social = {
    jobTotals: vi.fn(async () => {
      await answer.wait;
      return structuredClone(TOTALS);
    }),
    myJobs: vi.fn(async () => {
      const read = { applications: structuredClone(answer.applications), events: structuredClone(answer.events) };
      await answer.wait;
      return read;
    }),
    saveJob: vi.fn(async (draft: JobApplication) => {
      await answer.saving;
      if (answer.refuse) throw new Error('refused');
      const saved = { ...job(draft.id ?? 'new'), ...draft, id: draft.id ?? 'new', version: (draft.version ?? 0) + 1 };
      answer.applications = [...answer.applications.filter((a) => a.id !== saved.id), saved];
      return structuredClone(saved);
    }),
    removeJob: vi.fn(async (id: string) => {
      answer.applications = answer.applications.filter((a) => a.id !== id);
      answer.events = answer.events.filter((e) => e.applicationId !== id);
    })
  };
  backend.social = social as never;
  return { social, answer };
}

const load = async () => {
  vi.resetModules();
  return import('./jobs');
};

beforeEach(() => {
  backend.social = null;
  vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} });
});
afterEach(() => vi.unstubAllGlobals());

describe('days', () => {
  test('counts whole days, and names a day short, with the year when it isn’t this one', async () => {
    const { daysBetween, shortDay, today } = await load();
    expect(today(new Date(2026, 8, 29, 23, 30))).toBe('2026-09-29');
    expect(daysBetween('2026-09-10', '2026-09-29')).toBe(19);
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(shortDay('2026-09-26', '2026-09-29')).toBe('Sep 26');
    expect(shortDay('2025-12-24', '2026-09-29')).toBe('Dec 24, 2025');
  });
});

describe('the board', () => {
  test('each stage’s column puts what moved last first', async () => {
    const { columns, eventsBy } = await load();
    const apps = [job('old'), job('new', { updated: '2026-09-20T10:00:00Z' }), job('heard'), job('far', { stage: 'offer' })];
    const by = eventsBy([heard('heard', 'applied', '2026-09-10T10:00:00Z'), heard('heard', 'reminder', '2026-09-25T10:00:00Z')]);
    const cols = columns(apps, by);
    expect(cols.applied.map((a) => a.id)).toEqual(['heard', 'new', 'old']);
    expect(cols.offer.map((a) => a.id)).toEqual(['far']);
    expect(cols.closed).toEqual([]);
  });

  test('a card waits after two weeks with no word, and stops once they answer', async () => {
    const { waiting } = await load();
    expect(waiting(job('a'), [], '2026-09-20')).toBeNull();
    expect(waiting(job('a'), [], '2026-09-29')).toBe(19);
    expect(waiting(job('a'), [heard('a', 'applied', '2026-09-10T10:00:00Z')], '2026-09-29')).toBe(19);
    expect(waiting(job('a'), [heard('a', 'interview', '2026-09-20T10:00:00Z')], '2026-09-29')).toBeNull();
    expect(waiting(job('a', { stage: 'closed' }), [], '2026-09-29')).toBeNull();
  });

  test('totals count each stage and how far each got; in play is the three in between', async () => {
    const { allOf, inPlay, totalsOf } = await load();
    const totals = totalsOf([
      job('a'),
      job('b', { stage: 'assessment', reached: 'assessment' }),
      job('c', { stage: 'closed', reached: 'interviewing', outcome: 'rejected', updated: '2026-09-28T10:00:00Z' }),
      job('d', { stage: 'offer', reached: 'offer' })
    ]);
    expect(totals.stages).toEqual({ applied: 1, assessment: 1, interviewing: 0, offer: 1, closed: 1 });
    expect(totals.reached).toEqual({ assessment: 3, interviewing: 2, offer: 1 });
    expect(totals.updated).toBe('2026-09-28T10:00:00Z');
    expect([allOf(totals), inPlay(totals)]).toEqual([4, 2]);
  });

  test('a search finds every word in the company, role, source or place', async () => {
    const { matches } = await load();
    const app = job('Kestrel Data', { role: 'SDET II', location: 'Remote, US' });
    expect(matches(app, 'kestrel sdet')).toBe(true);
    expect(matches(app, 'remote greenhouse')).toBe(true);
    expect(matches(app, 'kestrel lever')).toBe(false);
    expect(matches(app, '  ')).toBe(true);
  });
});

describe('the store', () => {
  test('reads Jincheng’s applications for Jincheng, and only the totals for anyone else', async () => {
    const { social } = database([job('a'), job('b', { stage: 'interviewing', reached: 'interviewing' })]);
    const h = await load();
    await h.readHunt(true);
    expect(h.huntNow().applications.map((a) => a.id)).toEqual(['a', 'b']);
    expect(h.huntNow().totals.stages.interviewing).toBe(1);
    // Signing out empties it at once, and a visitor gets the numbers without asking for a single application.
    const reading = h.readHunt(false);
    expect(h.huntNow()).toMatchObject({ owner: false, applications: [], loaded: false });
    await reading;
    expect(h.huntNow()).toMatchObject({ owner: false, applications: [], totals: TOTALS, loaded: true });
    expect(social.myJobs).toHaveBeenCalledTimes(1);
  });

  test('a move shows at once; refused, it goes back', async () => {
    const { answer } = database([job('a')]);
    const h = await load();
    await h.readHunt(true);
    answer.refuse = true;
    const moving = h.changeJob(h.huntNow().applications[0], { stage: 'interviewing' });
    expect(h.huntNow().applications[0]).toMatchObject({ stage: 'interviewing', reached: 'interviewing' });
    expect(h.huntNow().totals.stages.interviewing).toBe(1);
    await expect(moving).rejects.toThrow('refused');
    expect(h.huntNow().applications[0].stage).toBe('applied');
  });

  test('two changes made at once both land: the second waits for the first, then saves from its version', async () => {
    const { social } = database([job('a')]);
    const h = await load();
    await h.readHunt(true);
    const note = h.changeJob(h.huntNow().applications[0], { notes: 'Ask about their test harness.' });
    const move = h.changeJob(h.huntNow().applications[0], { stage: 'interviewing' });
    expect(h.huntNow().applications[0]).toMatchObject({ notes: 'Ask about their test harness.', stage: 'interviewing' });
    await Promise.all([note, move]);
    expect(social.saveJob.mock.calls.map(([draft]) => (draft as JobApplication).version)).toEqual([1, 2]);
    expect(h.huntNow().applications[0]).toMatchObject({ notes: 'Ask about their test harness.', stage: 'interviewing', version: 3 });
  });

  test('a read that lands while changes are on their way can’t take them back, and it reads again once they’re saved', async () => {
    const { answer, social } = database([job('a'), job('b')]);
    const h = await load();
    await h.readHunt(true);
    let letSave = () => {};
    answer.saving = new Promise<void>((resolve) => (letSave = resolve));
    const a = h.huntNow().applications.find((x) => x.id === 'a')!;
    const note = h.changeJob(a, { notes: 'Ask about their test harness.' });
    const move = h.changeJob(a, { stage: 'interviewing' });
    await vi.waitFor(() => expect(social.saveJob).toHaveBeenCalledTimes(1));
    // Meanwhile another tab moves the other one, and this tab reads again.
    answer.applications = answer.applications.map((x) => (x.id === 'b' ? { ...x, stage: 'offer' as const, reached: 'offer' as const, version: 2 } : x));
    await h.readHunt(true, { now: true });
    expect(h.huntNow().applications.find((x) => x.id === 'a')).toMatchObject({ notes: 'Ask about their test harness.', stage: 'interviewing' });
    letSave();
    await Promise.all([note, move]);
    expect(answer.applications.find((x) => x.id === 'a')).toMatchObject({ notes: 'Ask about their test harness.', stage: 'interviewing', version: 3 });
    await vi.waitFor(() => expect(h.huntNow().applications.find((x) => x.id === 'b')?.stage).toBe('offer'));
    expect(h.huntNow().applications.find((x) => x.id === 'a')).toMatchObject({ notes: 'Ask about their test harness.', stage: 'interviewing', version: 3 });
  });

  test('a read that started before a change can’t undo it', async () => {
    const { answer } = database([job('a')]);
    const h = await load();
    await h.readHunt(true);
    let release = () => {};
    answer.wait = new Promise<void>((resolve) => (release = resolve));
    const reading = h.readHunt(true, { now: true });
    await h.changeJob(h.huntNow().applications[0], { notes: 'Call back Friday.' });
    release();
    await reading;
    expect(h.huntNow().applications[0].notes).toBe('Call back Friday.');
  });

  test('adds and deletes, taking what Mail said with it; without a database, nothing breaks', async () => {
    const { answer, social } = database([job('a')], [heard('a', 'applied', '2026-09-10T10:00:00Z')]);
    const h = await load();
    await h.readHunt(true);
    const made = await h.addJob({
      company: 'New Company',
      role: '',
      stage: 'applied',
      outcome: null,
      appliedOn: '2026-09-29',
      source: '',
      location: '',
      posting: '',
      notes: ''
    });
    expect(
      h
        .huntNow()
        .applications.map((a) => a.id)
        .sort()
    ).toEqual(['a', made.id].sort());
    await h.deleteJob('a');
    expect(h.huntNow().applications.map((a) => a.id)).toEqual([made.id]);
    expect(h.huntNow().events).toEqual([]);
    // Signed out while a save was on its way, its answer shows nowhere.
    let letSave = () => {};
    answer.saving = new Promise<void>((resolve) => (letSave = resolve));
    const saving = h.changeJob(h.huntNow().applications[0], { notes: 'Mine.' });
    await vi.waitFor(() => expect(social.saveJob).toHaveBeenCalledTimes(2));
    let letRead = () => {};
    answer.wait = new Promise<void>((resolve) => (letRead = resolve));
    void h.readHunt(false);
    letSave();
    await saving;
    expect(h.huntNow()).toMatchObject({ owner: false, applications: [] });
    letRead();
    backend.social = null;
    const none = await load();
    await none.readHunt(false);
    expect(none.huntNow()).toMatchObject({ applications: [], loaded: true });
    await expect(
      none.addJob({ company: 'x', role: '', stage: 'applied', outcome: null, appliedOn: '2026-09-29', source: '', location: '', posting: '', notes: '' })
    ).rejects.toThrow(/database/);
  });
});
