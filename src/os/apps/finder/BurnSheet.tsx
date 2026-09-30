import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { DiscCase, DiscIcon } from '../../media/discArt';
import { burnForEveryone, burnHere, coverChoices, lookUpVideo, PICTURES, type Looked, type ShelfDisc } from '../../media/discs';
import { useReduceMotion } from '../../core/system';
import { ownsKey } from '../../core/useKeys';

// Burn, in the Movies folder: a sheet that slides down from under the
// toolbar, as Tiger's Finder asked before burning a disc. Paste a YouTube
// link and it names the disc (the name and artist can be changed) and
// offers four pictures for the case; dragging the case moves the picture
// in it. Burning is a short progress bar, and the disc is written only
// when it ends, so Stop stops it. Jincheng's discs are for everyone;
// anyone else burns a DVD-R kept in their own browser.

/** How long the progress bar takes: the ceremony, since writing a disc is really one row. */
const BURN_MS = 1600;

export function BurnSheet({ owner, onBurned, onClose }: { owner: boolean; onBurned: (disc: ShelfDisc) => void; onClose: () => void }) {
  const [link, setLink] = useState('');
  const [looked, setLooked] = useState<Looked | null>(null);
  const [looking, setLooking] = useState(false);
  const [name, setName] = useState('');
  const [artist, setArtist] = useState('');
  /** Fields the visitor typed in, which a later look-up leaves alone. */
  const typed = useRef({ name: false, artist: false });
  const [pictures, setPictures] = useState<string[] | null>(null);
  const [picture, setPicture] = useState(0);
  const [coverX, setCoverX] = useState(50);
  const [burning, setBurning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reduced = useReduceMotion();
  const linkField = useRef<HTMLInputElement>(null);
  const burnTimer = useRef(0);

  useEffect(() => {
    linkField.current?.focus();
    return () => clearTimeout(burnTimer.current);
  }, []);

  // A moment after the link stops changing, it's read; a newer link
  // cancels the read of an older one.
  useEffect(() => {
    const text = link.trim();
    if (!text) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLooking(true);
      try {
        const found = await lookUpVideo(text, controller.signal);
        if (controller.signal.aborted) return;
        setLooked(found);
        if ('error' in found) return;
        if (!typed.current.name) setName(found.title);
        if (!typed.current.artist) setArtist(found.artist);
        const choices = await coverChoices(found.id, controller.signal);
        if (!controller.signal.aborted) setPictures(choices);
      } catch {
        if (!controller.signal.aborted) setLooked({ error: 'YouTube can’t be reached right now.' });
      } finally {
        if (!controller.signal.aborted) setLooking(false);
      }
    }, 350);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [link]);

  const video = looked && !('error' in looked) ? looked : null;
  const ready = !!video && !!pictures && name.trim().length > 0 && !burning;
  const draft = video && pictures ? { id: video.id, title: name.trim() || 'Untitled', artist: artist.trim(), cover: pictures[picture], coverX } : null;

  const burn = () => {
    if (!ready || !draft) return;
    setError(null);
    setBurning(true);
    burnTimer.current = window.setTimeout(
      async () => {
        try {
          onBurned(owner ? await burnForEveryone(draft) : burnHere(draft));
        } catch (e) {
          setBurning(false);
          setError(e instanceof Error ? e.message : 'The disc couldn’t be burned.');
        }
      },
      reduced ? 0 : BURN_MS
    );
  };

  const stop = () => {
    clearTimeout(burnTimer.current);
    setBurning(false);
  };

  // The sheet has its window's keys, wherever in the window the focus is
  // (Finder's own are off meanwhile): Escape stops a burn or closes it, and
  // Return burns, as its default button. Inside the sheet, its fields and
  // buttons answer them themselves, and a control outside the window (a
  // Dock icon) keeps its own (ownsKey).
  const layer = useRef<HTMLDivElement>(null);
  const keys = useRef({ burning, burn, stop, onClose });
  useEffect(() => {
    keys.current = { burning, burn, stop, onClose };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.key !== 'Enter') return;
      const el = layer.current;
      if (!el || el.contains(e.target as Node) || el.closest('.os-window')?.getAttribute('data-focused') !== 'true' || !ownsKey(e)) return;
      e.preventDefault();
      const now = keys.current;
      if (e.key === 'Enter') now.burn();
      else if (now.burning) now.stop();
      else now.onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Dragging the case slides the picture sideways in it.
  const drag = (e: ReactPointerEvent<HTMLElement>) => {
    if (!draft || e.button !== 0) return;
    const el = e.currentTarget;
    const art = el.querySelector('.os-disc-case-art')?.getBoundingClientRect();
    if (!art) return;
    // How far the picture can move: its width at the case's height, less what the case shows.
    const zoom = /^(hq|sd)/.test(draft.cover) ? 4 / 3 : 1;
    const room = art.height * zoom * (16 / 9) - art.width;
    if (room <= 0) return;
    el.setPointerCapture(e.pointerId);
    const start = { x: e.clientX, at: coverX };
    const move = (ev: PointerEvent) => setCoverX(Math.min(100, Math.max(0, start.at - ((ev.clientX - start.x) / room) * 100)));
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  const status = !link.trim()
    ? null
    : looking
      ? 'Looking at the video…'
      : looked && 'error' in looked
        ? looked.error
        : video && !pictures
          ? 'Finding its pictures…'
          : null;

  return (
    <div
      ref={layer}
      className="os-burn-layer"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          if (burning) stop();
          else onClose();
        }
      }}
    >
      {burning && draft ? (
        <div className="os-burn-sheet os-burn-progress" role="dialog" aria-label="Burning">
          <DiscIcon size={64} />
          <div>
            <h3>Burning “{draft.title}”…</h3>
            <div className="os-burn-bar">
              <i style={{ animationDuration: `${BURN_MS}ms` }} />
            </div>
            <p>Writing track 1 of 1</p>
          </div>
          <div className="os-burn-buttons">
            <button type="button" className="os-button" onClick={stop}>
              Stop
            </button>
          </div>
        </div>
      ) : (
        <form
          className="os-burn-sheet"
          aria-label="Burn a DVD"
          onSubmit={(e) => {
            e.preventDefault();
            burn();
          }}
        >
          <div className="os-burn-preview">
            <span
              className="os-burn-case"
              tabIndex={draft ? 0 : -1}
              role={draft ? 'slider' : undefined}
              aria-label="Where the picture sits on the case"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(coverX)}
              title={draft ? 'Drag to move the picture' : undefined}
              onPointerDown={drag}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                  e.preventDefault();
                  setCoverX((x) => Math.min(100, Math.max(0, x + (e.key === 'ArrowLeft' ? 5 : -5))));
                }
              }}
            >
              {draft ? <DiscCase disc={draft} width={124} /> : <span className="os-burn-blank" />}
            </span>
            <span className="os-burn-pick">
              <button
                type="button"
                aria-label="Previous picture"
                disabled={!pictures}
                onClick={() => setPicture((p) => (p + PICTURES.length - 1) % PICTURES.length)}
              >
                ‹
              </button>
              Cover {picture + 1} of {PICTURES.length}
              <button type="button" aria-label="Next picture" disabled={!pictures} onClick={() => setPicture((p) => (p + 1) % PICTURES.length)}>
                ›
              </button>
            </span>
          </div>
          <div>
            <h3>Burn a DVD from a video</h3>
            <p>Paste a YouTube link. The video’s picture becomes the cover, and the disc goes on the shelf in Movies.</p>
            <label className="os-burn-field">
              <span>Video Link:</span>
              <input
                ref={linkField}
                type="url"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                placeholder="https://youtu.be/…"
                value={link}
                onChange={(e) => {
                  setLink(e.target.value);
                  setLooked(null);
                  setPictures(null);
                  setPicture(0);
                  setCoverX(50);
                  setError(null);
                }}
              />
            </label>
            <label className="os-burn-field">
              <span>Disc Name:</span>
              <input
                value={name}
                maxLength={200}
                onChange={(e) => {
                  typed.current.name = true;
                  setName(e.target.value);
                }}
              />
            </label>
            <label className="os-burn-field">
              <span>Artist:</span>
              <input
                value={artist}
                maxLength={200}
                onChange={(e) => {
                  typed.current.artist = true;
                  setArtist(e.target.value);
                }}
              />
            </label>
            <p className="os-burn-note" role="status">
              {error ?? status ?? (owner ? 'Everyone who comes by will see this disc.' : 'Only you will see this disc: it’s kept in this browser.')}
            </p>
          </div>
          <div className="os-burn-buttons">
            <button type="button" className="os-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="os-button os-button-primary" disabled={!ready}>
              Burn
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
