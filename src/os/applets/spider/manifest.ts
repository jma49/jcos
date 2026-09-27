import { defineApp } from '../../kit/manifest';
import Icon from './Icon';

export default defineApp({
  id: 'spider',
  name: 'Spider Solitaire',
  Icon,
  window: { width: 760, height: 560, minWidth: 520, minHeight: 400 },
  applet: {
    category: 'Games',
    tagline: 'Two decks, ten columns, one suit at a time.',
    description:
      'Spider Solitaire, as it came with every PC. Build down from King to Ace; a full run of one suit leaves the table. One, two or four suits, drag or click to move, undo, hints (H) and your best score for each.',
    added: '2026-09-27'
  },
  load: () => import('./Spider')
});
