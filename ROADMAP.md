# Roadmap: majincheng.com (JM/OS)

What to build next and in what order, as of 2026-09-27, after that
day's audit (#131–#133). HANDOFF.md is the state
of things; this file is the plan. When an item is done, move what matters
to HANDOFF.md and take it out of here.

Each item says why it's worth doing, what it has to respect (the rules
in [AGENTS.md](AGENTS.md)), and how we'll know it's done.

## 1. Room on the first load

**Why.** The first visit's JavaScript is 157 KB against a budget of 160
(`npm run perf`, 2026-09-27). Anything else on the first screen would
break the budget, and raising the budget has to hold "beyond today"
(AGENTS.md). React's client is 63 KB of it and stays.

**Shape.** Measure first: what each first-load chunk holds
(`registry`, `wallpapers`, `animate`, `Desktop`), and what the desktop
needs before its first paint versus in the second after. Move the rest
behind the same "after the desktop settles" loading as the Dashboard
(#86).

**Done when** the first load is 150 KB or less, with the reason for each
kilobyte moved written in `docs/agents/performance.md`.

## 2. Lyrics that line up

**Why.** Decided 2026-09-27: timing gets reworked as a whole, not tuned
song by song with `/offset`. Ten starter songs carry ryOS's offsets,
unchecked by ear, and 三個人的晚餐 uses an MV ten seconds shorter than
the album cut. Desktop lyrics (done, 2026-09-28) make a wrong timing
visible on every screen.

**Shape** (decided 2026-09-28, after reading how ryOS does it: one
shared offset per song, a tap-to-sync view and a lyrics-source search,
all gated to its admin by username):
- **Tap to sync in Karaoke.** A list of the song's lines; tapping the
  one being sung sets the offset (that line's time minus the video's
  position). A few taps per song, instead of `/offset` by trial.
- **Choose the lyrics.** Every lrclib candidate, with its length against
  the video's; the choice is saved as the song's `lyrics_id`. A wrong
  edit is usually a wrong entry, not a wrong offset.
- **Saved for everyone, by Jincheng only.** A `private.owners` table
  holding his account's id, and a `security definer` function that
  only those accounts may call and that changes only `lyrics_offset`
  and `lyrics_id`. Visitors' own nudges stay in their browser.
- **Length as a fallback only**: for a song nobody has synced, when the
  video is longer than the lyrics and the difference sits at the start.
- **Not now:** word-by-word timing. Kugou's KRC (what ryOS uses) and
  NetEase's word timings are both unofficial APIs.

**Done when** every song in the library has been synced by ear once,
and a sync made in Karaoke reaches another browser.

## 3. Visitors ask for songs

**Why.** Decided as "may come later" with the music library: visitors
request, Jincheng approves from Telegram.

**Shape.** A `song_requests` table written only through a function,
one open request per member and a site-wide daily cap (advisory locks,
races in `race.sh`); the bot shows each with Add / Decline and claims it
atomically, as `/add`'s draft does; an added song goes through the same
checks as `/add`.

**Done when** a member's request reaches Telegram, Add puts it in the
library, and two requests at once from one member make one.

## Waiting on something else

- **An ocra review-replay app**, once ocra's redesign is done (don't
  change ocra before then).
- **The Chinese site**, on hold.
- **"Ask me", the AI assistant**, on hold. When it's picked up it needs a
  per-visitor and a daily spending cap before anything else.

## Not planned

- **Crash reports from visitors' browsers** (decided 2026-09-27). A
  crash in a visitor's browser still reaches no one, but for a personal
  site a table, a public write path with its own abuse limits, and a
  bot change aren't worth it; each window's error boundary already
  keeps a crash to its own window.

Decided, with the reasons in HANDOFF.md section 3: commercial games or
their ROMs (build originals, as Pinball is); Jincheng's photos anywhere
but Photos; a focus trap in windows; a script CSP; darker secondary
greys; replacing the retro Mac OS X assets with original ones
(decided 2026-09-28); ryOS's Videos app, emulators, virtual file system, other OS
themes and video wallpapers; the Chinese retro web (2026-09-28).
