import { describe, expect, test } from 'vitest';
import { isChunkError } from './AppBoundary';

// Which failures mean "this app's code is gone, reload" (a deploy happened)
// rather than "this app broke", in each browser's wording.

describe('isChunkError', () => {
  test.each([
    'Failed to fetch dynamically imported module: https://www.majincheng.com/_astro/Chat.abc123.js',
    'Importing a module script failed.',
    'error loading dynamically imported module: https://www.majincheng.com/_astro/Chat.abc123.js',
    'Unable to preload CSS for /_astro/Chat.abc123.css'
  ])('a missing chunk: %s', (message) => expect(isChunkError(new TypeError(message))).toBe(true));

  test('an error in the app itself is not', () => {
    expect(isChunkError(new TypeError("Cannot read properties of undefined (reading 'title')"))).toBe(false);
    expect(isChunkError('boom')).toBe(false);
  });
});
