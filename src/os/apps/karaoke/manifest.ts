import { defineApp } from '../../kit/manifest';
import { KaraokeIcon } from '../../core/icons';

export default defineApp({
  id: 'karaoke',
  name: 'Karaoke',
  Icon: KaraokeIcon,
  window: { width: 760, height: 500, minWidth: 460, minHeight: 320 },
  inApplications: true,
  styles: () => import('./karaoke.css?inline'),
  load: () => import('./Karaoke')
});
