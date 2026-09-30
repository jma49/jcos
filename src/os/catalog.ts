// Every app in JM/OS, listed once. Each is a folder with a manifest.ts
// (src/os/kit/manifest.ts): the built-in apps under apps/, the applets
// from the Applet Store under applets/. The Dock, Finder, Spotlight, the
// Terminal, the Applet Store and ?open= all read this list; an app's code
// is loaded only when it's first opened.
//
// Order matters: it's the order of Spotlight and a phone's home screen,
// and applets appear in the Applet Store in theirs.

import about from './apps/about/manifest';
import textedit from './apps/textedit/manifest';
import resume from './apps/resume/manifest';
import projects from './apps/projects/manifest';
import project from './apps/project/manifest';
import browser from './apps/browser/manifest';
import terminal from './apps/terminal/manifest';
import photos from './apps/photos/manifest';
import stickies from './apps/stickies/manifest';
import ical from './apps/ical/manifest';
import soapbox from './apps/soapbox/manifest';
import finder from './apps/finder/manifest';
import appstore from './apps/appstore/manifest';
import ipod from './apps/ipod/manifest';
import karaoke from './apps/karaoke/manifest';
import dvdplayer from './apps/dvdplayer/manifest';
import chat from './apps/chat/manifest';
import airdrop from './apps/airdrop/manifest';
import photobooth from './apps/photobooth/manifest';
import chess from './apps/chess/manifest';
import aboutmac from './apps/aboutmac/manifest';
import account from './apps/account/manifest';
import welcome from './apps/welcome/manifest';
import preferences from './apps/preferences/manifest';
import minesweeper from './applets/minesweeper/manifest';
import tilegame from './applets/tilegame/manifest';
import calculator from './applets/calculator/manifest';
import spider from './applets/spider/manifest';
import pinball from './applets/pinball/manifest';
import synth from './applets/synth/manifest';

export const catalog = [
  about,
  textedit,
  resume,
  projects,
  project,
  browser,
  terminal,
  photos,
  stickies,
  ical,
  soapbox,
  finder,
  appstore,
  ipod,
  karaoke,
  dvdplayer,
  chat,
  airdrop,
  photobooth,
  chess,
  aboutmac,
  account,
  welcome,
  preferences,
  minesweeper,
  tilegame,
  calculator,
  spider,
  pinball,
  synth
] as const;

/** An app's id, as its manifest declares it. */
export type AppId = (typeof catalog)[number]['id'];
