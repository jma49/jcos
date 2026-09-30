import { defineApp, pngIcon } from '../../kit/manifest';

export default defineApp({
  id: 'timemachine',
  name: 'Time Machine',
  added: '2026-09-29',
  Icon: pngIcon('backup-restore'),
  // Never a window: Time Machine takes the whole screen.
  window: { width: 800, height: 560, minWidth: 480, minHeight: 360 },
  fullScreen: true,
  dock: 6,
  inApplications: true,
  styles: () => import('./timemachine.css?inline'),
  // The music library, for the Music folder as it was.
  data: () => import('../../media/library').then((library) => library.loadLibrary()),
  load: () => import('./TimeMachine')
});
