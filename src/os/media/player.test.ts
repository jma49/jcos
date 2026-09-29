import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { revealAfterButton, YOUTUBE_BUTTON_MS } from './player';

// YouTube shows its own play/pause button in the middle of the picture for
// a few seconds after a start, a seek or a resume; a player's picture
// shows only once that's over.

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', globalThis);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('revealAfterButton', () => {
  test('the picture shows once it has played long enough', () => {
    const live = vi.fn();
    const reveal = revealAfterButton(live);
    reveal.playing();
    expect(live).toHaveBeenLastCalledWith(false);
    vi.advanceTimersByTime(YOUTUBE_BUTTON_MS - 1);
    expect(live).toHaveBeenLastCalledWith(false);
    vi.advanceTimersByTime(1);
    expect(live).toHaveBeenLastCalledWith(true);
  });

  test('a seek while it plays covers it again for as long', () => {
    const live = vi.fn();
    const reveal = revealAfterButton(live);
    reveal.playing();
    vi.advanceTimersByTime(YOUTUBE_BUTTON_MS);
    reveal.seeked();
    expect(live).toHaveBeenLastCalledWith(false);
    vi.advanceTimersByTime(YOUTUBE_BUTTON_MS);
    expect(live).toHaveBeenLastCalledWith(true);
  });

  test('a seek while paused waits for the next start', () => {
    const live = vi.fn();
    const reveal = revealAfterButton(live);
    reveal.stopped();
    reveal.seeked();
    vi.advanceTimersByTime(YOUTUBE_BUTTON_MS * 2);
    expect(live).not.toHaveBeenCalledWith(true);
  });

  test('pausing covers it at once, and the wait doesn’t end in a reveal', () => {
    const live = vi.fn();
    const reveal = revealAfterButton(live);
    reveal.playing();
    vi.advanceTimersByTime(1000);
    reveal.stopped();
    vi.advanceTimersByTime(YOUTUBE_BUTTON_MS);
    expect(live).not.toHaveBeenCalledWith(true);
  });
});
