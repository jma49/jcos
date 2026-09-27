import { defineApp } from '../../kit/manifest';
import { ChatIcon } from '../../core/icons';

export default defineApp({
  id: 'chat',
  name: 'Chat',
  Icon: ChatIcon,
  window: { width: 560, height: 600, minWidth: 360, minHeight: 340 },
  dock: 5,
  phoneDock: true,
  inApplications: true,
  styles: () => import('./chat.css?inline'),
  load: () => import('./Chat')
});
