import { defineApp } from '../../kit/manifest';
import { ResumeIcon } from '../../core/icons';

export default defineApp({
  id: 'resume',
  name: 'Résumé',
  added: '2026-09-24',
  Icon: ResumeIcon,
  window: { width: 900, height: 760, minWidth: 420, minHeight: 320 },
  styles: () => import('./resume.css?inline'),
  load: () => import('./Resume')
});
