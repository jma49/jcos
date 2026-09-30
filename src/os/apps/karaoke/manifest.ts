import { defineApp } from '../../kit/manifest';
import { KaraokeIcon } from '../../core/icons';

export default defineApp({
  id: 'karaoke',
  name: 'Karaoke',
  added: '2026-09-25',
  Icon: KaraokeIcon,
  window: { width: 760, height: 500, minWidth: 460, minHeight: 320 },
  inApplications: true,
  styles: () => import('./karaoke.css?inline'),
  // Its music, songs or Finder's Music folder.
  data: () => import('../../media/library').then((library) => library.loadLibrary()),
  load: () => import('./Karaoke')
});
