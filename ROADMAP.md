# Roadmap: majincheng.com (JM/OS)

What to build next and in what order, as of 2026-09-27, after the audit
recorded in [HANDOFF.md](HANDOFF.md) (section 5). HANDOFF.md is the state
of things; this file is the plan. When an item is done, move what matters
to HANDOFF.md and take it out of here.

Each item says why it's worth doing, what it has to respect (the rules
in [AGENTS.md](AGENTS.md)), and how we'll know it's done.

## Now: finish what's merged

- **Listening along, live:** `/play` reaching an open desktop and `/stop`
  need the `now_playing_realtime` migration run (HANDOFF.md section 4).

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
the album cut.

**Shape** (to decide when started): align from the video's own length
against the lyrics' (lrclib and NetEase both give one), fall back to
an offset only where that fails, and give Jincheng a way to correct a
song from Karaoke that ends up in the database, not in one browser.

**Done when** every song in the library is checked by ear once and the
per-song offsets are the exception.

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
greys; ryOS's Videos app, emulators, virtual file system, other OS
themes and video wallpapers.
