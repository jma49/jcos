import type { OSPhoto } from '../os/core/types';
import snapshot from '../data/photos.json' with { type: 'json' };

const PER_PAGE = 30;
const MAX_PAGES = 5;

interface UnsplashPhoto {
  id: string;
  width: number;
  height: number;
  color: string | null;
  created_at: string;
  description: string | null;
  alt_description: string | null;
  urls: { raw: string };
  links: { html: string };
}

/**
 * Adds Unsplash's image-CDN sizing parameters to a raw photo URL. Drops the
 * per-request tracking id so the snapshot only changes when the photos do.
 */
function sized(raw: string, width: number, quality: number) {
  const url = new URL(raw);
  url.searchParams.delete('ixid');
  url.search = `${url.search}${url.search ? '&' : '?'}w=${width}&q=${quality}&auto=format&fit=max`;
  return url.href;
}

/**
 * Where to list a user's photos. With an access key this is the official
 * API; without one it is the endpoint unsplash.com itself uses, which
 * sometimes blocks requests from build servers.
 */
function endpoint(username: string, page: number, key: string | undefined): { url: string; headers: Record<string, string> } {
  const query = `per_page=${PER_PAGE}&page=${page}&order_by=latest`;
  return key
    ? { url: `https://api.unsplash.com/users/${username}/photos?${query}`, headers: { Authorization: `Client-ID ${key}` } }
    : { url: `https://unsplash.com/napi/users/${username}/photos?${query}`, headers: {} };
}

/**
 * Fetches the public Unsplash photos of the profile at `profileUrl`, newest
 * first. Returns an empty list on any failure. Set UNSPLASH_ACCESS_KEY to
 * use the official API.
 */
export async function fetchPhotos(profileUrl: string): Promise<OSPhoto[]> {
  const username = new URL(profileUrl).pathname.replace(/^\/@/, '');
  const key = process.env.UNSPLASH_ACCESS_KEY || undefined;
  const photos: OSPhoto[] = [];
  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const { url, headers } = endpoint(username, page, key);
      const res = await fetch(url, {
        headers: { Accept: 'application/json', ...headers },
        signal: AbortSignal.timeout(10_000)
      });
      if (!res.ok) {
        console.warn(`[photos] Unsplash answered ${res.status} for page ${page}`);
        return [];
      }
      const batch = (await res.json()) as UnsplashPhoto[];
      for (const p of batch) {
        photos.push({
          id: p.id,
          width: p.width,
          height: p.height,
          color: p.color ?? '#999999',
          taken: p.created_at,
          alt: p.description ?? p.alt_description ?? 'Photo by Jincheng Ma',
          thumb: sized(p.urls.raw, 480, 70),
          full: sized(p.urls.raw, 2000, 82),
          page: p.links.html
        });
      }
      if (batch.length < PER_PAGE) break;
    }
  } catch (error) {
    console.warn(`[photos] Could not load Unsplash photos: ${error}`);
    return [];
  }
  return photos;
}

/**
 * The photos for the Photos app: fetched live at build time, or the
 * committed snapshot in src/data/photos.json when Unsplash can't be reached.
 * `npm run photos:update` refreshes the snapshot.
 */
export async function getPhotos(profileUrl: string): Promise<OSPhoto[]> {
  const photos = await fetchPhotos(profileUrl);
  if (photos.length > 0) return photos;
  console.warn(`[photos] Using the snapshot of ${snapshot.length} photos`);
  return snapshot;
}
