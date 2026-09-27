import { defineApp } from '../../kit/manifest';
import { ResumeIcon } from '../../core/icons';

export default defineApp({
  id: 'resume',
  name: 'Résumé',
  Icon: ResumeIcon,
  window: { width: 900, height: 760, minWidth: 420, minHeight: 320 },
  load: () => import('./Resume')
});
