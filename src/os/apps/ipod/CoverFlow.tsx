import { useEffect, useState } from 'react';
import { albumNamed, coverOf, SONGS, tracksOf } from '../../music';
import type { ScreenInput } from './input';

// Cover Flow, as on the iPod classic: the albums stand in a row, the one in
// front faces you and the rest turn away, each over its reflection. Turn
// the wheel to leaf through them; the centre button turns the album round
// to its track list, and again plays the chosen track.

export interface FlowAlbum {
  title: string;
  artist: string;
  cover: string;
  tracks: number[];
}

/** Every album a song comes from: whole albums in track order, then singles' albums. */
export function flowAlbums(): FlowAlbum[] {
  const titles = [...new Set(SONGS.map((s) => s.album).filter((a): a is string => !!a))];
  return titles
    .map((title) => {
      const whole = albumNamed(title);
      const tracks = whole ? tracksOf(whole) : SONGS.flatMap((s, i) => (s.album === title ? [i] : []));
      const first = SONGS[tracks[0]];
      return { title, artist: first.artist, cover: whole?.cover ?? coverOf(first), tracks };
    })
    .sort((a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title));
}

const ALBUMS = flowAlbums();

/** Where a cover stands `d` places from the front one. */
function place(d: number) {
  if (d === 0) return 'translateX(-50%) translateZ(26px)';
  const side = Math.sign(d);
  const x = side * (62 + (Math.abs(d) - 1) * 22);
  return `translateX(calc(-50% + ${x}px)) translateZ(-34px) rotateY(${-side * 66}deg)`;
}

export function CoverFlow({
  input,
  start,
  onPlay
}: {
  input: (handle: ScreenInput | null) => void;
  /** The album to open on: the one playing, if any. */
  start?: string;
  onPlay: (index: number, queue: number[]) => void;
}) {
  const [at, setAt] = useState(() => Math.max(0, ALBUMS.findIndex((a) => a.title === start)));
  const [flipped, setFlipped] = useState(false);
  const [track, setTrack] = useState(0);
  const album = ALBUMS[at];

  useEffect(() => {
    input({
      step: (delta) => {
        if (flipped) setTrack((t) => Math.min(album.tracks.length - 1, Math.max(0, t + delta)));
        else setAt((a) => Math.min(ALBUMS.length - 1, Math.max(0, a + delta)));
      },
      choose: () => {
        if (!flipped) {
          setTrack(0);
          setFlipped(true);
        } else {
          onPlay(album.tracks[track], album.tracks);
        }
      },
      // MENU turns the album back round before it leaves Cover Flow.
      back: () => {
        if (!flipped) return false;
        setFlipped(false);
        return true;
      }
    });
    return () => input(null);
  }, [input, flipped, album, track, onPlay]);

  // Keep the chosen track in view on the back of the album.
  const listTop = Math.max(0, track - 5) * -17;

  return (
    <div className="os-cf" data-flipped={flipped || undefined}>
      <div className="os-cf-stage">
        {ALBUMS.map((a, i) => {
          const d = i - at;
          if (Math.abs(d) > 5) return null;
          return (
            <img
              key={a.title}
              className="os-cf-cover"
              src={a.cover}
              alt=""
              draggable={false}
              style={{ transform: place(d), zIndex: 20 - Math.abs(d) }}
              data-front={d === 0 || undefined}
            />
          );
        })}
      </div>
      <p className="os-cf-caption">
        <strong>{album.title}</strong>
        <span>{album.artist}</span>
      </p>
      {flipped && (
        <div className="os-cf-back" key={album.title}>
          <header>
            <img src={album.cover} alt="" />
            <span>
              <strong>{album.title}</strong>
              <small>{album.artist}</small>
            </span>
          </header>
          <ol style={{ translate: `0 ${listTop}px` }}>
            {album.tracks.map((i, n) => (
              <li key={i} aria-selected={n === track}>
                <span>{SONGS[i].track ?? n + 1}</span>
                {SONGS[i].title}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
