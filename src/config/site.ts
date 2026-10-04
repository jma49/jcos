// Where the site lives, in one place: the page (Astro's `site`, in
// astro.config.mjs), the desktop (src/os/) and the Vercel Functions (api/,
// which import this as `site.js`) read it here. Plain values only, so any
// of them can import it.
//
// What can't import code keeps its own copy, held to these by
// src/config/site.test.ts: the Content Security Policy in vercel.json, the
// database's check on members' addresses (supabase/migrations/) and the
// Edge Functions' defaults (supabase/functions/) and the issue forms'
// link (.github/ISSUE_TEMPLATE/config.yml). Text about the site
// (the README, the docs) names it as it is.

/** The site's own name. */
export const DOMAIN = 'majincheng.com';

/** The canonical address, which the bare domain redirects to. */
export const SITE_URL = `https://www.${DOMAIN}`;

/** Every address the site is served from: the canonical one first, then the bare domain. */
export const SITE_ORIGINS = [SITE_URL, `https://${DOMAIN}`] as const;

/** The archive the Browser opens on (ocra/, its own site). */
export const ARCHIVE_URL = `https://ocra.${DOMAIN}/`;

/**
 * The domain of the address Supabase Auth gives each member, made from
 * their username (social/supabase/accounts.ts). It must stay byte for byte
 * what it is: existing accounts signed up under it, and the database only
 * accepts accounts whose address ends in it (handle_new_user in
 * supabase/migrations/). Changing the site's domain doesn't change this.
 */
export const MEMBER_EMAIL_DOMAIN = 'users.majincheng.com';
