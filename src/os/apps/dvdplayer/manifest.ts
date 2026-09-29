import { defineApp } from '../../kit/manifest';
import { DVDPlayerIcon } from '../../core/icons';

export default defineApp({
  id: 'dvdplayer',
  name: 'DVD Player',
  Icon: DVDPlayerIcon,
  // A 16:9 picture under the 23 px title bar.
  window: { width: 720, height: 428, minWidth: 400, minHeight: 248 },
  inApplications: true,
  styles: () => import('./dvdplayer.css?inline'),
  // Jincheng's discs come with the library.
  data: () => import('../../media/library').then((library) => library.loadLibrary()),
  load: () => import('./DVDPlayer')
});
