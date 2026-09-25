/**
 * What a full-screen iPod view (Cover Flow, a game) does with the wheel.
 * The iPod routes the wheel to the view on top while one is open.
 */
export interface ScreenInput {
  /** The wheel turned by `delta` steps (positive is clockwise). */
  step: (delta: number) => void;
  /** The centre button. */
  choose: () => void;
  /** MENU: return true if the view handled it (e.g. closing a panel) instead of leaving. */
  back?: () => boolean;
  /** ⏮ / ⏭ / ⏯: return true if the view used it rather than the music. */
  press?: (button: 'next' | 'previous' | 'play') => boolean;
}
