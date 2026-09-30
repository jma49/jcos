import { defineApp } from '../../kit/manifest';
import { ProjectIcon } from '../../core/icons';

export default defineApp({
  id: 'welcome',
  name: 'Welcome',
  added: '2026-09-25',
  Icon: ProjectIcon,
  window: { width: 580, height: 450, minWidth: 380, minHeight: 420 },
  internal: true,
  noDock: true,
  styles: () => import('./welcome.css?inline'),
  load: () => import('./Welcome')
});
