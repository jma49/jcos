import { useEffect, useMemo, useRef, useState } from 'react';
import { useOSData } from '../../core/context';
import { buildDisk, type FileNode } from '../../core/files';
import { APPLETS } from '../../core/applets';
import { apps, launch, type AppProps } from '../../core/registry';
import { useWindows } from '../../core/store';
import { useReduceMotion } from '../../core/system';
import type { AppId } from '../../core/types';
import { usersFolder } from '../../files/home';
import { moviesFolder } from '../../files/movies';
import { useHome, useHomeRefresh } from '../../home/home';
import { useShelf, useShelfRefresh } from '../../media/discs';
import { ALBUMS, SONGS, useLibraryVersion } from '../../media/library';
import { useIsOwner } from '../../social/owner';
import { DayFinder, folderOn, type Place } from './DayFinder';
import { backupDays, cameBy, dayName, diskOn, folderCame, localDay, namedTicks, notBefore, type Arrivals } from './past';

// Time Machine, as Leopard had it: the desktop gives way to space, and a
// Finder window stands in front of the same window on each day before,
// going back into the stars. The timeline down the right, the arrows and
// the windows behind move through the days; Cancel goes back to the
// desktop, and Restore brings what's chosen back to now: an app opens, a
// song plays, a folder opens in Finder. What each day held is past.ts's.
//
// It's in the Dock and Applications, and a full-screen app (the manifest's
// `fullScreen`, drawn by shell/FullScreenLayer.tsx): no window; it covers
// the windows, the menu bar and the Dock, which are `inert` under it (the
// page around the desktop too: `inertAround` in core/focus.ts), and the
// desktop's shortcuts, the ⌥Tab switcher and Exposé's corner stay quiet
// (`useFocusedId()` is null meanwhile, so no window has the keys). Leaving
// gives focus back to what had it, as noted by `openFullScreen`.
//
// Space is a canvas of seeded stars over a CSS nebula, with a Finder window
// for each day going back into it (300px apart, seen from 50% 6%, as the
// prototype had them). The timeline, the arrows (Page Up and Down) and a
// click on a window behind go through the days; Cancel or Escape leaves,
// and an Escape closes Quick Look first. Its own keys hold wherever focus
// is.
//
// What a day held: each thing from the day it came, an app from its
// manifest's `added` (an applet from its listing's), a song or an album
// from its Date Added, a disc from when it was burned, Jincheng's documents
// and diary entries from when they were first written, and the Applets,
// Movies and Users folders from the days the Applet Store, DVD Player and
// TextEdit came. What's inside Movies and Users counts from its folder's
// day at the earliest (`notBefore`), so a document dated before /Users
// existed adds no day on which nothing shows. Nothing keeps how a thing was
// changed or what was thrown away, so a past day shows what's here now, as
// far back as each thing goes; Pictures and Projects have no dates and
// aren't shown. Days are where this device is.
//
// The front window is a read-only Finder (DayFinder.tsx): the places, back
// and forward, icons or a list, and Quick Look. The folder, the selection
// and the view stay as the days change, and a day without the folder shows
// the nearest one it had. Restore brings what's chosen (or the folder
// shown) back to now: an app opens, a song plays, a disc goes into the
// drive, a document opens in TextEdit, a folder opens in Finder. The home
// folder is read as Finder reads it, so anyone else sees only Public and
// Sites.

/** How many windows stand behind the front one. */
const DEPTH = 6;
/** How far behind each other they stand, as the prototype had them. */
const STEP = 300;

const APPLET_IDS = APPLETS.map((a) => a.app);
const arrivalOf = (id: AppId) => APPLETS.find((a) => a.app === id)?.added ?? apps[id].added;

export default function TimeMachine({ win }: AppProps) {
  const data = useOSData();
  const reduced = useReduceMotion();
  const owner = useIsOwner();
  // The library as it is now: it changes as Jincheng adds songs (media/library.ts).
  useLibraryVersion();
  const songs = SONGS;
  const albums = ALBUMS;
  const shelf = useShelf();
  const home = useHome();
  useShelfRefresh();
  useHomeRefresh(true, owner);
  const [today] = useState(() => localDay(new Date()));

  const arrivals = useMemo<Arrivals>(() => {
    const songDays = new Map(songs.map((s) => [s.id, s.added]));
    const albumDays = new Map(albums.map((a) => [a.title, a.added]));
    return { app: arrivalOf, song: (id) => songDays.get(id), album: (title) => albumDays.get(title) };
  }, [songs, albums]);

  // The days: today, and each day before it that something came. What's
  // in Movies and Users counts from the day its folder came at the earliest.
  const days = useMemo(() => {
    const shown = new Set<AppId>([...APPLET_IDS, 'about', 'resume', ...(Object.keys(apps) as AppId[]).filter((id) => apps[id].inApplications)]);
    const inMovies = notBefore(folderCame('/Movies', arrivals));
    const inUsers = notBefore(folderCame('/Users', arrivals));
    return backupDays(
      [
        ...[...shown].map(arrivalOf),
        ...songs.map((s) => s.added),
        ...albums.map((a) => a.added),
        ...shelf.map((d) => inMovies(d.added)),
        ...home.documents.map((d) => inUsers(d.created)),
        ...home.diary.map((e) => inUsers(e.created))
      ],
      today
    );
  }, [songs, albums, shelf, home, today, arrivals]);

  // Each day's disk, made once and kept while nothing changes.
  const diskFor = useMemo(() => {
    const made = new Map<string, FileNode>();
    return (day: string) => {
      let disk = made.get(day);
      if (!disk) {
        const came = cameBy(day);
        const movies = moviesFolder(shelf.filter((d) => came(d.added)), false);
        const users = usersFolder(
          { documents: home.documents.filter((d) => came(d.created)), diary: home.diary.filter((e) => came(e.created)) },
          owner,
          data.projects,
          () => {}
        );
        disk = diskOn(buildDisk(data, APPLET_IDS, { songs, albums }, movies, users), day, arrivals);
        made.set(day, disk);
      }
      return disk;
    };
  }, [data, songs, albums, shelf, home, owner, arrivals]);

  // The day in front, and where the windows are looking.
  const [front, setFront] = useState(today);
  const at = Math.max(0, days.indexOf(front));
  const frontDay = days[at];
  const [trail, setTrail] = useState(() => ({ paths: [win.props?.path ?? '/'], at: 0 }));
  const [place, setPlace] = useState<Place>(() => ({ path: win.props?.path ?? '/', selected: null, view: 'icons', looking: false }));
  const change = (next: Partial<Place>) => setPlace((p) => ({ ...p, ...next }));
  const goTo = (path: string) => {
    if (path === trail.paths[trail.at]) return;
    setTrail({ paths: [...trail.paths.slice(0, trail.at + 1), path], at: trail.at + 1 });
    change({ path, selected: null, looking: false });
  };
  const step = (by: -1 | 1) => {
    const next = trail.at + by;
    if (next < 0 || next >= trail.paths.length) return;
    setTrail({ ...trail, at: next });
    change({ path: trail.paths[next], selected: null, looking: false });
  };

  const earlier = () => at < days.length - 1 && setFront(days[at + 1]);
  const later = () => at > 0 && setFront(days[at - 1]);

  // What Restore brings back: what's chosen in the front window, or the folder it shows.
  const frontDisk = diskFor(frontDay);
  const frontFolder = folderOn(frontDisk, place.path);
  const chosen = frontFolder.children?.find((n) => n.path === place.selected) ?? frontFolder;
  const restorable = frontDay !== today && !chosen.locked && (!!chosen.children || !!chosen.open);
  const leave = () => useWindows.getState().closeFullScreen();
  const restore = () => {
    if (!restorable) return;
    leave();
    if (chosen.children) launch('finder', { props: { path: chosen.path } });
    else chosen.open?.(null);
  };

  // Escape leaves (Quick Look closes first, in the window); Page Up and Down go through the days.
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') leave();
    else if (e.key === 'PageUp') earlier();
    else if (e.key === 'PageDown') later();
    else return;
    e.preventDefault();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Into the front window as it opens, for the keyboard and a screen reader.
  const space = useRef<HTMLDivElement>(null);
  useEffect(() => {
    space.current?.querySelector<HTMLElement>('[data-depth="0"] .os-finder-main button, [data-depth="0"] .os-sidebar-place')?.focus({ preventScroll: true });
  }, []);

  // With more days than the timeline holds, the one in front stays in sight.
  const timeline = useRef<HTMLOListElement>(null);
  useEffect(() => {
    timeline.current?.querySelector('[aria-current="date"]')?.scrollIntoView({ block: 'nearest' });
  }, [frontDay]);

  const named = namedTicks(days, today, frontDay, Math.max(4, Math.floor((window.innerHeight - 220) / 22)));
  // From the window leaving towards us to the farthest one shown.
  const shown = days.slice(Math.max(0, at - 1), at + DEPTH + 1);

  return (
    <div className="os-tm" data-reduced={reduced || undefined}>
      <Stars />
      <div className="os-tm-floor" aria-hidden="true" />
      <div className="os-tm-space" ref={space}>
        {shown.map((day) => {
          const depth = days.indexOf(day) - at;
          const disk = diskFor(day);
          return (
            <section
              key={day}
              className="os-window os-tm-window"
              data-material="metal"
              data-focused={depth === 0}
              data-depth={depth}
              aria-hidden={depth !== 0 || undefined}
              inert={depth !== 0}
              style={{
                transform: `translate3d(-50%, 0, ${-depth * STEP}px)`,
                opacity: depth < 0 ? 0 : 1 - depth * 0.1,
                zIndex: DEPTH - depth
              }}
            >
              <header className="os-titlebar">
                <div className="os-controls" aria-hidden="true">
                  <span className="os-control os-close" />
                  <span className="os-control os-min" />
                  <span className="os-control os-max" />
                </div>
                <h2 className="os-title">{folderOn(disk, place.path).name}</h2>
              </header>
              <div className="os-body">
                {Math.abs(depth) <= 1 && (
                  <DayFinder
                    disk={disk}
                    place={place}
                    front={depth === 0}
                    canBack={trail.at > 0}
                    canForward={trail.at < trail.paths.length - 1}
                    onBack={() => step(-1)}
                    onForward={() => step(1)}
                    onGo={goTo}
                    onChange={change}
                    restore={
                      <button type="button" className="os-button os-button-primary" disabled={!restorable} onClick={restore}>
                        Restore
                      </button>
                    }
                  />
                )}
              </div>
            </section>
          );
        })}
        {/* A window behind the front one is a way to its day. */}
        {shown
          .filter((day) => days.indexOf(day) > at)
          .map((day) => (
            <button
              key={`pick-${day}`}
              type="button"
              className="os-tm-pick"
              tabIndex={-1}
              aria-label={dayName(day, today)}
              style={{ transform: `translate3d(-50%, 0, ${-(days.indexOf(day) - at) * STEP}px)`, zIndex: DEPTH - (days.indexOf(day) - at) }}
              onClick={() => setFront(day)}
            />
          ))}
      </div>

      <p className="os-tm-date" aria-live="polite">
        {dayName(frontDay, today)}
      </p>

      <nav className="os-tm-timeline" aria-label="Backups">
        <ol ref={timeline}>
          {[...days].reverse().map((day) => (
            <li key={day}>
              <button
                type="button"
                aria-current={day === frontDay ? 'date' : undefined}
                data-named={named.has(day) || undefined}
                title={dayName(day, today)}
                onClick={() => setFront(day)}
              >
                <span>{named.get(day) ?? dayName(day, today)}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div className="os-tm-arrows">
        <button type="button" className="os-tm-arrow" aria-label="Earlier" title="Earlier (Page Up)" disabled={at >= days.length - 1} onClick={earlier}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M12 5l8 10H4z" fill="currentColor" />
          </svg>
        </button>
        <button type="button" className="os-tm-arrow" aria-label="Later" title="Later (Page Down)" disabled={at === 0} onClick={later}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M12 19L4 9h16z" fill="currentColor" />
          </svg>
        </button>
      </div>

      <div className="os-tm-bar">
        <button type="button" className="os-tm-button" onClick={leave}>
          Cancel
        </button>
        <button type="button" className="os-tm-button" disabled={!restorable} onClick={restore}>
          Restore
        </button>
      </div>
    </div>
  );
}

/** Leopard's stars: scattered at random, but the same each time, over a nebula drawn in CSS. */
function Stars() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const c = canvas.current;
      const g = c?.getContext('2d');
      if (!c || !g) return;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const w = window.innerWidth;
      const h = window.innerHeight;
      c.width = Math.round(w * ratio);
      c.height = Math.round(h * ratio);
      g.scale(ratio, ratio);
      let seed = 7;
      const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      // As many as the prototype's 700 on a 1280 by 800 screen, for any size.
      const count = Math.round((w * h) / 1460);
      for (let n = 0; n < count; n++) {
        g.globalAlpha = 0.3 + random() * 0.7;
        g.fillStyle = random() > 0.8 ? '#cfd8ff' : '#ffffff';
        g.beginPath();
        g.arc(random() * w, random() * h, random() * random() * 1.6 + 0.3, 0, Math.PI * 2);
        g.fill();
      }
    };
    draw();
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(draw);
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
    };
  }, []);
  return <canvas ref={canvas} className="os-tm-stars" aria-hidden="true" />;
}
