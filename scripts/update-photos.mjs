// Refreshes src/data/photos.json, the snapshot of Unsplash photos the build
// falls back to when it can't reach Unsplash. Leaves the file alone when the
// fetch fails, so a blocked request never empties the Photos app.
import { readFile, writeFile } from 'node:fs/promises';
import { fetchPhotos } from '../src/lib/photos.ts';

const SNAPSHOT = new URL('../src/data/photos.json', import.meta.url);
const content = await readFile(new URL('../src/i18n/content.ts', import.meta.url), 'utf8');
const profileUrl = content.match(/photography: '([^']+)'/)?.[1];
if (!profileUrl) throw new Error('No photography URL in src/i18n/content.ts');

const photos = await fetchPhotos(profileUrl);
if (photos.length === 0) {
  console.log('No photos fetched; keeping the existing snapshot.');
  process.exit(0);
}

const next = `${JSON.stringify(photos, null, 2)}\n`;
const previous = await readFile(SNAPSHOT, 'utf8').catch(() => '');
if (next === previous) {
  console.log(`Snapshot is up to date (${photos.length} photos).`);
} else {
  await writeFile(SNAPSHOT, next);
  console.log(`Wrote ${photos.length} photos to src/data/photos.json.`);
}
