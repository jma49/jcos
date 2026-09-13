// Derives public/portrait.jpg from the full-resolution source photo.
// The extract window is hand-picked for this frame: it keeps roughly 20%
// headroom above the subject and lands the face just left of centre.
import sharp from 'sharp';

const SRC = process.argv[2];
if (!SRC) {
  console.error('usage: node scripts/build-portrait.mjs <source.jpg>');
  process.exit(1);
}

const CROP = { left: 1904, top: 1547, width: 2500, height: 3125 }; // 4:5

await sharp(SRC)
  .extract(CROP)
  .resize({ width: 900, height: 1125, fit: 'cover' })
  .jpeg({ quality: 88, mozjpeg: true, chromaSubsampling: '4:4:4' })
  .toFile('public/portrait.jpg');

const meta = await sharp('public/portrait.jpg').metadata();
console.log(`public/portrait.jpg ${meta.width}x${meta.height}`);
