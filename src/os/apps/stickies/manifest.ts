import { defineApp } from '../../kit/manifest';
import { StickiesIcon } from '../../core/icons';

export default defineApp({
  id: 'stickies',
  name: 'Stickies',
  added: '2026-09-25',
  Icon: StickiesIcon,
  window: { width: 720, height: 540, minWidth: 360, minHeight: 320 },
  inApplications: true,
  styles: () => import('./stickies.css?inline'),
  load: () => import('./Stickies')
});
