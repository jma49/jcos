import { defineApp } from '../../kit/manifest';
import { AboutIcon } from '../../core/icons';

// TextEdit, for Jincheng's documents and diary in the home folder.
export default defineApp({
  id: 'textedit',
  name: 'TextEdit',
  added: '2026-09-29',
  Icon: AboutIcon,
  window: { width: 600, height: 520, minWidth: 320, minHeight: 240 },
  inApplications: true,
  styles: () => import('./textedit.css?inline'),
  load: () => import('./TextEdit')
});
