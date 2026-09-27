import { defineApp } from '../../kit/manifest';
import { AppletStoreIcon } from '../../core/icons';

export default defineApp({
  id: 'appstore',
  name: 'Applet Store',
  Icon: AppletStoreIcon,
  window: { width: 680, height: 540, minWidth: 420, minHeight: 360 },
  inApplications: true,
  load: () => import('./AppletStore')
});
