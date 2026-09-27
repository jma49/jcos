import { defineApp } from '../../kit/manifest';
import { AirDropIcon } from '../../core/icons';

export default defineApp({
  id: 'airdrop',
  name: 'AirDrop',
  Icon: AirDropIcon,
  window: { width: 520, height: 500, minWidth: 380, minHeight: 400 },
  inApplications: true,
  styles: () => import('./airdrop.css?inline'),
  // Its music, songs or Finder's Music folder.
  data: () => import('../../media/library').then((library) => library.loadLibrary()),
  load: () => import('./AirDrop')
});
