# Music, lyrics and video

The iPod, Karaoke and everything that plays sound. Two rules hold
everywhere: the sound switch and volume in the menu bar govern every
sound, the music included (`setLoudness()` in `music.ts`), and YouTube's
own chrome never shows.

- `src/os/media/music.ts`, `lyrics.ts`, `apps/ipod/IPod.tsx` and `apps/karaoke/`:
  the iPod (click wheel, menus, Now Playing with the video and a line of
  lyrics) and Karaoke (full-window video with lyrics that fill as they're
  sung, or a listening view for instrumentals). `src/data/songs.json`
  holds `albums` (whole albums, with cover, year and a note) and `songs`
  (YouTube video id, title, artist, `album`, square `cover` art from
  Apple's catalogue, `track` for album tracks, `instrumental`). Playback
  uses the YouTube IFrame API; the app used last owns playback and hands
  the position over when the other takes it, and ⏭/⏮ follow the queue a
  song was started from (album, artist or all). Lyrics come from
  lrclib.net in the browser, or, when it has none, from NetEase through
  `api/lyrics.ts` (a Vercel Function; converted to Traditional Chinese).
  To add a song, add its video id, title, artist, album and cover; tune
  `offset` (ms the lyrics run ahead of the video, negative for videos
  with an intro) by nudging it in Karaoke with `[`/`]` and adding the
  tweak it shows, and set `lyrics` to an lrclib id if the search picks
  the wrong entry. Prefer album audio (a "Topic" or label upload) over
  music videos, whose edits don't match the lyrics' timing. Visitors'
  own timing tweaks live in `os-lyric-offsets`. YouTube's own chrome must
  never show: players go in a `.os-player-frame` (300px taller than the
  space, so the title bar and logo are cut off) and the app covers the
  video with the artwork until `usePlayer`'s `live` is true.
- `src/os/apps/ipod/`: the iPod's full-screen views (Cover Flow, Brick,
  Music Quiz), which take the wheel through a `ScreenInput`, and the
  `Marquee` used for long titles. The iPod's own settings (theme,
  backlight, artwork or video) live in `os-ipod`.
- `src/os/shell/NowPlaying.tsx`: the menu bar's ♫ while a song is on, with a
  card to control it; it also feeds the Media Session API. The Dynamic
  desktop picture `dynamic:cover` shows the playing song's cover,
  blurred.
