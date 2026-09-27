import { defineApp } from '../../kit/manifest';
import { StickiesIcon } from '../../core/icons';

export default defineApp({
  id: 'stickies',
  name: 'Stickies',
  Icon: StickiesIcon,
  window: { width: 720, height: 540, minWidth: 360, minHeight: 320 },
  inApplications: true,
  load: () => import('./Stickies')
});
