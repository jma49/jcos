import { defineApp } from '../../kit/manifest';
import { PhotoBoothIcon } from '../../core/icons';

export default defineApp({
  id: 'photobooth',
  name: 'Photo Booth',
  Icon: PhotoBoothIcon,
  window: { width: 640, height: 620, minWidth: 420, minHeight: 460 },
  material: 'metal',
  inApplications: true,
  styles: () => import('./photo-booth.css?inline'),
  load: () => import('./PhotoBooth')
});
