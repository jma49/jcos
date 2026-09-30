import { defineApp } from '../../kit/manifest';
import { FolderIcon } from '../../core/icons';

export default defineApp({
  id: 'projects',
  name: 'Projects',
  added: '2026-09-24',
  Icon: FolderIcon,
  window: { width: 700, height: 460, minWidth: 420, minHeight: 280 },
  dock: 2,
  phoneDock: true,
  load: () => import('./Projects')
});
