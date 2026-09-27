// Settings from System Preferences that aren't about the desktop picture,
// the appearance or sound (those live in store.ts): the Dock, motion,
// Night Shift, the clock and what this visitor shares with others. Kept in
// this browser under `os-system`.

import { create } from 'zustand';
import { useReducedMotion } from 'motion/react';
import { loadSettings, onStored, saveJSON } from './storage';

export const SYSTEM_KEY = 'os-system';

export type DockSize = 'small' | 'medium' | 'large';
export type MotionChoice = 'system' | 'reduce' | 'full';
export type NightShift = 'off' | 'on' | 'sunset';

export interface SystemSettings {
  dockSize: DockSize;
  magnify: boolean;
  motion: MotionChoice;
  nightShift: NightShift;
  /** 0 (cooler) to 1 (warmer). */
  warmth: number;
  clock24: boolean;
  clockDate: boolean;
  /** Whether others on the desktop see this visitor's city. */
  shareCity: boolean;
  /** Whether this visitor's pointer is sent to those who've chosen to see pointers. */
  sharePointer: boolean;
  /**
   * Whether other visitors' pointers are drawn here. Off unless chosen:
   * nobody's pointer moves across someone else's screen uninvited. (It
   * replaced `showPointers`, which was on by default, so that setting
   * doesn't carry over.)
   */
  showOthersPointers: boolean;
}

export const SYSTEM_DEFAULTS: SystemSettings = {
  dockSize: 'medium',
  magnify: true,
  motion: 'system',
  nightShift: 'off',
  warmth: 0.5,
  clock24: false,
  clockDate: true,
  shareCity: true,
  sharePointer: true,
  showOthersPointers: false
};

/** Icon sizes in the Dock, at rest. */
export const DOCK_SIZES: Record<DockSize, number> = { small: 40, medium: 50, large: 60 };

/** How far a magnified Dock icon grows, over its resting size. */
export const DOCK_MAGNIFY = 28;

interface SystemState extends SystemSettings {
  set: (patch: Partial<SystemSettings>) => void;
  reset: () => void;
}

/** The saved settings over their defaults, keeping only settings that still exist. */
function savedSettings(): SystemSettings {
  const saved = loadSettings(SYSTEM_KEY, SYSTEM_DEFAULTS);
  return Object.fromEntries(Object.keys(SYSTEM_DEFAULTS).map((key) => [key, saved[key as keyof SystemSettings]])) as unknown as SystemSettings;
}

export const useSystem = create<SystemState>((set, get) => ({
  ...savedSettings(),
  // What's stored now, with this change: a setting changed in another tab stands.
  set: (patch) => {
    const settings = { ...savedSettings(), ...patch };
    saveJSON(SYSTEM_KEY, settings);
    set(settings);
  },
  reset: () => {
    set(SYSTEM_DEFAULTS);
    saveJSON(SYSTEM_KEY, null);
  }
}));

/** Whether to cut animations short: the visitor's choice here, else their device's. */
export function useReduceMotion() {
  const device = useReducedMotion();
  const choice = useSystem((s) => s.motion);
  return choice === 'system' ? !!device : choice === 'reduce';
}

// Settings changed in another tab of this visitor's.
onStored(SYSTEM_KEY, () => useSystem.setState(savedSettings()));
