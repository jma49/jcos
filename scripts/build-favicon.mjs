// Generates the favicon set in public/ from one vector definition.
//
// The mark is the same "JM" monogram the nav uses, inverted: the site draws
// light letters on a dark chip, which would disappear against a dark browser
// tab, so the icon puts near-black letters on the accent violet instead.
//
// Letterforms come from Helvetica Neue rather than the site's Inter (which is
// only loaded from Google Fonts at runtime, not installed locally). The two are
// close enough at monogram sizes; the rendered PNGs are checked in, so this
// script only needs to run when the mark itself changes.
import { Buffer } from 'node:buffer';
import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const ACCENT = '#8b80f9';
const INK = '#08090a';

/** Square monogram at an arbitrary size, so every raster starts from vector. */
const mark = (size) => {
  const radius = size * 0.22;
  // Optical centring: cap-height text sits slightly high when centred on the box.
  const baseline = size * 0.5 + size * 0.205;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="${ACCENT}"/>
      <text x="${size * 0.5}" y="${baseline}"
            font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
            font-size="${size * 0.58}" font-weight="700"
            letter-spacing="${size * -0.015}"
            fill="${INK}" text-anchor="middle">JM</text>
    </svg>`
  );
};

const png = (size) => sharp(mark(size)).png({ compressionLevel: 9 }).toBuffer();

/**
 * Minimal ICO container. Each entry holds a complete PNG, which every browser
 * that matters has understood for well over a decade.
 */
const ico = (images) => {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // palette size
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
};

const icoSizes = [16, 32, 48];
const images = await Promise.all(
  icoSizes.map(async (size) => ({ size, data: await png(size) }))
);
await writeFile('public/favicon.ico', ico(images));

await writeFile('public/favicon-32x32.png', await png(32));
await writeFile('public/apple-touch-icon.png', await png(180));

console.log(
  `public/favicon.ico (${icoSizes.join(', ')}px), favicon-32x32.png, apple-touch-icon.png`
);
