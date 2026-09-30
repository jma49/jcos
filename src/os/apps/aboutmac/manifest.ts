import { defineApp } from '../../kit/manifest';
import { AppleIcon } from '../../core/icons';

export default defineApp({
  id: 'aboutmac',
  name: 'About This Mac',
  added: '2026-09-26',
  Icon: AppleIcon,
  window: { width: 300, height: 420, minWidth: 280, minHeight: 380 },
  noDock: true,
  styles: () => import('./about-mac.css?inline'),
  load: () => import('./AboutThisMac')
});
