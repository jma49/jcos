import { useEffect, useRef, useState } from 'react';
import type { AppProps } from '../registry';
import { useFocusedId } from '../store';
import { lineAt, useLyrics, type LyricLine } from '../lyrics';
import { coverOf, currentTime, formatTime, lyricOffset, seek, seekBy, SONGS, useClock, useKeys, useMusic, usePlayer } from '../music';

// Karaoke: the song's video fills the window and its lyrics sweep across in
// time, one line at a time (lrclib has line timings, not word timings, so a
// line fills over its length). It shares the iPod's library and "now
// playing": opened while the iPod plays, it carries on from the same second.
//
// Keys: Space play/pause, ←/→ 5 s back/forward, ↑/↓ previous/next song,
// ] brings the lyrics sooner and [ later, F full screen.

const NUDGE = 100;

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
  const firstAt = lines?.[0]?.time ?? 0;
  const tweak = music.offsets[song.id] ?? 0;

  return (
    <div ref={root} className="os-app os-karaoke">
      <div className="os-karaoke-video" ref={host} aria-hidden="true" />
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
        ) : line < 0 ? (
          <div className="os-karaoke-title">
            <strong>{song.title}</strong>
            <small>{song.artist}</small>
            {lyrics.state === 'loading' && <em>Finding the lyrics…</em>}
            {lyrics.state === 'none' && <em>No synced lyrics for this one. Hum along.</em>}
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
          <ul>
            {SONGS.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  aria-current={i === music.index}
                  onClick={() => {
                    music.play('karaoke', i);
                    setPicking(false);
                  }}
                >
                  <img src={coverOf(s)} alt="" loading="lazy" />
                  <span>
                    <strong>{s.title}</strong>
                    <small>{s.artist}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
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
        <div className="os-karaoke-offset" title="Lyrics timing: − later, + sooner (or [ and ])">
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
