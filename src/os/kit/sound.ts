import { useWindows } from '../core/store';

// The one sound switch and volume that govern every sound in JM/OS. An
// applet that makes its own sound (on the shared AudioContext from
// `audio()`) follows them.

/** The sound switch and volume, re-rendering when either changes. */
export function useSoundSetting() {
  const on = useWindows((s) => s.soundOn);
  const volume = useWindows((s) => s.volume);
  return { on, volume };
}

/** The sound switch and volume as they are now, for event handlers. */
export function soundSetting() {
  const { soundOn, volume } = useWindows.getState();
  return { on: soundOn, volume };
}

/** Turns sound on, for a direct request such as playing a note. */
export function turnSoundOn() {
  useWindows.getState().setSound(true);
}
