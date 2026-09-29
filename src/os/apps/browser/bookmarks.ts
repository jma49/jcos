import type { Visit } from './navigation';

// The Bookmarks Bar: Jincheng's projects today, then a few sites as they
// were when they were new, from the Internet Archive.

export interface Bookmark extends Visit {
  name: string;
}

export const CLASSICS: Bookmark[] = [
  { name: 'Apple', url: 'https://www.apple.com/', year: 2001 },
  { name: 'Google', url: 'https://www.google.com/', year: 1999 },
  { name: 'Yahoo!', url: 'https://www.yahoo.com/', year: 1997 },
  { name: 'Netscape', url: 'https://home.netscape.com/', year: 1997 },
  { name: 'The New York Times', url: 'https://www.nytimes.com/', year: 1998 },
  { name: 'Wikipedia', url: 'https://en.wikipedia.org/', year: 2003 },
  { name: 'YouTube', url: 'https://www.youtube.com/', year: 2006 }
];
