import { defineApp } from '../../kit/manifest';
import { SoapboxIcon } from '../../core/icons';

export default defineApp({
  id: 'soapbox',
  name: 'Soapbox',
  Icon: SoapboxIcon,
  window: { width: 560, height: 600, minWidth: 360, minHeight: 300 },
  inApplications: true,
  styles: () => import('./soapbox.css?inline'),
  load: () => import('./Soapbox')
});
