// CI's gate on known advisories in what ships (dev tools excluded): fails
// on any high or critical one, except those listed below, each with why it
// doesn't apply to this site and a date by which to look again. An
// exception past its date fails like any other advisory, so none lingers.
//
// Usage: node scripts/audit.mjs

import { execFileSync } from 'node:child_process';

const EXCEPTIONS = {
  // http-cache-semantics, every version (via astro). It's the max-stale
  // handling of a shared HTTP cache, which could give one user's cached
  // response to another. Astro uses it only in assets/build/remote.js, to
  // cache remote images while `astro build` runs: no users, no shared
  // cache at run time, since the site is static.
  'GHSA-ch52-4w7c-c8xp': { until: '2026-11-15' }
};

const LEVELS = ['high', 'critical'];

let report;
try {
  report = execFileSync('npm', ['audit', '--omit=dev', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
} catch (error) {
  // npm audit exits non-zero when it finds anything; the JSON is still on stdout.
  report = error.stdout;
}
const { vulnerabilities = {} } = JSON.parse(report);

const today = new Date().toISOString().slice(0, 10);
const failures = [];
const excused = new Set();
for (const [name, vuln] of Object.entries(vulnerabilities)) {
  for (const via of vuln.via) {
    // Entries that name another package are that package's advisories, reported under it.
    if (typeof via !== 'object' || !LEVELS.includes(via.severity)) continue;
    const id = via.url?.split('/').pop() ?? '';
    const exception = EXCEPTIONS[id];
    if (exception && today <= exception.until) excused.add(`${id} (${name}, until ${exception.until})`);
    else failures.push(`${via.severity}: ${name} ${via.range}: ${via.title} ${via.url}${exception ? ` (its exception ended ${exception.until})` : ''}`);
  }
}

for (const line of excused) console.log(`Excused: ${line}`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('No high or critical advisory in what ships.');
