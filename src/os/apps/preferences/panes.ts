import {
  AccountsPaneIcon,
  AppearancePaneIcon,
  BackupPaneIcon,
  DateTimePaneIcon,
  DesktopPaneIcon,
  DisplaysPaneIcon,
  DockPaneIcon,
  SharingPaneIcon,
  SoftwareUpdatePaneIcon,
  SoundPaneIcon,
  type IconComponent
} from '../../core/icons';

// System Preferences' panes, grouped in rows as Leopard's Show All view
// has them, with the words its search field finds them by. Spotlight lists
// them too.

export type PaneId =
  'appearance' | 'desktop' | 'dock' | 'datetime' | 'displays' | 'sound' | 'accounts' | 'sharing' | 'update' | 'backup';

export interface PaneInfo {
  id: PaneId;
  name: string;
  Icon: IconComponent;
  section: Section;
  /** What else the search field finds it by. */
  keywords: string;
}

export type Section = 'Personal' | 'Hardware & System' | 'Internet & Network';

export const SECTIONS: Section[] = ['Personal', 'Hardware & System', 'Internet & Network'];

export const PANES: PaneInfo[] = [
  {
    id: 'appearance',
    name: 'Appearance',
    Icon: AppearancePaneIcon,
    section: 'Personal',
    keywords: 'dark light mode theme accent colour color highlight glass aqua material graphite sun'
  },
  {
    id: 'desktop',
    name: 'Desktop & Screen Saver',
    Icon: DesktopPaneIcon,
    section: 'Personal',
    keywords: 'wallpaper background picture photo screensaver flurry idle sky pattern'
  },
  {
    id: 'dock',
    name: 'Dock',
    Icon: DockPaneIcon,
    section: 'Personal',
    keywords: 'size magnification magnify icons small large'
  },
  {
    id: 'datetime',
    name: 'Date & Time',
    Icon: DateTimePaneIcon,
    section: 'Personal',
    keywords: 'clock 24-hour time zone place city location region weather fahrenheit celsius language'
  },
  {
    id: 'displays',
    name: 'Displays',
    Icon: DisplaysPaneIcon,
    section: 'Hardware & System',
    keywords: 'night shift warm screen motion animation reduce accessibility'
  },
  {
    id: 'sound',
    name: 'Sound',
    Icon: SoundPaneIcon,
    section: 'Hardware & System',
    keywords: 'volume mute audio music effects speaker'
  },
  {
    id: 'accounts',
    name: 'Accounts',
    Icon: AccountsPaneIcon,
    section: 'Hardware & System',
    keywords: 'sign in sign out login user username password member'
  },
  {
    id: 'sharing',
    name: 'Sharing',
    Icon: SharingPaneIcon,
    section: 'Internet & Network',
    keywords: 'privacy airdrop city pointer cursor presence discover visible'
  },
  {
    id: 'update',
    name: 'Software Update',
    Icon: SoftwareUpdatePaneIcon,
    section: 'Internet & Network',
    keywords: 'version build update check new reload'
  },
  {
    id: 'backup',
    name: 'Backup & Restore',
    Icon: BackupPaneIcon,
    section: 'Internet & Network',
    keywords: 'export import reset settings defaults file time machine'
  }
];

/** Older links named the Date & Time pane "location". */
export function paneOf(id: string | undefined): PaneId | null {
  if (id === 'location') return 'datetime';
  return PANES.some((p) => p.id === id) ? (id as PaneId) : null;
}

export const paneInfo = (id: PaneId) => PANES.find((p) => p.id === id)!;

/**
 * The panes a search finds, best first: every word must start a word in the
 * pane's name or keywords; panes whose name matches come before those
 * found by a keyword.
 */
export function searchPanes(query: string): PaneId[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const starts = (text: string, word: string) =>
    text
      .toLowerCase()
      .split(/[^a-z0-9-]+/)
      .some((t) => t.startsWith(word));
  const found = PANES.filter((p) => words.every((w) => starts(`${p.name} ${p.keywords}`, w)));
  return found
    .sort((a, b) => Number(words.every((w) => starts(b.name, w))) - Number(words.every((w) => starts(a.name, w))))
    .map((p) => p.id);
}
