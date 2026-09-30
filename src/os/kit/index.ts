// The kit: everything an applet may use from JM/OS. Applets (the games and
// small tools in src/os/applets/, installed from the Applet Store) import
// this module and their own folder, nothing else; the lint enforces it.
// That keeps each applet a self-contained unit the OS can load on demand,
// and keeps the OS free to change underneath them.

export type { AppProps, OSPhoto } from '../core/types';
export { play, audio, type Sound } from '../core/sound';
export { useGameLoop } from './loop';
export { saved, type Saved } from './saved';
export { useIsFront, resizeWindow } from './window';
export { ownsKey } from '../core/useKeys';
export { usePhotos } from './data';
export { useSoundSetting, soundSetting, turnSoundOn } from './sound';
