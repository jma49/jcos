import { defineApp } from '../../kit/manifest';
import { BrowserIcon } from '../../core/icons';

export default defineApp({
  id: 'browser',
  name: 'Browser',
  Icon: BrowserIcon,
  window: { width: 1040, height: 700, minWidth: 420, minHeight: 300 },
  material: 'metal',
  inApplications: true,
  load: () => import('./Browser')
});
