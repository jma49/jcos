import { getCollection, type CollectionEntry } from 'astro:content';
import type { Lang } from '../i18n/content';

export type Project = CollectionEntry<'projects'> & { slug: string };

/** Projects in one language: by `order` (lowest first), then newest first. */
export async function getProjects(lang: Lang): Promise<Project[]> {
  const entries = await getCollection('projects', (entry) => entry.id.startsWith(`${lang}/`));
  return entries
    .map((entry) => ({ ...entry, slug: entry.id.slice(lang.length + 1) }))
    .sort(
      (a, b) =>
        (a.data.order ?? Infinity) - (b.data.order ?? Infinity) ||
        b.data.date.getTime() - a.data.date.getTime()
    );
}

export function projectHref(lang: Lang, slug: string): string {
  return `${lang === 'zh' ? '/zh' : ''}/projects/${slug}/`;
}

export function formatMonth(lang: Lang, date: Date): string {
  if (lang === 'zh') {
    return `${date.getUTCFullYear()}.${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}
