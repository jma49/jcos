import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ARCHIVE_URL, DOMAIN, MEMBER_EMAIL_DOMAIN, SITE_ORIGINS, SITE_URL } from './site';

// What can't import site.ts keeps its own copy of these: each is held to
// it here, so a change to one shows where else it has to be made.

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

/** vercel.json's policies, each as its directives: { 'frame-src': ['https:'], … }. */
function policies() {
  const vercel = JSON.parse(read('vercel.json')) as { headers: { source: string; headers: { key: string; value: string }[] }[] };
  return vercel.headers
    .flatMap((rule) => rule.headers)
    .filter(({ key }) => key.startsWith('Content-Security-Policy'))
    .map(({ key, value }) => ({
      key,
      directives: Object.fromEntries(
        value
          .split(';')
          .map((d) => d.trim().split(/\s+/))
          .filter(([name]) => name)
          .map(([name, ...sources]) => [name, sources])
      ) as Record<string, string[]>
    }));
}

describe('the site config', () => {
  it('keeps the members’ address domain byte for byte: existing accounts depend on it', () => {
    expect(MEMBER_EMAIL_DOMAIN).toBe('users.majincheng.com');
  });

  it('is the database’s domain for members’ addresses', () => {
    expect(read('supabase/schema.sql')).toContain(`name || '@${MEMBER_EMAIL_DOMAIN}'`);
  });

  it('derives every address from the domain', () => {
    expect(SITE_ORIGINS[0]).toBe(SITE_URL);
    for (const url of [...SITE_ORIGINS, ARCHIVE_URL]) expect(new URL(url).hostname.endsWith(DOMAIN)).toBe(true);
  });

  it('agrees with the Content Security Policy where they overlap', () => {
    const found = policies();
    expect(found.length).toBeGreaterThan(0);
    const ours = new Set<string>([...SITE_ORIGINS, new URL(ARCHIVE_URL).origin]);
    for (const { key, directives } of found) {
      // Any of the site's own addresses the policy names is one the config knows.
      for (const source of Object.values(directives).flat()) {
        if (source.includes(DOMAIN)) expect(ours, `${key}: ${source}`).toContain(source.replace(/\/$/, ''));
      }
      // The Browser opens the archive in a frame.
      // (A policy without frame-src or default-src doesn't restrict frames.)
      const frames = directives['frame-src'] ?? directives['default-src'];
      if (frames)
        expect(
          frames.some((s) => s === 'https:' || s === new URL(ARCHIVE_URL).origin),
          `${key} frames the archive`
        ).toBe(true);
      // The site frames itself (api/framing.ts asks pages to allow SITE_URL; this is the same rule at home).
      expect(directives['frame-ancestors'] ?? [], key).toContain("'self'");
    }
  });

  it('is what the Edge Functions default to', () => {
    const recovery = read('supabase/functions/account-recovery/index.ts');
    expect(recovery).toContain(`Deno.env.get('RECOVERY_SITE_URL') ?? '${SITE_URL}'`);
    for (const origin of SITE_ORIGINS) expect(recovery).toContain(`'${origin}'`);
    expect(read('supabase/functions/soapbox-bot/index.ts')).toContain(`'${SITE_URL}/?open=soapbox'`);
  });

  it('is the site the issue forms link to', () => {
    expect(read('.github/ISSUE_TEMPLATE/config.yml')).toContain(`url: ${SITE_URL}\n`);
  });
});
