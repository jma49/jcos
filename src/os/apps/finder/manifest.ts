import { defineApp } from '../../kit/manifest';
import { FinderIcon } from '../../core/icons';

export default defineApp({
  id: 'finder',
  name: 'Finder',
  Icon: FinderIcon,
  window: { width: 760, height: 480, minWidth: 440, minHeight: 300 },
  material: 'metal',
  dock: 1,
  styles: () => import('./finder.css?inline'),
  // Its music, songs or Finder's Music folder.
  data: () => import('../../media/library').then((library) => library.loadLibrary()),
  load: () => import('./Finder')
});
