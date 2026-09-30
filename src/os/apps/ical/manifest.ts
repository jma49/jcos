import { defineApp, pngIcon } from '../../kit/manifest';

// iCal, as in Tiger: a member's own days and to-dos, which only they see.
export default defineApp({
  id: 'ical',
  name: 'iCal',
  Icon: pngIcon('ical'),
  window: { width: 900, height: 600, minWidth: 360, minHeight: 360 },
  material: 'metal',
  inApplications: true,
  styles: () => import('./ical.css?inline'),
  load: () => import('./ICal')
});
