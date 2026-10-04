import type { FileNode } from '../../files/disk';
import type { AppId } from '../../core/types';

// What the base had on a day, for Time Machine: each thing from the day
// it came. Apps came on the day their manifests say (`added`, an applet's
// listing's), songs and albums when they were added to the library, discs
// when they were burned, Jincheng's documents and diary entries when they
// were first written. Nothing keeps how a thing was changed or what was
// thrown away, so a past day shows what's here now, as far back as each
// thing goes. Pictures and Projects have no such dates and aren't shown.
// Days are where this device is, as iCal's are.

const pad = (n: number) => String(n).padStart(2, '0');

/** A date's day (YYYY-MM-DD) where this device is. */
export const localDay = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** The day of a moment (ISO 8601) where this device is, or a day (YYYY-MM-DD) as it is; '' for anything else. */
export function dayOf(value: string | undefined): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : localDay(date);
}

/** Whether something that came at `came` was there by the end of `day`. Without a known date, it always was. */
export const cameBy = (day: string) => (came: string | undefined) => {
  const on = dayOf(came);
  return !on || on <= day;
};

/** Time Machine's backups: today, and each earlier day on which something came, newest first. */
export function backupDays(dates: (string | undefined)[], today: string): string[] {
  const days = new Set([today]);
  for (const date of dates) {
    const day = dayOf(date);
    if (day && day < today) days.add(day);
  }
  return [...days].sort().reverse();
}

/** When the things on the disk came, looked up by what the disk's paths name. */
export interface Arrivals {
  /** An app's or applet's day (its manifest's). */
  app: (id: AppId) => string | undefined;
  /** A song's, by its id. */
  song: (id: string) => string | undefined;
  /** An album's, by its title. */
  album: (title: string) => string | undefined;
}

/**
 * Folders that came with an app: the Applet Store's Applets, DVD Player's
 * shelf in Movies, and Jincheng's home with TextEdit. Before then, there
 * was no such folder.
 */
const FOLDER_APPS: Record<string, AppId> = { '/Applets': 'appstore', '/Movies': 'dvdplayer', '/Users': 'textedit' };

/** The day a folder that came with an app came, as `arrivals` says; undefined for a folder that was always there. */
export function folderCame(path: string, arrivals: Arrivals): string | undefined {
  const app = FOLDER_APPS[path];
  return app ? arrivals.app(app) : undefined;
}

/**
 * A date of something inside a folder that came on `floor`, as Time Machine
 * counts it: never before the folder. A document dated before /Users
 * existed (restored from a backup, imported) would otherwise make a day
 * on which nothing that day's disk shows came.
 */
export const notBefore = (floor: string | undefined) => (date: string | undefined) => {
  const on = dayOf(date);
  const from = dayOf(floor);
  return on && from && on < from ? from : date;
};

/** The last part of a path, as the name it was made from. */
const leaf = (path: string) => decodeURIComponent(path.slice(path.lastIndexOf('/') + 1));

/**
 * The disk as it was at the end of `day`: `disk` (built from what's here
 * now, its Movies and Users folders already as they were that day)
 * without the apps, applets, songs, albums and folders that came later,
 * and without Pictures and Projects.
 */
export function diskOn(disk: FileNode, day: string, arrivals: Arrivals): FileNode {
  const came = cameBy(day);
  const folders = (disk.children ?? []).flatMap((folder): FileNode[] => {
    const app = FOLDER_APPS[folder.path];
    if (app && !came(arrivals.app(app))) return [];
    switch (folder.path) {
      case '/Pictures':
      case '/Projects':
        return [];
      case '/Applications':
      case '/Applets':
      case '/Documents':
        return [{ ...folder, children: folder.children?.filter((node) => !node.app || came(arrivals.app(node.app))) }];
      case '/Music':
        return [
          {
            ...folder,
            children: folder.children?.flatMap((node): FileNode[] => {
              if (!node.children) return came(arrivals.song(leaf(node.path))) ? [node] : [];
              if (!came(arrivals.album(leaf(node.path)))) return [];
              return [{ ...node, children: node.children.filter((track) => came(arrivals.song(leaf(track.path)))) }];
            })
          }
        ];
      default:
        return [folder];
    }
  });
  return { ...disk, children: folders };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** The day before `day`. */
function dayBefore(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  return localDay(new Date(y, m - 1, d - 1, 12));
}

/** The name under the front window: "Today (Now)", "Yesterday", or "Saturday, September 26, 2026". */
export function dayName(day: string, today: string): string {
  if (day === today) return 'Today (Now)';
  if (day === dayBefore(today)) return 'Yesterday';
  const [y, m, d] = day.split('-').map(Number);
  return `${WEEKDAYS[new Date(y, m - 1, d, 12).getDay()]}, ${MONTHS[m - 1]} ${d}, ${y}`;
}

/** The timeline's name for a day: "Today (Now)", "Yesterday", "Sep 26", or "Sep 26, 2025" in another year. */
export function tickName(day: string, today: string): string {
  if (day === today || day === dayBefore(today)) return dayName(day, today);
  const [y, m, d] = day.split('-').map(Number);
  const short = `${MONTHS[m - 1].slice(0, 3)} ${d}`;
  return day.slice(0, 4) === today.slice(0, 4) ? short : `${short}, ${y}`;
}

/**
 * Which of the timeline's days are named, when there are too many to name
 * them all: today, yesterday and the one in front, and the first backup of
 * each month (as its month's name) and of each year.
 */
export function namedTicks(days: string[], today: string, front: string, room: number): Map<string, string> {
  const names = new Map<string, string>();
  if (days.length <= room) {
    for (const day of days) names.set(day, tickName(day, today));
    return names;
  }
  // Oldest first, so each month's first backup comes before the rest of it.
  const oldest = [...days].reverse();
  oldest.forEach((day, i) => {
    const before = oldest[i - 1];
    if (!before || before.slice(0, 4) !== day.slice(0, 4)) names.set(day, day.slice(0, 4));
    else if (before.slice(0, 7) !== day.slice(0, 7)) names.set(day, MONTHS[Number(day.slice(5, 7)) - 1]);
  });
  for (const day of [today, dayBefore(today), front]) if (days.includes(day)) names.set(day, tickName(day, today));
  return names;
}
