import { defineApp, pngIcon } from '../../kit/manifest';

export default defineApp({
  id: 'synth',
  name: 'Synth',
  Icon: pngIcon('synth'),
  window: { width: 640, height: 380, minWidth: 520, minHeight: 340 },
  material: 'metal',
  applet: {
    category: 'Utilities',
    tagline: 'A little synthesizer you play with your keyboard.',
    description:
      'Two octaves of keys, played with the mouse or with your computer’s keys (A to K for the white notes, W to U for the black). Pick a waveform or a preset, shape the attack and release, add some echo, and watch the wave on the oscilloscope. It follows the sound switch in the menu bar.',
    added: '2026-09-27'
  },
  load: () => import('./Synth')
});
