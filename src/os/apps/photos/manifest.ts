import { defineApp } from '../../kit/manifest';
import { PhotosIcon } from '../../core/icons';

export default defineApp({
  id: 'photos',
  name: 'Photos',
  Icon: PhotosIcon,
  window: { width: 1000, height: 680, minWidth: 420, minHeight: 320 },
  material: 'metal',
  dock: 3,
  phoneDock: true,
  inApplications: true,
  styles: () => import('./photos.css?inline'),
  load: () => import('./Photos')
});
