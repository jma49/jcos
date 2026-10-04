import { getCollection, type CollectionEntry } from 'astro:content';

export type Project = CollectionEntry<'projects'> & { slug: string };

/** The projects: by `order` (lowest first), then newest first. */
export async function getProjects(): Promise<Project[]> {
  const entries = await getCollection('projects');
  return entries
    .map((entry) => ({ ...entry, slug: entry.id }))
    .sort((a, b) => (a.data.order ?? Infinity) - (b.data.order ?? Infinity) || b.data.date.getTime() - a.data.date.getTime());
}

export function projectHref(slug: string): string {
  return `/projects/${slug}/`;
}

export function formatMonth(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}
