# Music, lyrics and video

The iPod, Karaoke and everything that plays sound. Two rules hold
everywhere: the sound switch and volume in the menu bar govern every
sound, the music included (`setLoudness()` in `music.ts`), and YouTube's
own chrome never shows.

- `src/os/media/music.ts`, `lyrics.ts`, `apps/ipod/IPod.tsx` and `apps/karaoke/`:
  the iPod (click wheel, menus, Now Playing with the video and a line of
  lyrics) and Karaoke (full-window video with lyrics that fill as they're
  sung, or a listening view for instrumentals). The library lives in
  Supabase (`songs` and `albums`; [supabase.md](supabase.md)): `albums`
  are whole albums, with cover, year and a note, and `songs` are a
  YouTube video id, title, artist, `album`, square `cover` art from
  Apple's catalogue, `track` for album tracks and `instrumental`. The
  site reads it through `/api/songs` (`api/songs.ts`, cached at the edge
  for thirty seconds, stale for thirty more) when a music app first
  opens: apps that need it say so in their manifests (`data`), and
  `media/library.ts` loads it once a visit. Songs added meanwhile come in
  while a music app is open (`useLibraryRefresh()` in `media/refresh.ts`,
  which isn't in the first load: when the app opens and when the tab
  comes back, at most once a minute): appended, and changed ones updated
  in place, never removed or reordered. Views that list the library call
  `useLibraryVersion()` so they render again; `fromLibrary()` rebuilds
  after a change. `src/data/songs.json` is a snapshot, served when Supabase can't
  be read and used by `astro dev`; refresh it with `npm run
  songs:snapshot`. A song's place in `SONGS` is a stable handle for the
  visit; derive anything from the library with `fromLibrary()`, never at
  a module's top level, since modules load before the library does. Playback
  uses the YouTube IFrame API; the app used last owns playback and hands
  the position over when the other takes it, and ⏭/⏮ follow the queue a
  song was started from (album, artist or all). Lyrics come from
  lrclib.net in the browser, or, when it has none, from NetEase through
  `api/lyrics.ts` (a Vercel Function; converted to Traditional Chinese).
  To add a song, send the Telegram bot `/add <YouTube link>`
  (`supabase/functions/soapbox-bot/music.ts`), or add a row to `songs` in
  the Table editor: its video id, title, artist, album and cover;
  tune `lyrics_offset` (ms the lyrics run ahead of the video, negative for
  videos with an intro) by nudging it in Karaoke with `[`/`]` and adding
  the tweak it shows, and set `lyrics_id` to an lrclib id if the search
  picks the wrong entry. Prefer album audio (a "Topic" or label upload) over
  music videos, whose edits don't match the lyrics' timing. Visitors'
  own timing tweaks live in `os-lyric-offsets`. YouTube's own chrome must
  never show: players go in a `.os-player-frame` (300px taller than the
  space, so the title bar and logo are cut off) and the app covers the
  video with the artwork until `usePlayer`'s `live` is true.
- `src/os/media/together.ts`: listening along. When Jincheng plays a song
  from Telegram (`/play`), everyone on the desktop gets a notification
  (and so does whoever arrives before it ends); "Listen along" opens the
  iPod at his place in the song, from `now_playing_position()`, the
  database's clock rather than the visitor's. It waits for that click,
  since browsers don't play sound unasked, and then follows the sound
  switch like all music. The notification goes when the song ends
  (`remaining_ms`) or when he sends `/stop`.
- The iPod's menus scroll natively (a finger, a mouse wheel, a
  trackpad), which leaves the choice where it is; the click wheel and the
  arrow keys move the choice, and the list scrolls just enough to show
  it. Control glyphs everywhere come from `core/glyphs.tsx`.
- `src/os/apps/ipod/`: the iPod's full-screen views (Cover Flow, Brick,
  Music Quiz), which take the wheel through a `ScreenInput`, and the
  `Marquee` used for long titles. The iPod's own settings (theme,
  backlight, artwork or video) live in `os-ipod`.
- `src/os/shell/DesktopLyrics.tsx`: the lyrics floating over the desktop,
  two lines (the one being sung fills as Karaoke's does, via `lineFill()`
  in `lyrics.ts`), off until the visitor turns them on (the iPod's
  Settings › Desktop Lyrics, or the ♫ card; `desktopLyrics` in `os-music`).
  They sit above the Dock or where they were dragged (`os-desktop-lyrics`,
  as a share of the screen), step aside while Karaoke is playing in a
  window that's showing, and never show on phones. `DesktopLyricsLayer`
  fetches their code the first time they're on while a song plays, so
  it isn't in the first load.
- `src/os/shell/NowPlaying.tsx`: the menu bar's ♫ while a song is on, with a
  card to control it; it also feeds the Media Session API. The Dynamic
  desktop picture `dynamic:cover` shows the playing song's cover,
  blurred.
- The iTunes Artwork screen saver (`Artwork` in `shell/savers.tsx`, the
  arithmetic in `shell/artwork.ts`) turns the library's covers over on
  a wall. Not being an app with a manifest, it calls `loadLibrary()`
  itself, and stays black if the library can't be read; see
  [desktop.md](desktop.md).
