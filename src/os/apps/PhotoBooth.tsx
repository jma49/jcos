import { useEffect, useRef, useState } from 'react';
import type { AppProps } from '../core/registry';
import { useWindows } from '../core/store';
import { play } from '../core/sound';
import { loadJSON, saveJSON } from '../core/storage';

// Photo Booth, as Leopard's: the camera in a mirror, a grid of effects to
// look through, a 3-2-1 countdown with a white flash, and a strip of the
// pictures taken. Pictures stay in this browser; one can be downloaded or
// made the desktop picture. The camera is only on while the window is open.

interface Effect {
  name: string;
  /** A CSS filter, used for the live view and (where canvases support it) the picture. */
  filter: string;
}

// Arranged as Photo Booth arranged them: Normal in the middle.
const EFFECTS: Effect[] = [
  { name: 'Sepia', filter: 'sepia(90%) contrast(110%)' },
  { name: 'Black & White', filter: 'grayscale(100%) contrast(120%)' },
  { name: 'Glow', filter: 'brightness(120%) contrast(90%) saturate(130%) blur(1px)' },
  { name: 'Thermal', filter: 'invert(100%) hue-rotate(180deg) saturate(400%) contrast(140%)' },
  { name: 'Normal', filter: 'none' },
  { name: 'X-Ray', filter: 'grayscale(100%) invert(100%) contrast(130%)' },
  { name: 'Pop Art', filter: 'saturate(450%) contrast(160%)' },
  { name: 'Cold Blue', filter: 'hue-rotate(200deg) saturate(160%)' },
  { name: 'Vintage', filter: 'sepia(60%) saturate(140%) hue-rotate(-15deg) contrast(115%) brightness(95%)' }
];
const NORMAL = 4;

const KEY = 'os-photobooth';
/** Pictures kept; the oldest goes when there are more. */
const KEEP = 8;
/** The width pictures are saved at, to keep them small enough for the browser's storage. */
const WIDTH = 640;

type Mode = 'single' | 'four';
type Camera = { state: 'starting' } | { state: 'on' } | { state: 'off'; reason: string };

/** Whether a canvas can apply CSS filters as it draws (not in older Safari). */
const canvasFilters = () => typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;

/** One frame of the video, mirrored like the view and with the effect applied, as a canvas. */
function frame(video: HTMLVideoElement, effect: Effect, width = WIDTH) {
  const height = Math.round((video.videoHeight / video.videoWidth) * width) || Math.round(width * 0.75);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  if (canvasFilters()) ctx.filter = effect.filter;
  ctx.translate(width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, width, height);
  return canvas;
}

/** Four frames in a 2 × 2 grid, the way Photo Booth's four-up did. */
function fourUp(frames: HTMLCanvasElement[]) {
  const [w, h] = [frames[0].width / 2, frames[0].height / 2];
  const canvas = document.createElement('canvas');
  canvas.width = w * 2;
  canvas.height = h * 2;
  const ctx = canvas.getContext('2d')!;
  frames.forEach((f, i) => ctx.drawImage(f, (i % 2) * w, Math.floor(i / 2) * h, w, h));
  return canvas;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function PhotoBooth(_: AppProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [camera, setCamera] = useState<Camera>({ state: 'starting' });
  const [effect, setEffect] = useState(NORMAL);
  const [browsing, setBrowsing] = useState(false);
  const [mode, setMode] = useState<Mode>('single');
  const [count, setCount] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [photos, setPhotos] = useState<string[]>(() => loadJSON<string[]>(KEY, []).filter((p) => typeof p === 'string' && p.startsWith('data:image/')));
  const [viewing, setViewing] = useState<string | null>(null);
  const wallpaper = useWindows((s) => s.wallpaper);

  // The camera, for as long as the window is open.
  useEffect(() => {
    let live = true;
    let got: MediaStream | null = null;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera({ state: 'off', reason: 'This browser can’t use a camera here.' });
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      .then((s) => {
        if (!live) return s.getTracks().forEach((t) => t.stop());
        got = s;
        setStream(s);
        setCamera({ state: 'on' });
      })
      .catch((error: DOMException) => {
        if (!live) return;
        const reason =
          error.name === 'NotAllowedError'
            ? 'Photo Booth needs your permission to use the camera. Allow it in the address bar, then open Photo Booth again.'
            : error.name === 'NotFoundError' || error.name === 'OverconstrainedError'
              ? 'There’s no camera connected.'
              : 'The camera isn’t available right now. Another app may be using it.';
        setCamera({ state: 'off', reason });
      });
    return () => {
      live = false;
      got?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (video.current && stream) video.current.srcObject = stream;
  }, [stream, browsing, viewing]);

  const keep = (url: string) => {
    setPhotos((all) => {
      const next = [url, ...all].slice(0, KEEP);
      saveJSON(KEY, next);
      return next;
    });
  };

  const shoot = async () => {
    const v = video.current;
    if (!v || camera.state !== 'on' || count !== null) return;
    setViewing(null);
    setBrowsing(false);
    for (const n of [3, 2, 1]) {
      setCount(n);
      play('tick');
      await wait(800);
    }
    setCount(null);
    const shots: HTMLCanvasElement[] = [];
    for (let i = 0; i < (mode === 'four' ? 4 : 1); i++) {
      if (i > 0) await wait(650);
      setFlash(true);
      play('shutter');
      shots.push(frame(v, EFFECTS[effect]));
      setTimeout(() => setFlash(false), 220);
    }
    const picture = mode === 'four' ? fourUp(shots) : shots[0];
    keep(picture.toDataURL('image/jpeg', 0.82));
  };

  const remove = (url: string) => {
    setPhotos((all) => {
      const next = all.filter((p) => p !== url);
      saveJSON(KEY, next);
      return next;
    });
    if (viewing === url) setViewing(null);
  };

  const current = EFFECTS[effect];

  return (
    <div className="os-app os-booth">
      <div className="os-booth-stage">
        {viewing ? (
          <img className="os-booth-picture" src={viewing} alt="A picture taken in Photo Booth" />
        ) : browsing && camera.state === 'on' ? (
          <div className="os-booth-effects" role="listbox" aria-label="Effects">
            {EFFECTS.map((e, i) => (
              <button
                key={e.name}
                type="button"
                role="option"
                aria-selected={i === effect}
                onClick={() => {
                  setEffect(i);
                  setBrowsing(false);
                }}
              >
                <EffectPreview stream={stream} filter={e.filter} />
                <span>{e.name}</span>
              </button>
            ))}
          </div>
        ) : camera.state === 'off' ? (
          <p className="os-booth-message">{camera.reason}</p>
        ) : (
          <video ref={video} className="os-booth-video" style={{ filter: current.filter }} autoPlay playsInline muted />
        )}
        {count !== null && <span className="os-booth-count">{count}</span>}
        {flash && <span className="os-booth-flash" aria-hidden="true" />}
        {camera.state === 'starting' && !viewing && <p className="os-booth-message">Starting the camera…</p>}
        {viewing && (
          <div className="os-booth-actions">
            <a className="os-button" href={viewing} download={`Photo Booth ${new Date().toISOString().slice(0, 10)}.jpg`}>
              Download
            </a>
            <button
              type="button"
              className="os-button"
              disabled={wallpaper === viewing}
              onClick={() => useWindows.getState().setWallpaper(viewing)}
            >
              {wallpaper === viewing ? 'Desktop Picture ✓' : 'Set as Desktop Picture'}
            </button>
          </div>
        )}
      </div>

      <div className="os-booth-bar">
        <div className="os-segmented" role="group" aria-label="Pictures">
          <button type="button" aria-pressed={mode === 'single'} onClick={() => setMode('single')} title="Take one picture">
            ▢
          </button>
          <button type="button" aria-pressed={mode === 'four'} onClick={() => setMode('four')} title="Take four quick pictures">
            ⊞
          </button>
        </div>
        <button
          type="button"
          className="os-booth-shutter"
          onClick={viewing ? () => setViewing(null) : shoot}
          disabled={camera.state !== 'on' || count !== null}
          aria-label={viewing ? 'Back to the camera' : 'Take a picture'}
          title={viewing ? 'Back to the camera' : 'Take a picture'}
        >
          <svg viewBox="0 0 24 18" width="26" height="20" aria-hidden="true">
            <path d="M7 3l1.6-2.4h6.8L17 3h4.5A2.5 2.5 0 0 1 24 5.5v10a2.5 2.5 0 0 1-2.5 2.5h-19A2.5 2.5 0 0 1 0 15.5v-10A2.5 2.5 0 0 1 2.5 3z" fill="currentColor" />
            <circle cx="12" cy="10" r="4.6" fill="none" stroke="#c9261d" strokeWidth="2" />
          </svg>
        </button>
        <button
          type="button"
          className="os-button"
          aria-pressed={browsing}
          disabled={camera.state !== 'on'}
          onClick={() => {
            setViewing(null);
            setBrowsing((b) => !b);
          }}
        >
          {effect === NORMAL ? 'Effects' : current.name}
        </button>
      </div>

      <div className="os-booth-strip" aria-label="Pictures taken">
        {photos.length === 0 && <p>Pictures you take appear here. They stay in this browser.</p>}
        {photos.map((url, i) => (
          <div key={url.slice(-40) + i} className="os-booth-thumb" data-selected={viewing === url || undefined}>
            <button type="button" onClick={() => setViewing(viewing === url ? null : url)} aria-label={`Picture ${i + 1}`}>
              <img src={url} alt="" />
            </button>
            <button type="button" className="os-booth-remove" onClick={() => remove(url)} aria-label="Delete picture" title="Delete">
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** One tile of the effects grid: the camera, live, through that effect. */
function EffectPreview({ stream, filter }: { stream: MediaStream | null; filter: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && stream) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} className="os-booth-video" style={{ filter }} autoPlay playsInline muted />;
}
