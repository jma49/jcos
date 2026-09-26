// Settings from System Preferences that aren't about the desktop picture,
// the appearance or sound (those live in store.ts): the Dock, motion,
// Night Shift, the clock and what this visitor shares with others. Kept in
// this browser under `os-system`.

import { create } from 'zustand';
import { useReducedMotion } from 'motion/react';
import { loadSettings, saveJSON } from './storage';

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
  /** Whether others see this visitor's pointer. */
  sharePointer: boolean;
  /** Whether other visitors' pointers are drawn here. */
  showPointers: boolean;
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
  showPointers: true
};

/** Icon sizes in the Dock, at rest. */
export const DOCK_SIZES: Record<DockSize, number> = { small: 40, medium: 50, large: 60 };

/** How far a magnified Dock icon grows, over its resting size. */
export const DOCK_MAGNIFY = 28;

interface SystemState extends SystemSettings {
  set: (patch: Partial<SystemSettings>) => void;
  reset: () => void;
}

export const useSystem = create<SystemState>((set, get) => ({
  ...loadSettings(SYSTEM_KEY, SYSTEM_DEFAULTS),
  set: (patch) => {
    set(patch);
    const { set: _set, reset: _reset, ...settings } = get();
    saveJSON(SYSTEM_KEY, settings);
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
