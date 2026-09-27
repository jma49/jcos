import { defineApp } from '../../kit/manifest';
import { ProjectIcon } from '../../core/icons';

export default defineApp({
  id: 'project',
  name: 'Project',
  Icon: ProjectIcon,
  window: { width: 640, height: 640, minWidth: 380, minHeight: 300 },
  internal: true,
  styles: () => import('./project.css?inline'),
  load: () => import('./ProjectDetail')
});
