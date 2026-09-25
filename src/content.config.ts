import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// One Markdown file per project per language: projects/<lang>/<slug>.md
const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      date: z.coerce.date(),
      status: z.enum(['live', 'wip', 'archived']),
      // Position in the list, lowest first; projects without one follow, newest first.
      order: z.number().int().optional(),
      stack: z.array(z.string()).default([]),
      repo: z.string().url().optional(),
      demo: z.string().optional(),
      // Preview image, relative to the Markdown file. 16:10 works best.
      cover: image().optional(),
      // Page to screenshot into `cover` (a site path or a URL); see
      // scripts/capture-previews.mjs.
      capture: z.string().optional()
    })
});

export const collections = { projects };
