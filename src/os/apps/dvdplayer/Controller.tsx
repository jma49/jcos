import { useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { PauseGlyph, PlayGlyph, SpeakerLowGlyph } from '../../core/glyphs';
import { loadSettings, updateJSON } from '../../core/storage';
import { releaseAfterPointer } from '../../core/useKeys';
import { MENU_BAR_HEIGHT } from '../../core/store';
import type { Rect } from '../../core/types';
import { ChapterBackGlyph, ChapterNextGlyph, EjectGlyph, FastForwardGlyph, RewindGlyph, StopGlyph } from './glyphs';

// The Controller: Tiger's DVD Player remote. On a desktop it floats by
// itself below the picture, a panel as on a Mac: it shows while DVD
// Player is the window in front and hides with it. It has the round pad
// for the disc's menus, a small grey-green display, Menu and Title, the
// music's volume, and the transport: stop, previous chapter, play or
// pause, next chapter and eject. The drawer at its end slides out rewind,
// fast forward and loop. Dragged by its metal, it stays where it's left
// (os-dvd). A phone has the full-screen controls instead (FullScreen.tsx).

const SETTINGS_KEY = 'os-dvd';
const WIDTH = 486;
const HEIGHT = 86;

/** Where the Controller was left, as a share of the screen; null for below the picture. */
type Place = { x: number; y: number } | null;

export interface ControllerProps {
  /** What the display shows. */
  lcd: { title: string; chapter: string; time: string; left: string; playing: boolean };
  playing: boolean;
  loop: boolean;
  volume: number;
  /** Whether anything's in the drive. */
  loaded: boolean;
  onPad: (dir: 'up' | 'down' | 'left' | 'right') => void;
  onEnter: () => void;
  onMenu: () => void;
  onStop: () => void;
  onPrevious: () => void;
  onPlayPause: () => void;
  onNext: () => void;
  onEject: () => void;
  onRewind: () => void;
  onForward: () => void;
  onLoop: () => void;
  onVolume: (volume: number) => void;
}

/** The remote's buttons and display, wherever it's drawn. */
function Remote(p: ControllerProps & { drawer: boolean; onDrawer: () => void }) {
  const pad = (dir: 'up' | 'down' | 'left' | 'right', label: string) => (
    <button type="button" className={`os-dvd-pad-${dir}`} aria-label={label} disabled={!p.loaded} onClick={() => p.onPad(dir)} />
  );
  return (
    <>
      <div className="os-dvd-ctl">
        <div className="os-dvd-pad" role="group" aria-label="Menu navigation">
          {pad('up', 'Up')}
          {pad('down', 'Down')}
          {pad('left', 'Left')}
          {pad('right', 'Right')}
          <button type="button" className="os-dvd-enter" disabled={!p.loaded} onClick={p.onEnter}>
            Enter
          </button>
        </div>
        <div className="os-dvd-mid">
          <div className="os-dvd-lcd" aria-live="off">
            <b>{p.lcd.title}</b>
            <span>{p.lcd.chapter}</span>
            <span className="os-dvd-lcd-time">
              {p.lcd.playing ? '▶' : '❚❚'} {p.lcd.time}
            </span>
            <span>{p.lcd.left}</span>
          </div>
          <div className="os-dvd-row">
            <button type="button" className="os-button" disabled={!p.loaded} onClick={p.onMenu}>
              Menu
            </button>
            <button type="button" className="os-button" disabled={!p.loaded} onClick={p.onMenu} title="The disc’s title menu">
              Title
            </button>
            <span className="os-dvd-vol" aria-hidden="true">
              <SpeakerLowGlyph />
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
          </div>
        </div>
        <div className="os-dvd-transport">
          <button type="button" className="os-dvd-btn" aria-label="Stop" title="Stop" disabled={!p.loaded} onClick={p.onStop}>
            <StopGlyph />
          </button>
          <button type="button" className="os-dvd-btn" aria-label="Previous chapter" title="Previous chapter" disabled={!p.loaded} onClick={p.onPrevious}>
            <ChapterBackGlyph />
          </button>
          <button
            type="button"
            className="os-dvd-btn os-dvd-btn-big"
            aria-label={p.playing ? 'Pause' : 'Play'}
            title={p.playing ? 'Pause (Space)' : 'Play (Space)'}
            disabled={!p.loaded}
            onClick={p.onPlayPause}
          >
            {p.playing ? <PauseGlyph /> : <PlayGlyph />}
          </button>
          <button type="button" className="os-dvd-btn" aria-label="Next chapter" title="Next chapter" disabled={!p.loaded} onClick={p.onNext}>
            <ChapterNextGlyph />
          </button>
          <button type="button" className="os-dvd-btn" aria-label="Eject" title="Eject (⌘E)" disabled={!p.loaded} onClick={p.onEject}>
            <EjectGlyph />
          </button>
        </div>
        <button type="button" className="os-dvd-pull" aria-label={p.drawer ? 'Fewer controls' : 'More controls'} aria-expanded={p.drawer} onClick={p.onDrawer}>
          <i />
          <i />
          <i />
        </button>
      </div>
      {p.drawer && (
        <div className="os-dvd-drawer">
          <button type="button" className="os-button" disabled={!p.loaded} onClick={p.onRewind} title="Back 10 seconds">
            <RewindGlyph /> 10 s
          </button>
          <button type="button" className="os-button" disabled={!p.loaded} onClick={p.onForward} title="Ahead 10 seconds">
            <FastForwardGlyph /> 10 s
          </button>
          <button type="button" className="os-button" aria-pressed={p.loop} disabled={!p.loaded} onClick={p.onLoop}>
            Loop {p.loop ? 'On' : 'Off'}
          </button>
        </div>
      )}
    </>
  );
}

/**
 * The Controller floating on the desktop, at `z` (just above the windows),
 * below `below` (the DVD Player window) until it has been moved.
 */
export function FloatingController({ below, z, ...props }: ControllerProps & { below: Rect; z: number }) {
  const [drawer, setDrawer] = useState(false);
  const [place, setPlace] = useState<Place>(() => loadSettings<{ controller: Place }>(SETTINGS_KEY, { controller: null }).controller);
  const [dragging, setDragging] = useState<{ x: number; y: number } | null>(null);
  const root = document.querySelector('.os-root');
  if (!root) return null;

  const height = HEIGHT + (drawer ? 34 : 0);
  const fit = (x: number, y: number) => ({
    x: Math.min(Math.max(0, window.innerWidth - WIDTH), Math.max(0, x)),
    y: Math.min(Math.max(MENU_BAR_HEIGHT, window.innerHeight - height), Math.max(MENU_BAR_HEIGHT, y))
  });
  const at = dragging ?? (place ? fit(place.x * window.innerWidth, place.y * window.innerHeight) : fit(below.x + (below.width - WIDTH) / 2, below.y + below.height + 12));

  // Dragged by its metal, not by its buttons.
  const drag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, input')) return;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const start = { px: e.clientX, py: e.clientY, x: at.x, y: at.y };
    let last = at;
    const move = (ev: PointerEvent) => {
      last = fit(start.x + ev.clientX - start.px, start.y + ev.clientY - start.py);
      setDragging(last);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      setDragging(null);
      const next = { x: last.x / window.innerWidth, y: last.y / window.innerHeight };
      setPlace(next);
      updateJSON<{ controller: Place }>(SETTINGS_KEY, { controller: null }, (stored) => ({ ...stored, controller: next }));
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  // data-panel: a panel of DVD Player's own, so keys pressed on it stay the app's (core/useKeys.ts).
  return createPortal(
    <div
      className="os-dvd-controller"
      role="toolbar"
      aria-label="DVD Controller"
      data-panel=""
      data-drawer={drawer || undefined}
      style={{ left: at.x, top: at.y, zIndex: z } as CSSProperties}
      onPointerDown={drag}
    >
      <Remote {...props} drawer={drawer} onDrawer={() => setDrawer((d) => !d)} />
    </div>,
    root
  );
}
