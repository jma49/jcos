// Job Hunt's data (social/jobs.ts), for the app. Jincheng gets the
// applications and what Mail said about each, read while Job Hunt is open,
// again when the tab comes back, and at once when another tab changes one;
// a change shows at once and goes back if the database refuses it. Anyone
// else gets only the totals, which name no company.

import { useEffect, useSyncExternalStore } from 'react';
import { report } from '../../core/report';
import { getSocial } from '../../social/social';
import { EMPTY_TOTALS, JOB_STAGES, type JobApplication, type JobDraft, type JobEvent, type JobReach, type JobStage, type JobTotals } from '../../social/jobs';

export type { JobApplication, JobDraft, JobEvent, JobStage, JobTotals };

// ---------- Days ----------

const pad = (n: number) => String(n).padStart(2, '0');

/** Today (YYYY-MM-DD), where this device is. */
export const today = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

/** Whole days from one day (YYYY-MM-DD) to another. */
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00`) - Date.parse(`${from}T12:00:00`)) / 86_400_000);

/** "Sep 26", or "Sep 26, 2025" in another year, for a day or a moment. */
export function shortDay(value: string, now = today()) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  const sameYear = date.getFullYear() === Number(now.slice(0, 4));
  return date.toLocaleDateString('en-US', sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}

// ---------- What the board shows ----------

/** After this many days with no word since applying, a card says how long it has waited. */
export const WAITING_DAYS = 14;

/** Each application's messages, oldest first. */
export function eventsBy(events: JobEvent[]): Map<string, JobEvent[]> {
  const by = new Map<string, JobEvent[]>();
  for (const e of [...events].sort((a, b) => a.at.localeCompare(b.at))) {
    const list = by.get(e.applicationId);
    if (list) list.push(e);
    else by.set(e.applicationId, [e]);
  }
  return by;
}

/** When it last moved: its latest message, or a save, whichever is later. */
export function lastMoved(app: JobApplication, events: JobEvent[] = []) {
  const heard = events.at(-1)?.at ?? '';
  return heard > app.updated ? heard : app.updated;
}

/** The board's columns: each stage's applications, the one that moved last first. */
export function columns(apps: JobApplication[], by: Map<string, JobEvent[]>): Record<JobStage, JobApplication[]> {
  const cols = Object.fromEntries(JOB_STAGES.map((s) => [s, [] as JobApplication[]])) as Record<JobStage, JobApplication[]>;
  for (const app of apps) cols[app.stage].push(app);
  for (const s of JOB_STAGES) cols[s].sort((a, b) => lastMoved(b, by.get(b.id)).localeCompare(lastMoved(a, by.get(a.id))) || a.company.localeCompare(b.company));
  return cols;
}

/** Days it has waited to hear back: applied, and no word from them since, for longer than WAITING_DAYS; else null. */
export function waiting(app: JobApplication, events: JobEvent[] = [], now = today()): number | null {
  if (app.stage !== 'applied' || events.some((e) => e.kind !== 'applied')) return null;
  const days = daysBetween(app.appliedOn, now);
  return days > WAITING_DAYS ? days : null;
}

const LADDER: JobReach[] = ['applied', 'assessment', 'interviewing', 'offer'];

/** The totals, worked out from the applications themselves (what visitors get from the database). */
export function totalsOf(apps: JobApplication[]): JobTotals {
  const got = (stage: JobReach) => apps.filter((a) => LADDER.indexOf(a.reached) >= LADDER.indexOf(stage)).length;
  return {
    stages: Object.fromEntries(JOB_STAGES.map((s) => [s, apps.filter((a) => a.stage === s).length])) as JobTotals['stages'],
    reached: { assessment: got('assessment'), interviewing: got('interviewing'), offer: got('offer') },
    updated: apps.reduce<string | null>((latest, a) => (!latest || a.updated > latest ? a.updated : latest), null)
  };
}

/** Every application counted in the totals. */
export const allOf = (t: JobTotals) => JOB_STAGES.reduce((n, s) => n + t.stages[s], 0);

/** Still going somewhere: at an assessment, in interviews, or holding an offer. */
export const inPlay = (t: JobTotals) => t.stages.assessment + t.stages.interviewing + t.stages.offer;

/** Whether an application's company or role has every word of a search in it. */
export function matches(app: JobApplication, query: string) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const text = `${app.company} ${app.role} ${app.source} ${app.location}`.toLowerCase();
  return words.every((w) => text.includes(w));
}

/** A steady colour per company, for its monogram. */
export function hueOf(company: string) {
  let h = 0;
  for (const c of company.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

// ---------- The store ----------

interface Hunt {
  /** Whether it was read as Jincheng's (the applications) or not (the totals only). */
  owner: boolean;
  applications: JobApplication[];
  events: JobEvent[];
  totals: JobTotals;
  /** Whether anything has been read yet. */
  loaded: boolean;
}

let hunt: Hunt = { owner: false, applications: [], events: [], totals: EMPTY_TOTALS, loaded: false };
let version = 0;
const listeners = new Set<() => void>();
function changed() {
  version++;
  listeners.forEach((listener) => listener());
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** Job Hunt as it is now, for a view: it renders again when it changes. */
export function useJobHunt() {
  useSyncExternalStore(subscribe, () => version, () => version);
  return hunt;
}

/** Job Hunt as it is now, outside a view. */
export const huntNow = () => hunt;

/** How long a read stands before the database is asked again. */
const FRESH_MS = 30_000;
let freshAt = 0;
/** The read under way, and whether it's Jincheng's. */
let reading: { owner: boolean; done: Promise<void> } | null = null;
/**
 * Changes made on this page: counted as each begins and ends, and how many
 * are shown but not yet answered. A read that saw one begin or end, or
 * lands while one is on its way, would take it back, so it's dropped, and
 * Job Hunt is read again once none is left (`missed`).
 */
let writes = 0;
let pending = 0;
let missed = false;

async function database() {
  const social = await getSocial();
  if (!social) throw new Error('Job Hunt needs the database, which isn’t here.');
  return social;
}

/** Reads Job Hunt as `owner` or not, at most every 30 s unless `now`; being read as someone else empties it at once. */
export function readHunt(owner: boolean, { now = false } = {}): Promise<void> {
  if (hunt.owner !== owner) {
    hunt = { owner, applications: [], events: [], totals: EMPTY_TOTALS, loaded: false };
    freshAt = 0;
    changed();
  }
  if (reading?.owner === owner) return reading.done;
  if (!now && Date.now() - freshAt < FRESH_MS) return Promise.resolve();
  if (pending) {
    missed = true;
    return Promise.resolve();
  }
  const at = writes;
  const done = (async () => {
    const social = await getSocial();
    if (!social) return { owner, applications: [], events: [], totals: EMPTY_TOTALS, loaded: true };
    if (!owner) return { owner, applications: [], events: [], totals: await social.jobTotals(), loaded: true };
    const { applications, events } = await social.myJobs();
    return { owner, applications, events, totals: totalsOf(applications), loaded: true };
  })()
    .then((next) => {
      if (hunt.owner !== owner) return;
      if (at !== writes || pending) {
        missed = true;
        return;
      }
      freshAt = Date.now();
      hunt = next;
      changed();
    })
    .catch((error) => report(error, 'jobhunt.read'))
    .finally(() => {
      if (reading?.done === done) reading = null;
      readMissed();
    });
  reading = { owner, done };
  return done;
}

/** For Job Hunt: while it's open it's read, again when the tab comes back, and at once when another tab changes it. */
export function useHuntRefresh(owner: boolean, active: boolean) {
  useEffect(() => {
    if (!active) return;
    void readHunt(owner);
    const onVisible = () => document.visibilityState === 'visible' && void readHunt(owner);
    const onOther = () => void readHunt(owner, { now: true });
    document.addEventListener('visibilitychange', onVisible);
    otherTabs.add(onOther);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      otherTabs.delete(onOther);
    };
  }, [owner, active]);
}

// ---------- Changing (Jincheng's) ----------

/** The other tabs: told of each change, they read again at once. */
const otherTabs = new Set<() => void>();
const tabs = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('os-jobhunt');
if (tabs) tabs.onmessage = () => otherTabs.forEach((read) => read());

/** Reads again what a read dropped for a change, once no change is on its way. */
function readMissed() {
  if (!missed || pending || reading) return;
  missed = false;
  void readHunt(hunt.owner, { now: true });
}

/** A change begins: from now until it's answered, no read lands. */
function begin() {
  writes++;
  pending++;
}

/** A change is answered, saved or refused. */
function end() {
  writes++;
  pending--;
  freshAt = 0;
  readMissed();
}

/** Saves a change, and tells the other tabs. */
async function saving<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } finally {
    tabs?.postMessage('changed');
  }
}

/** Shows an application as saved or changed; not once Job Hunt is someone else's (signed out while it was saving). */
function put(app: JobApplication) {
  if (!hunt.owner) return;
  const applications = [...hunt.applications.filter((a) => a.id !== app.id), app];
  hunt = { ...hunt, applications, totals: totalsOf(applications) };
  changed();
}

/** Adds an application by hand. */
export async function addJob(draft: Omit<JobDraft, 'id' | 'version'>): Promise<JobApplication> {
  begin();
  try {
    const made = await saving(async () => (await database()).saveJob(draft));
    put(made);
    return made;
  } finally {
    end();
  }
}

/** An application with a change made to it, as the database would keep it. */
function applied(app: JobApplication, change: Partial<JobDraft>): JobApplication {
  const next = { ...app, ...change };
  if (next.stage !== 'closed') next.outcome = null;
  if (next.stage !== 'closed' && LADDER.indexOf(next.stage) > LADDER.indexOf(next.reached)) next.reached = next.stage;
  return next;
}

/**
 * Each application's saves, one after another, and the database's copy of
 * it as last known. A change made while a save is on its way (a note left
 * by clicking the stage menu) waits for it, then saves from the version it
 * got, rather than being refused as if someone else had saved meanwhile.
 */
const lines = new Map<string, { tail: Promise<unknown>; saved: JobApplication }>();

/**
 * Changes an application: shown at once, saved after, each save carrying
 * every change made so far; refused, it goes back to what the database
 * had, and Job Hunt is read again.
 */
export function changeJob(app: JobApplication, change: Partial<JobDraft>): Promise<JobApplication> {
  const id = app.id;
  const shown = hunt.applications.find((a) => a.id === id) ?? app;
  const line = lines.get(id) ?? { tail: Promise.resolve(), saved: shown };
  lines.set(id, line);
  begin();
  put(applied(shown, change));
  const tail = line.tail
    // The save before failed for its own caller, who was told; this one goes on.
    .catch(() => {})
    .then(async () => {
      const now = hunt.applications.find((a) => a.id === id);
      if (!now) throw new Error('It was deleted.');
      const saved = await saving(async () => (await database()).saveJob({ ...now, id, version: line.saved.version }));
      line.saved = saved;
      return saved;
    });
  line.tail = tail;
  return tail
    .then(
      (saved) => {
        if (line.tail === tail) {
          lines.delete(id);
          put(saved);
        } else {
          // More is on its way: keep showing it, with the version saved so far.
          const now = hunt.applications.find((a) => a.id === id);
          if (now) put({ ...now, version: saved.version, updated: saved.updated });
        }
        return saved;
      },
      (error) => {
        if (line.tail === tail) {
          lines.delete(id);
          if (hunt.applications.some((a) => a.id === id)) put(line.saved);
        }
        missed = true;
        throw error;
      }
    )
    .finally(end);
}

/** Deletes an application and what Mail said about it. */
export async function deleteJob(id: string): Promise<void> {
  begin();
  try {
    await saving(async () => (await database()).removeJob(id));
    lines.delete(id);
    if (!hunt.owner) return;
    const applications = hunt.applications.filter((a) => a.id !== id);
    hunt = { ...hunt, applications, events: hunt.events.filter((e) => e.applicationId !== id), totals: totalsOf(applications) };
    changed();
  } finally {
    end();
  }
}
