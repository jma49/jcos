import { defineApp, pngIcon } from '../../kit/manifest';

export default defineApp({
  id: 'jobhunt',
  name: 'Job Hunt',
  added: '2026-09-30',
  // Bento's, FileMaker's personal database for Leopard: a box of records.
  Icon: pngIcon('bento'),
  window: { width: 1100, height: 660, minWidth: 620, minHeight: 420 },
  material: 'metal',
  inApplications: true,
  styles: () => import('./jobhunt.css?inline'),
  load: () => import('./JobHunt')
});
