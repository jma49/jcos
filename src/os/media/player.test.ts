import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { middleControls, revealAfterButton, YOUTUBE_BUTTON_MS } from './player';

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

// DVD Player keeps its picture and masks only the middle, while YouTube's
// middle controls may be up (measured 2026-09-29).
describe('middleControls', () => {
  test('a start brings them up, and they go once it has played long enough', () => {
    const up = vi.fn();
    const middle = middleControls(up);
    middle.playing();
    expect(up).toHaveBeenLastCalledWith(true);
    vi.advanceTimersByTime(YOUTUBE_BUTTON_MS - 1);
    expect(up).toHaveBeenLastCalledWith(true);
    vi.advanceTimersByTime(1);
    expect(up).toHaveBeenLastCalledWith(false);
  });

  test('a seek while playing brings them up again for as long; a seek while paused brings nothing', () => {
    const up = vi.fn();
    const middle = middleControls(up);
    middle.playing();
    vi.advanceTimersByTime(YOUTUBE_BUTTON_MS);
    middle.seeked();
    expect(up).toHaveBeenLastCalledWith(true);
    vi.advanceTimersByTime(YOUTUBE_BUTTON_MS);
    expect(up).toHaveBeenLastCalledWith(false);
    middle.paused();
    up.mockClear();
    middle.seeked();
    expect(up).not.toHaveBeenCalled();
  });

  test('a pause leaves them as they are: up stays up, gone stays gone', () => {
    const up = vi.fn();
    const middle = middleControls(up);
    middle.playing();
    vi.advanceTimersByTime(1000);
    middle.paused();
    vi.advanceTimersByTime(YOUTUBE_BUTTON_MS * 3);
    expect(up).toHaveBeenLastCalledWith(true);
    middle.playing();
    vi.advanceTimersByTime(YOUTUBE_BUTTON_MS);
    expect(up).toHaveBeenLastCalledWith(false);
    up.mockClear();
    middle.paused();
    vi.advanceTimersByTime(YOUTUBE_BUTTON_MS);
    expect(up).not.toHaveBeenCalled();
  });

  test('buffering keeps them up until it plays again', () => {
    const up = vi.fn();
    const middle = middleControls(up);
    middle.playing();
    vi.advanceTimersByTime(1000);
    middle.buffering();
    vi.advanceTimersByTime(YOUTUBE_BUTTON_MS * 2);
    expect(up).toHaveBeenLastCalledWith(true);
    middle.playing();
    vi.advanceTimersByTime(YOUTUBE_BUTTON_MS);
    expect(up).toHaveBeenLastCalledWith(false);
  });

  test('the end takes them away at once', () => {
    const up = vi.fn();
    const middle = middleControls(up);
    middle.playing();
    middle.stopped();
    expect(up).toHaveBeenLastCalledWith(false);
    vi.advanceTimersByTime(YOUTUBE_BUTTON_MS);
    expect(up).toHaveBeenCalledTimes(2);
  });
});
