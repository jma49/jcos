import { describe, expect, test } from 'vitest';
import { apps } from '../core/registry';
import { spotlightFinds } from './spotlightSearch';

// What Spotlight finds: a query is found in a result's name, its hint, or
// the words its app gives it, so Preferences' panes come up by the same
// words as in Preferences' own search field.

const preferences = apps.preferences;
const panes = (preferences.shortcuts ?? []).map((s) => ({ label: s.name, hint: preferences.name, keywords: s.keywords }));
const found = (query: string) => panes.filter((r) => spotlightFinds(r, query)).map((r) => r.label);

describe('spotlightFinds', () => {
  test('a pane is found by its name and its app', () => {
    expect(found('sound')).toEqual(['Sound']);
    expect(found('system preferences')).toHaveLength(panes.length);
  });

  test('a pane is found by its keywords', () => {
    expect(found('dark')).toEqual(['Appearance']);
    expect(found('wallpaper')).toEqual(['Desktop & Screen Saver']);
    expect(found('night shift')).toEqual(['Displays']);
  });

  test('case and surrounding spaces don’t matter; nothing is found for what no result has', () => {
    expect(found('  Night Shift ')).toEqual(['Displays']);
    expect(found('zebra')).toEqual([]);
  });
});
