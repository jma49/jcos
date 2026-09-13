// Turns a screenshot of scripts/og-card.html into public/og.png.
//
// The card page scales its 1200x630 artboard to fill the window width and pins
// it to the viewport origin, so the card is always the full-width top slice of
// the screenshot with the card's own aspect ratio. That means the crop needs no
// measurement beyond the screenshot's width, and the result is downsampled
// rather than upscaled.
import sharp from 'sharp';

const WIDTH = 1200;
const HEIGHT = 630;

const shot = process.argv[2];
if (!shot) {
  console.error('usage: node scripts/build-og.mjs <screenshot.(jpg|png)>');
  process.exit(1);
}

const meta = await sharp(shot).metadata();
const cropHeight = Math.round((meta.width * HEIGHT) / WIDTH);

if (cropHeight > meta.height) {
  console.error(
    `screenshot is too short: need ${cropHeight}px of a ${meta.width}px-wide capture, got ${meta.height}px`
  );
  process.exit(1);
}

await sharp(shot)
  .extract({ left: 0, top: 0, width: meta.width, height: cropHeight })
  .resize(WIDTH, HEIGHT, { fit: 'fill', kernel: 'lanczos3' })
  .png({ compressionLevel: 9 })
  .toFile('public/og.png');

const out = await sharp('public/og.png').metadata();
console.log(`public/og.png ${out.width}x${out.height} (from ${meta.width}x${cropHeight})`);
