# 0007. No script Content Security Policy

- Date: 2026-09-26
- Status: accepted

## Context

A Content Security Policy for scripts limits what a page may run. Astro's
inline hydration scripts and the YouTube player would both need it
loosened.

## Decision

No full script CSP: loosened far enough for those two, it wouldn't
protect anything. The other security headers stay, in `vercel.json`.

## Consequences

- What visitors write renders as text, and the database enforces every
  rule, so the policy isn't what stands between one visitor and others.
