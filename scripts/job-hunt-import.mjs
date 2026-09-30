// Writes what Claude found in Gmail, once Jincheng has checked it, into Job
// Hunt (private.import_job_hunt in
// supabase/migrations/20260930062024_job_hunt.sql).
//
// Usage: node scripts/job-hunt-import.mjs <found.json> [--dry-run] [--db-url <url>]
//
// found.json is {"applications": [{company, role, stage, outcome, reached,
// applied_on, source, location, posting, events: [{kind, at, subject,
// thread, message}]}]}. It's checked here first, so a mistake stops
// before anything is sent, and then sent in one go: the database adds
// what's new, moves an application on but never back, fills in only
// what's blank and skips a message it already has, or writes nothing if
// anything is wrong. It goes through the Supabase CLI as this machine is
// logged in to it, so it can only be run here, by whoever has that login.
// --db-url sends it to another database instead (a local one, to try it).
// The file is Jincheng's job hunt: keep it out of the repository.

import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PROJECT = 'hszogpoyyqgwjuznbegd';
const ROOT = new URL('..', import.meta.url).pathname;

const STAGES = ['applied', 'assessment', 'interviewing', 'offer', 'closed'];
const REACHED = ['applied', 'assessment', 'interviewing', 'offer'];
const OUTCOMES = ['rejected', 'withdrew', 'no_reply', 'declined'];
const KINDS = ['applied', 'assessment', 'interview', 'offer', 'rejection', 'withdrawal', 'reminder', 'other'];
const CONTROL = /[\u0000-\u001f\u007f]/;
const GMAIL_ID = /^[0-9a-f]{8,32}$/;

const [file, ...flags] = process.argv.slice(2);
if (!file) {
  console.error('Usage: node scripts/job-hunt-import.mjs <found.json> [--dry-run] [--db-url <url>]');
  process.exit(2);
}
const dryRun = flags.includes('--dry-run');
const dbUrl = flags.includes('--db-url') ? flags[flags.indexOf('--db-url') + 1] : null;
const target = dbUrl ? ['--db-url', dbUrl] : ['--linked', '--project-ref', PROJECT];

/** A one-line text of at most `most` characters, trimmed; '' when missing. */
function line(value, most, what) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new Error(`${what} isn't text`);
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length > most) throw new Error(`${what} is longer than ${most} characters`);
  return text;
}

function checked(found) {
  if (!found || !Array.isArray(found.applications)) throw new Error('Expected {"applications": [...]}');
  const seen = new Set();
  const messages = new Set();
  return {
    applications: found.applications.map((a, i) => {
      const where = `applications[${i}]`;
      const company = line(a.company, 120, `${where}.company`);
      if (!company) throw new Error(`${where} has no company`);
      const role = line(a.role, 160, `${where}.role`);
      const pair = `${company.toLowerCase()}|${role.toLowerCase()}`;
      if (seen.has(pair)) throw new Error(`${where}: ${company} (${role || 'no role'}) is listed twice`);
      seen.add(pair);
      const stage = a.stage ?? 'applied';
      if (!STAGES.includes(stage)) throw new Error(`${where}.stage is ${stage}`);
      const outcome = stage === 'closed' ? (a.outcome ?? null) : null;
      if (outcome !== null && !OUTCOMES.includes(outcome)) throw new Error(`${where}.outcome is ${outcome}`);
      const reached = a.reached ?? (stage === 'closed' ? 'applied' : stage);
      if (!REACHED.includes(reached)) throw new Error(`${where}.reached is ${reached}`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(a.applied_on ?? '') || Number.isNaN(Date.parse(a.applied_on))) throw new Error(`${where}.applied_on isn't a day (YYYY-MM-DD)`);
      const posting = line(a.posting, 500, `${where}.posting`);
      if (posting && !/^https?:\/\/\S+$/.test(posting)) throw new Error(`${where}.posting isn't a web address`);
      const events = (a.events ?? []).map((e, j) => {
        const at = `${where}.events[${j}]`;
        if (!KINDS.includes(e.kind)) throw new Error(`${at}.kind is ${e.kind}`);
        if (typeof e.at !== 'string' || Number.isNaN(Date.parse(e.at))) throw new Error(`${at}.at isn't a time`);
        for (const key of ['thread', 'message']) {
          if (e[key] !== undefined && e[key] !== null && !GMAIL_ID.test(e[key])) throw new Error(`${at}.${key} isn't a Gmail id`);
        }
        if (e.message) {
          if (messages.has(e.message)) throw new Error(`${at}: message ${e.message} is listed twice`);
          messages.add(e.message);
        }
        const subject = typeof e.subject === 'string' ? e.subject.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300) : '';
        return { kind: e.kind, at: new Date(e.at).toISOString(), subject, thread: e.thread ?? null, message: e.message ?? null };
      });
      for (const [key, value] of [['company', company], ['role', role]]) if (CONTROL.test(value)) throw new Error(`${where}.${key} has control characters`);
      return {
        company,
        role,
        stage,
        outcome,
        reached,
        applied_on: a.applied_on,
        source: line(a.source, 40, `${where}.source`),
        location: line(a.location, 80, `${where}.location`),
        posting,
        events
      };
    })
  };
}

/** "Added 3, moved 1, 5 new messages." from the CLI's answer, however it wraps the function's. */
function summary(out) {
  let answer;
  try {
    answer = JSON.parse(out);
  } catch {
    return null;
  }
  const rows = Array.isArray(answer) ? answer : (answer?.rows ?? [answer]);
  let result = rows[0]?.result ?? null;
  if (typeof result === 'string') result = JSON.parse(result);
  return result && typeof result.added === 'number' ? `Added ${result.added}, moved ${result.moved}, ${result.messages} new messages.` : null;
}

let batch;
try {
  batch = checked(JSON.parse(readFileSync(file, 'utf8')));
} catch (error) {
  console.error(`Not sent: ${error.message}`);
  process.exit(1);
}
const count = (stage) => batch.applications.filter((a) => a.stage === stage).length;
console.log(
  `${batch.applications.length} applications (${STAGES.map((s) => `${count(s)} ${s}`).join(', ')}), ` +
    `${batch.applications.reduce((n, a) => n + a.events.length, 0)} messages`
);
if (dryRun) {
  console.log('Dry run: nothing sent.');
  process.exit(0);
}

// The batch goes in as one dollar-quoted literal whose tag it can't contain.
const json = JSON.stringify(batch);
let tag;
do tag = `jh${randomBytes(6).toString('hex')}`;
while (json.includes(`$${tag}$`));
const dir = mkdtempSync(join(tmpdir(), 'job-hunt-'));
const sql = join(dir, 'import.sql');
try {
  writeFileSync(sql, `select private.import_job_hunt($${tag}$${json}$${tag}$::jsonb) as result;\n`, { mode: 0o600 });
  const out = execFileSync('supabase', ['db', 'query', ...target, '--workdir', ROOT, '--output-format', 'json', '-f', sql], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  console.log(summary(out) ?? out.trim());
} catch (error) {
  // The CLI answers a failure as {"error": {"message"}} on stdout; nothing was written.
  const said = String(error.stdout ?? '');
  let message = said.trim() || String(error.stderr ?? error.message).trim();
  try {
    message = JSON.parse(said).error?.message ?? message;
  } catch {}
  console.error(`Nothing was written: ${message}`);
  process.exitCode = 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
