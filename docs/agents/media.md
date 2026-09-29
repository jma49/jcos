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
  video with the artwork until `usePlayer`'s `live` is true. `live`
  waits `YOUTUBE_BUTTON_MS` (5 s) after every start, seek and resume,
  because YouTube's embed shows its own play/pause button in the middle
  of the picture for about 4.3 s then, whatever the player's settings
  (`revealAfterButton` in `player.ts`). DVD Player instead keeps its
  picture, paused or not, and masks just the middle with a button of its
  own while YouTube's may be up (`middleControls`), so pausing and
  playing never stop the picture; YouTube's darkening of the picture
  during those seconds stays, as Jincheng chose (2026-09-29; the details
  are in pitfalls.md).
- `src/os/media/together.ts`: listening along. When Jincheng plays a song
  from Telegram (`/play`), everyone on the desktop gets a notification
  (and so does whoever arrives before it ends); "Listen along" opens the
  iPod at Jincheng's place in the song, from `now_playing_position()`, the
  database's clock rather than the visitor's. It waits for that click,
  since browsers don't play sound unasked, and then follows the sound
  switch like all music. The notification goes when the song ends
  (`remaining_ms`) or when Jincheng sends `/stop`.
- The iPod's menus scroll natively (a finger, a mouse wheel, a
  trackpad), which leaves the choice where it is; the click wheel and the
  arrow keys move the choice, and the list scrolls just enough to show
  it. Control glyphs everywhere come from `core/glyphs.tsx`.
- `src/os/apps/ipod/`: the iPod's full-screen views (Cover Flow, Brick,
  Music Quiz), which take the wheel through a `ScreenInput`, and the
  `Marquee` used for long titles. The iPod's own settings (theme,
  backlight, artwork or video) live in `os-ipod`. Return is the centre
  button: it chooses when let go, and holds when held (`useCentreKey`).
- `src/os/media/playlists.ts` (with `apps/ipod/SavePlaylist.tsx` and
  `Stars.tsx`): ratings and playlists. Music › Playlists lists
  On-The-Go, the smart playlists (My Top Rated: four stars and up; Recently
  Played: played to the end in the last two weeks, 25 at most; Top 25
  Most Played) and Jincheng's own playlists, by name. Ratings, plays and
  playlists are Jincheng's, in the database (`song_stats`, `playlists`,
  `playlist_songs`; [supabase.md](supabase.md)), and every iPod shows
  them: `useListeningRefresh()` reads them when the iPod opens and when
  the tab comes back, at most every 30 s, and drops a read that started
  before a change made on the page. On Now Playing the centre button
  shows the rating in place of the progress bar, for four seconds after
  the last touch. Signed in as the owner, the wheel changes it; it's
  saved once the wheel has rested (`SAVE_RATING_AFTER_MS`, 0.8 s), one
  save after another, and put back if the database refuses it. Anyone
  else sees "Jincheng's rating", and the wheel is the volume again. A
  play counts when Jincheng listens to a song to the end (`countPlay()`,
  called by `player.ts` when YouTube says the video ended); no one
  else's count. Holding the centre button (`HOLD_MS`, 0.6 s) puts the
  song, album, artist or playlist chosen (the song playing, on Now
  Playing) into On-The-Go, and its row flashes; in a playlist that can
  be changed (On-The-Go, and Jincheng's own when signed in as the owner)
  it takes the song out instead. On-The-Go is each visitor's own, in
  `os-ipod-on-the-go` (their other tabs share it; 500 songs at most).
  Jincheng's has Save Playlist, which saves it for everyone under a name
  ("New Playlist 1" to start; the name of a playlist that's there adds
  the songs to it) and then empties it, and Jincheng's playlists have
  Delete Playlist. Settings › Now Playing switches between the artwork
  and the video.
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
- DVD Player (`apps/dvdplayer/`, `media/discs.ts`, `media/drive.ts`,
  `media/discArt.tsx`): YouTube videos burned onto discs. Jincheng's
  discs are the library's `discs` (Supabase's `public.discs`, burned from
  Telegram with `/dvd` or from the site signed in as the owner); a
  visitor's own are DVD-Rs kept in `os-dvds` (at most 50), never sent
  anywhere. Both live in Finder's Movies folder, whose icons are the
  discs' cases: the video's own picture (its thumbnail or a frame a
  quarter, half or three quarters in, `maxres` where YouTube made one,
  cropped at `coverX`; `hq` ones are zoomed past their black bars). The
  library's copy can be a minute old at the edge, so Movies and DVD
  Player read the shelf from the database as they open (at most every
  30 s), and what the owner changes shows at once. Burn reads a link
  with `supabase/functions/_shared/youtube.ts`, as the bot does, and
  YouTube's oEmbed from the browser; the four pictures are asked for with
  HEAD, nothing downloaded. Opening a disc slides it into the drive and
  opens DVD Player (desktop.md); Eject (the Controller or ⌘E) slides it
  out. Opening the disc already in the drive only brings DVD Player
  forward, and what's playing plays on (Jincheng's disc and a visitor's
  DVD-R of the same video are two discs); a different disc opened while
  one slides in goes in after it. DVD Player shows the disc as the shelf
  has it now, so one relabelled while it's in shows its new name.
  Nothing goes on the desktop: no disc icon while it plays. A video is four chapters of equal
  length, pictured by YouTube's own frames. DVD Player has its own
  player, made as the disc goes in and cued so Play Movie starts inside
  the click; it follows the one sound switch and the music's volume,
  and shares the speakers with the iPod and Karaoke: playing a disc
  pauses the music, and music starting (or Listen along) pauses the
  disc. When YouTube can't be reached, or won't play the video, Play
  does nothing and a note says why; a player not ready 8 s after Play
  isn't claimed to be playing. A disc's length is learned as it plays and kept (a DVD-R's in
  the browser, one of Jincheng's in the database when the owner watches
  it, once it's known the owner is watching).
  When Jincheng burns a disc, whoever is on the desktop gets a notice
  with Play DVD, as for a song played for everyone (`media/discWatch.ts`,
  over Realtime; the page that burned it isn't told). A change Realtime
  brings counts as a write: a shelf read already under way is dropped,
  so it can't put the old shelf back.
- The iTunes Artwork screen saver (`Artwork` in `shell/savers.tsx`, the
  arithmetic in `shell/artwork.ts`) turns the library's covers over on
  a wall. Not being an app with a manifest, it calls `loadLibrary()`
  itself, and stays black if the library can't be read; see
  [desktop.md](desktop.md).
