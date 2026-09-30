import { PauseGlyph, PlayGlyph, SpeakerHighGlyph } from '../../core/glyphs';
import { releaseAfterPointer } from '../../core/useKeys';
import { useScrub } from '../../core/useScrub';
import { chapterPictures, chapterStart, type ShelfDisc } from '../../media/discs';
import { formatTime } from '../../media/music';
import {
  ChapterBackGlyph,
  ChapterNextGlyph,
  EjectGlyph,
  ExitFullScreenGlyph,
  FastForwardGlyph,
  FullScreenGlyph,
  RewindGlyph,
  StopGlyph
} from './glyphs';

// Leopard's full screen for DVD Player: the picture fills the screen, the
// chapters come down along the top and the controls up along the bottom
// when the pointer moves, and go again when it rests. On a phone, where
// DVD Player has the whole screen anyway, this is how it always looks.

export interface HudProps {
  disc: ShelfDisc;
  time: number;
  duration: number;
  chapter: number;
  playing: boolean;
  volume: number;
  /** Full screen (else a phone's window), for the button that leaves it or goes into it. */
  full: boolean;
  canFullScreen: boolean;
  onChapter: (n: number) => void;
  /** A seek from the position slider: `done` once it's let go (see useScrub). */
  onSeek: (seconds: number, done: boolean) => void;
  onMenu: () => void;
  onEject: () => void;
  onStop: () => void;
  onPrevious: () => void;
  onRewind: () => void;
  onPlayPause: () => void;
  onForward: () => void;
  onNext: () => void;
  onVolume: (volume: number) => void;
  onFullScreen: () => void;
}

/** The chapters along the top: YouTube's frame where each starts, and the one playing picked out. */
export function Chapters({ disc, duration, chapter, onChapter }: Pick<HudProps, 'disc' | 'duration' | 'chapter' | 'onChapter'>) {
  return (
    <nav className="os-dvd-chapters" aria-label="Chapters">
      <span className="os-dvd-chapters-label">Chapters</span>
      {chapterPictures(disc.id).map((src, n) => (
        <button key={src} type="button" aria-current={n === chapter || undefined} onClick={() => onChapter(n)}>
          <img src={src} alt="" draggable={false} />
          <span>
            Chapter {n + 1}
            {duration > 0 && ` · ${formatTime(chapterStart(n, duration))}`}
          </span>
        </button>
      ))}
    </nav>
  );
}

/** The controls along the bottom: where it is, the buttons, the music's volume, and the way out. */
export function Hud(p: HudProps) {
  const scrub = useScrub(p.time, p.onSeek);
  const left = Math.max(0, p.duration - scrub.value);
  return (
    <div className="os-dvd-hud" role="toolbar" aria-label="DVD controls">
      <div className="os-dvd-hud-time">
        <span>{formatTime(scrub.value)}</span>
        <input
          type="range"
          min={0}
          max={Math.max(1, Math.round(p.duration))}
          step={1}
          value={scrub.value}
          disabled={p.duration <= 0}
          onPointerDown={(e) => {
            scrub.onPointerDown();
            releaseAfterPointer(e);
          }}
          onChange={scrub.onChange}
          aria-label="Position"
        />
        <span>{p.duration > 0 ? `−${formatTime(left)}` : ''}</span>
      </div>
      <div className="os-dvd-hud-buttons">
        <div>
          <button type="button" className="os-dvd-hud-word" onClick={p.onMenu}>
            Menu
          </button>
          <button type="button" className="os-dvd-hud-word" onClick={p.onMenu} title="The disc’s title menu">
            Title
          </button>
          <button type="button" aria-label="Eject" title="Eject (⌘E)" onClick={p.onEject}>
            <EjectGlyph />
          </button>
        </div>
        <div>
          <button type="button" aria-label="Stop" onClick={p.onStop}>
            <StopGlyph />
          </button>
          <button type="button" aria-label="Previous chapter" onClick={p.onPrevious}>
            <ChapterBackGlyph />
          </button>
          <button type="button" aria-label="Back 10 seconds" onClick={p.onRewind}>
            <RewindGlyph />
          </button>
          <button type="button" className="os-dvd-hud-play" aria-label={p.playing ? 'Pause' : 'Play'} onClick={p.onPlayPause}>
            {p.playing ? <PauseGlyph /> : <PlayGlyph />}
          </button>
          <button type="button" aria-label="Ahead 10 seconds" onClick={p.onForward}>
            <FastForwardGlyph />
          </button>
          <button type="button" aria-label="Next chapter" onClick={p.onNext}>
            <ChapterNextGlyph />
          </button>
        </div>
        <div>
          <span className="os-dvd-hud-vol" aria-hidden="true">
            <SpeakerHighGlyph />
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={p.volume}
            onPointerDown={releaseAfterPointer}
            onChange={(e) => p.onVolume(Number(e.target.value))}
            aria-label="Volume"
          />
          {p.canFullScreen && (
            <button
              type="button"
              aria-label={p.full ? 'Leave full screen' : 'Full screen'}
              title={p.full ? 'Leave full screen (Escape)' : 'Full screen (⌘F)'}
              onClick={p.onFullScreen}
            >
              {p.full ? <ExitFullScreenGlyph /> : <FullScreenGlyph />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
