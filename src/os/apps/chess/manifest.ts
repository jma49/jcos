import { defineApp, pngIcon } from '../../kit/manifest';

export default defineApp({
  id: 'chess',
  name: 'Chess',
  added: '2026-09-29',
  Icon: pngIcon('chess'),
  window: { width: 560, height: 540, minWidth: 340, minHeight: 380 },
  inApplications: true,
  styles: () => import('./chess.css?inline'),
  load: () => import('./Chess')
});
