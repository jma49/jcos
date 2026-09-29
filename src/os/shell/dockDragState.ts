import { create } from 'zustand';
import type { AppId } from '../core/types';

// What a drag is doing to the Dock right now. The drag itself is handled
// in dockDrag.tsx, which isn't in the first load (it arrives once the
// desktop has settled, or when an icon is first pressed); the Dock only
// draws what this says.

export interface DockDrag {
  /** The app whose icon is being dragged: its slot closes up meanwhile. */
  app: AppId | null;
  from: 'kept' | 'running' | null;
  /** The kept app a gap has opened in front of, where a drop would land ('end': after the last). */
  gapBefore: AppId | 'end' | null;
  /** Set for the one change a drop makes, so the Dock takes it at once rather than animating it twice. */
  instant: boolean;
  /** Set as a drag ends, so the click that follows the release doesn't open the app. */
  justDragged: boolean;
}

export const useDockDrag = create<DockDrag>(() => ({ app: null, from: null, gapBefore: null, instant: false, justDragged: false }));
