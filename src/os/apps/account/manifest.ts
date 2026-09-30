import { defineApp } from '../../kit/manifest';
import { AccountIcon } from '../../core/icons';

export default defineApp({
  id: 'account',
  name: 'Account',
  added: '2026-09-25',
  Icon: AccountIcon,
  window: { width: 420, height: 470, minWidth: 380, minHeight: 400 },
  styles: () => import('./account.css?inline'),
  load: () => import('./Account')
});
