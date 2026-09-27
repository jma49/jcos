import { defineApp } from '../../kit/manifest';
import Icon from './Icon';

export default defineApp({
  id: 'tilegame',
  name: 'Tile Game',
  Icon,
  window: { width: 380, height: 470, minWidth: 360, minHeight: 450 },
  applet: {
    category: 'Games',
    tagline: 'One of Jincheng’s photos, cut into sixteen tiles.',
    description:
      'After the Tile Game widget in Mac OS X Tiger: a sliding puzzle made from a photo in the Photos library. Slide the tiles back into place with the mouse or the arrow keys, then try another photo.',
    added: '2026-09-26'
  },
  load: () => import('./TileGame')
});
