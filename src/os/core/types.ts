// Shapes shared by the OS shell and its apps.

/** Content handed from Astro to the React shell. Everything is serialisable. */
export interface OSData {
  name: string;
  role: string;
  location: string;
  email: string;
  links: { github: string; linkedin: string; photography: string };
  bio: { short: string[]; long: string[] };
  jobs: {
    company: string;
    role: string;
    period: string;
    summary: string;
    bullets: string[];
  }[];
  skills: { name: string; items: string[] }[];
  education: { school: string; degree: string; period: string }[];
  projects: OSProject[];
  photos: OSPhoto[];
  wallpaper: string;
}

export interface OSPhoto {
  id: string;
  width: number;
  height: number;
  /** Dominant colour, shown while the image loads. */
  color: string;
  taken: string;
  alt: string;
  thumb: string;
  full: string;
  /** The photo's page on Unsplash. */
  page: string;
}

export interface OSProject {
  slug: string;
  title: string;
  description: string;
  when: string;
  status: 'live' | 'wip' | 'archived';
  stack: string[];
  repo?: string;
  demo?: string;
  cover?: string;
  /** Rendered Markdown body. */
  html: string;
}

export type AppId =
  | 'about'
  | 'resume'
  | 'projects'
  | 'project'
  | 'browser'
  | 'terminal'
  | 'photos'
  | 'stickies'
  | 'preferences'
  | 'soapbox'
  | 'minesweeper'
  | 'finder'
  | 'appstore'
  | 'calculator'
  | 'tilegame'
  | 'ipod'
  | 'karaoke'
  | 'chat'
  | 'airdrop'
  | 'photobooth'
  | 'account'
  | 'welcome';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowState {
  id: string;
  app: AppId;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
  maximized: boolean;
  /** Screen rect of whatever launched the window; the open animation grows from it. */
  origin?: Rect;
  /** App-specific input, e.g. which project or URL to show. */
  props?: Record<string, string>;
}
