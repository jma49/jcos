import { defineApp } from '../../kit/manifest';
import { TerminalIcon } from '../../core/icons';

export default defineApp({
  id: 'terminal',
  name: 'Terminal',
  added: '2026-09-24',
  Icon: TerminalIcon,
  window: { width: 640, height: 420, minWidth: 360, minHeight: 220 },
  inApplications: true,
  styles: () => import('./terminal.css?inline'),
  // Its music, songs or Finder's Music folder.
  data: () => import('../../media/library').then((library) => library.loadLibrary()),
  load: () => import('./Terminal')
});
