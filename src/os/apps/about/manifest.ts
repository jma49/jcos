import { defineApp } from '../../kit/manifest';
import { AboutIcon } from '../../core/icons';

export default defineApp({
  id: 'about',
  name: 'About Me',
  added: '2026-09-24',
  Icon: AboutIcon,
  window: { width: 560, height: 520, minWidth: 360, minHeight: 280 },
  styles: () => import('./about.css?inline'),
  load: () => import('./About')
});
