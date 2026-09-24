# AGENTS.md

Guidance for coding agents working in this repository.

## Language

Write everything in English: commit messages, pull request titles and
descriptions, issues, code comments, documentation, and file names.

The only exception is the Chinese copy of the site itself, the `zh`
entries in `src/i18n/content.ts` and the Chinese résumé PDF. Keep those
in Chinese.

## Commits

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- Subject: `<type>: <summary>` in the imperative mood, lowercase after
  the colon, no trailing period, at most 72 characters. Common types are
  `feat`, `fix`, `docs`, `style`, `refactor`, `chore`.
- Leave a blank line after the subject, then write a body wrapped at 72
  characters that explains what changed and why.
- Keep each commit to one logical change.
