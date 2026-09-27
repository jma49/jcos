import { defineApp, pngIcon } from '../../kit/manifest';

export default defineApp({
  id: 'calculator',
  name: 'Calculator',
  Icon: pngIcon('calculator'),
  window: { width: 250, height: 360, minWidth: 230, minHeight: 340 },
  material: 'metal',
  applet: {
    category: 'Utilities',
    tagline: 'Add, subtract, multiply, divide. Nicely.',
    description:
      'A four-function calculator with an LCD and Aqua keys. It chains operations, repeats the last one when you press = again, rounds away floating-point noise, and follows your keyboard.',
    added: '2026-09-26'
  },
  styles: () => import('./calculator.css?inline'),
  load: () => import('./Calculator')
});
