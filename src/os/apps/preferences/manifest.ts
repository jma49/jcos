import { defineApp } from '../../kit/manifest';
import { PreferencesIcon } from '../../core/icons';
import { PANES } from './panes';

export default defineApp({
  id: 'preferences',
  name: 'System Preferences',
  Icon: PreferencesIcon,
  window: { width: 668, height: 540, minWidth: 480, minHeight: 380 },
  noDock: true,
  menuOnly: true,
  // Preferences isn't listed as an app; its panes are found by name.
  shortcuts: PANES.map((p) => ({ id: p.id, name: p.name, Icon: p.Icon, props: { pane: p.id } })),
  styles: () => import('./preferences.css?inline'),
  // Its music, songs or Finder's Music folder.
  data: () => import('../../media/library').then((library) => library.loadLibrary()),
  load: () => import('./Preferences')
});
