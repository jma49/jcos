import { defineApp } from '../../kit/manifest';
import Icon from './Icon';

export default defineApp({
  id: 'pinball',
  name: 'Pinball',
  Icon,
  window: { width: 440, height: 700, minWidth: 340, minHeight: 520 },
  applet: {
    category: 'Games',
    tagline: 'A space pinball table, in the spirit of 3D Pinball.',
    description:
      'An original table in the spirit of 3D Pinball’s Space Cadet: a launch lane, pop bumpers, slingshots, drop targets and lane lights that raise your rank from Cadet to Admiral. Flippers on Z and / (or the arrow keys), Space to launch, three balls.',
    added: '2026-09-27'
  },
  styles: () => import('./pinball.css?inline'),
  load: () => import('./Pinball')
});
