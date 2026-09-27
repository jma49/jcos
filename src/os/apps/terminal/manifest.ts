import { defineApp } from '../../kit/manifest';
import { TerminalIcon } from '../../core/icons';

export default defineApp({
  id: 'terminal',
  name: 'Terminal',
  Icon: TerminalIcon,
  window: { width: 640, height: 420, minWidth: 360, minHeight: 220 },
  inApplications: true,
  styles: () => import('./terminal.css?inline'),
  load: () => import('./Terminal')
});
