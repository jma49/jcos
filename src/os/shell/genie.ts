// The Genie effect: a window pours into its Dock icon through a funnel.
//
// An SVG feDisplacementMap does the warping. Each output pixel samples the
// window at an offset read from a generated map: rows near the bottom are
// squeezed toward the Dock icon, so animating the filter's `scale` from 0
// bends the window into a funnel, and a transform then slides it in.

/** Largest sample offset in the map, as a fraction of the window width. */
export const GENIE_REACH = 1.5;
/** How narrow the funnel's neck gets, as a fraction of the window width. */
const NECK = 0.08;
const MAP_SIZE = 96;

/** Safari doesn't apply SVG filters to HTML elements reliably. */
export const genieSupported =
  typeof navigator !== 'undefined' && !/^((?!chrome|android).)*safari/i.test(navigator.userAgent);

const smoothstep = (t: number) => t * t * (3 - 2 * t);

/**
 * A displacement map for a funnel whose neck sits at `neck` across the
 * window's bottom edge (0 = left, 1 = right). Red holds the horizontal
 * offset; green stays at 0.5, so nothing moves vertically.
 */
export function genieMap(neck: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = MAP_SIZE;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(MAP_SIZE, MAP_SIZE);
  for (let row = 0; row < MAP_SIZE; row++) {
    const k = smoothstep(row / (MAP_SIZE - 1));
    const width = 1 - (1 - NECK) * k;
    const center = 0.5 + (neck - 0.5) * k;
    for (let col = 0; col < MAP_SIZE; col++) {
      const u = col / (MAP_SIZE - 1);
      // The source column this output column shows once the row is squeezed.
      const source = (u - center) / width + 0.5;
      const offset = Math.max(-GENIE_REACH, Math.min(GENIE_REACH, source - u));
      const i = (row * MAP_SIZE + col) * 4;
      image.data[i] = Math.round((0.5 + offset / (2 * GENIE_REACH)) * 255);
      image.data[i + 1] = 128;
      image.data[i + 2] = 0;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL();
}
