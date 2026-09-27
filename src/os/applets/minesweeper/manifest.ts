import { defineApp, pngIcon } from '../../kit/manifest';

export default defineApp({
  id: 'minesweeper',
  name: 'Minesweeper',
  Icon: pngIcon('minesweeper'),
  window: { width: 400, height: 470, minWidth: 300, minHeight: 360 },
  applet: {
    category: 'Games',
    tagline: 'Clear the board without setting anything off.',
    description:
      'The classic, in Aqua blue. Three board sizes, a safe first click, flags, chording and your best time for each level.',
    added: '2026-09-25'
  },
  load: () => import('./Minesweeper')
});
