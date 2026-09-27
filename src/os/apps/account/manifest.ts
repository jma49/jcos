import { defineApp } from '../../kit/manifest';
import { AccountIcon } from '../../core/icons';

export default defineApp({
  id: 'account',
  name: 'Account',
  Icon: AccountIcon,
  window: { width: 420, height: 470, minWidth: 380, minHeight: 400 },
  load: () => import('./Account')
});
