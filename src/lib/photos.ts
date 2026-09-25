import { profile } from '../i18n/content';
import type { OSPhoto } from '../os/types';

const USERNAME = new URL(profile.photography).pathname.replace(/^\/@/, '');
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

/** Adds Unsplash's image-CDN sizing parameters to a raw photo URL. */
const sized = (raw: string, width: number, quality: number) =>
  `${raw}${raw.includes('?') ? '&' : '?'}w=${width}&q=${quality}&auto=format&fit=max`;

/**
 * The photographer's public Unsplash photos, newest first, fetched at build
 * time. This is the endpoint unsplash.com itself uses, not the keyed API, so
 * any failure returns an empty list and the Photos app links out instead.
 */
export async function getPhotos(): Promise<OSPhoto[]> {
  const photos: OSPhoto[] = [];
  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await fetch(
        `https://unsplash.com/napi/users/${USERNAME}/photos?per_page=${PER_PAGE}&page=${page}&order_by=latest`,
        { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) }
      );
      if (!res.ok) break;
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
  }
  return photos;
}
