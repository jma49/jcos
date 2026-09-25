import { useEffect, useRef, useState } from 'react';
import type { AppProps } from '../registry';
import { useFocusedId } from '../store';
import { lineAt, useLyrics, type LyricLine } from '../lyrics';
import { albumOf, ALBUMS, coverOf, currentTime, formatTime, lyricOffset, seek, seekBy, SONGS, tracksOf, useClock, useKeys, useMusic, usePlayer, type Song } from '../music';

// Karaoke: the song's video fills the window and its lyrics sweep across in
// time, one line at a time (lrclib has line timings, not word timings, so a
// line fills over its length). It shares the iPod's library and "now
// playing": opened while the iPod plays, it carries on from the same second.
//
// Songs without words (a piano album) or without synced lyrics get a
// listening view instead: the cover over a blur of itself, the album and
// what's next.
//
// Keys: Space play/pause, ←/→ 5 s back/forward, ↑/↓ previous/next song,
// ] brings the lyrics sooner and [ later, F full screen.

const NUDGE = 100;

/** The song picker's sections: each whole album, then everything else. */
const SECTIONS = [
  ...ALBUMS.map((album) => ({ album, list: tracksOf(album) })),
  { album: null, list: SONGS.flatMap((s, i) => (albumOf(s) ? [] : [i])) }
];

/** For a song with nothing to sing: its cover, what it is, and what's next. */
function Listening({ song, next, note }: { song: Song; next: Song | null; note?: string }) {
  const album = albumOf(song);
  return (
    <div className="os-karaoke-listen" key={song.id}>
      <img className="os-karaoke-cover" src={coverOf(song)} alt="" />
      <div className="os-karaoke-about">
        {album && (
          <p className="os-karaoke-eyebrow">
            {album.title} · {album.year}
          </p>
        )}
        <h2>{song.title}</h2>
        <p className="os-karaoke-by">
          {song.artist}
          {album && song.track ? ` · ${song.track} of ${tracksOf(album).length}` : ''}
        </p>
        {note && <p className="os-karaoke-note">{note}</p>}
        {album?.note && song.track === 1 && <p className="os-karaoke-blurb">{album.note}</p>}
        {next && <p className="os-karaoke-next">Next · {next.title}</p>}
      </div>
    </div>
  );
}

/** How long a line takes to fill: until the next one, but not dawdling over long gaps. */
function span(lines: LyricLine[], i: number) {
  const next = lines[i + 1]?.time ?? lines[i].time + 4;
  return Math.min(Math.max(0.6, (next - lines[i].time) * 0.92), 7);
}

export default function Karaoke({ win }: AppProps) {
  const { host, status } = usePlayer('karaoke');
  const music = useMusic();
  const { time, duration } = useClock(500);
  const song = SONGS[music.index];
  const mine = music.owner === 'karaoke';
  const lyrics = useLyrics(song, mine ? duration : 0);
  const offset = lyricOffset(song, music.offsets);
  const [line, setLine] = useState(-1);
  const [picking, setPicking] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const current = useRef<HTMLParagraphElement>(null);
  const focused = useFocusedId() === win.id;

  // Opened while the iPod is playing: take the song over from there.
  useEffect(() => {
    const s = useMusic.getState();
    if (s.owner === 'ipod' && s.playing) s.play('karaoke');
  }, []);

  // Every frame: which line is being sung, and how far through it.
  const lines = lyrics.state === 'ready' ? lyrics.lines : null;
  useEffect(() => {
    if (!lines) return setLine(-1);
    let frame = 0;
    const tick = () => {
      const t = (mine ? currentTime() : 0) + offset;
      const i = lineAt(lines, t);
      setLine(i);
      if (i >= 0 && current.current) {
        const fill = Math.min(1, Math.max(0, (t - lines[i].time) / span(lines, i)));
        current.current.style.setProperty('--fill', `${(fill * 100).toFixed(1)}%`);
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [lines, offset, mine]);

  useKeys(focused, {
    ' ': () => music.toggle('karaoke'),
    ArrowLeft: () => seekBy(-5),
    ArrowRight: () => seekBy(5),
    ArrowUp: () => music.previous('karaoke'),
    ArrowDown: () => music.next('karaoke'),
    '[': () => music.nudge(song.id, -NUDGE),
    ']': () => music.nudge(song.id, NUDGE),
    f: () => fullScreen(),
    Escape: () => setPicking(false)
  });

  const fullScreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else root.current?.requestFullscreen?.().catch(() => {});
  };

  const text = (i: number) => (lines?.[i] ? lines[i].text || '♪' : '');
  const listening = lyrics.state === 'instrumental' || lyrics.state === 'none';
  const at = music.queue.indexOf(music.index);
  const nextIndex = at >= 0 && (at < music.queue.length - 1 || music.repeat === 'all') ? music.queue[(at + 1) % music.queue.length] : null;
  const firstAt = lines?.[0]?.time ?? 0;
  const tweak = music.offsets[song.id] ?? 0;

  return (
    <div ref={root} className="os-app os-karaoke">
      <div className="os-karaoke-video" ref={host} aria-hidden="true" />
      <div
        className="os-karaoke-backdrop"
        aria-hidden="true"
        data-show={(mine && listening) || undefined}
        style={{ backgroundImage: `url("${coverOf(song)}")` }}
      />
      <div className="os-karaoke-shade" aria-hidden="true" />

      <div className="os-karaoke-stage" aria-live="off">
        {status === 'offline' ? (
          <p className="os-karaoke-note">YouTube can’t be reached, so there’s nothing to sing along to.</p>
        ) : !mine ? (
          <button type="button" className="os-karaoke-start" onClick={() => music.play('karaoke')}>
            <span aria-hidden="true">▶</span>
            <strong>{song.title}</strong>
            <small>{song.artist}</small>
          </button>
        ) : listening ? (
          <Listening
            song={song}
            next={nextIndex !== null && nextIndex !== music.index ? SONGS[nextIndex] : null}
            note={lyrics.state === 'none' ? 'No synced lyrics for this one. Hum along.' : undefined}
          />
        ) : line < 0 ? (
          <div className="os-karaoke-title">
            <strong>{song.title}</strong>
            <small>{song.artist}</small>
            {lyrics.state === 'loading' && <em>Finding the lyrics…</em>}
            {lines && time + offset > firstAt - 3 && (
              <span className="os-karaoke-count" aria-hidden="true">
                {'●'.repeat(Math.max(1, Math.ceil(firstAt - time - offset)))}
              </span>
            )}
          </div>
        ) : (
          <div className="os-karaoke-lines" key={song.id}>
            <p className="os-karaoke-line" data-at="past">
              {text(line - 1)}
            </p>
            <p ref={current} className="os-karaoke-line" data-at="now" data-text={text(line)}>
              {text(line)}
            </p>
            <p className="os-karaoke-line" data-at="next">
              {text(line + 1)}
            </p>
            <p className="os-karaoke-line" data-at="later">
              {text(line + 2)}
            </p>
          </div>
        )}
      </div>

      {picking && (
        <div className="os-karaoke-picker" role="dialog" aria-label="Songs">
          {SECTIONS.map(({ album, list }) => (
            <section key={album?.title ?? 'singles'}>
              {album ? (
                <header className="os-karaoke-album">
                  <img src={album.cover} alt="" />
                  <span>
                    <strong>{album.title}</strong>
                    <small>
                      {album.artist} · {album.year} · {list.length} tracks
                    </small>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      music.setShuffle(false);
                      music.play('karaoke', list[0], list);
                      setPicking(false);
                    }}
                  >
                    Play
                  </button>
                </header>
              ) : (
                <h3>Songs</h3>
              )}
              <ul data-album={album ? true : undefined}>
                {list.map((i) => {
                  const s = SONGS[i];
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        aria-current={i === music.index}
                        onClick={() => {
                          music.play('karaoke', i, list);
                          setPicking(false);
                        }}
                      >
                        {album ? <span className="os-karaoke-track">{s.track}</span> : <img src={coverOf(s)} alt="" loading="lazy" />}
                        <span>
                          <strong>{s.title}</strong>
                          {!album && <small>{s.artist}</small>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <div className="os-karaoke-bar">
        <button type="button" className="os-karaoke-song" onClick={() => setPicking(!picking)} aria-expanded={picking}>
          <strong>{song.title}</strong>
          <small>{song.artist}</small>
        </button>
        <div className="os-karaoke-transport">
          <button type="button" onClick={() => music.previous('karaoke')} aria-label="Previous song">
            ⏮
          </button>
          <button type="button" onClick={() => music.toggle('karaoke')} aria-label={mine && music.playing ? 'Pause' : 'Play'}>
            {mine && music.playing ? '❚❚' : '▶'}
          </button>
          <button type="button" onClick={() => music.next('karaoke')} aria-label="Next song">
            ⏭
          </button>
        </div>
        <div className="os-karaoke-time">
          <time>{formatTime(mine ? time : 0)}</time>
          <input
            type="range"
            min={0}
            max={Math.max(1, Math.round(duration))}
            step={1}
            value={mine ? Math.round(time) : 0}
            disabled={!mine}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="Position"
          />
          <time>{formatTime(mine ? duration : 0)}</time>
        </div>
        <div className="os-karaoke-offset" title="Lyrics timing: − later, + sooner (or [ and ])" hidden={listening}>
          <button type="button" onClick={() => music.nudge(song.id, -NUDGE)} aria-label="Lyrics later">
            −
          </button>
          <span>{tweak === 0 ? 'Sync' : `${tweak > 0 ? '+' : ''}${(tweak / 1000).toFixed(1)}s`}</span>
          <button type="button" onClick={() => music.nudge(song.id, NUDGE)} aria-label="Lyrics sooner">
            +
          </button>
        </div>
        <button type="button" onClick={fullScreen} aria-label="Full screen">
          ⛶
        </button>
      </div>
    </div>
  );
}
