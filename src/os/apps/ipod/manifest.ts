import { defineApp } from '../../kit/manifest';
import { IPodIcon } from '../../core/icons';

export default defineApp({
  id: 'ipod',
  name: 'iPod',
  Icon: IPodIcon,
  window: { width: 300, height: 492, minWidth: 300, minHeight: 492 },
  dock: 4,
  inApplications: true,
  styles: () => import('./styles.css?inline'),
  // Its music, songs or Finder's Music folder.
  data: () => import('../../media/library').then((library) => library.loadLibrary()),
  load: () => import('./IPod')
});
