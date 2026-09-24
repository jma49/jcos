import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// One Markdown file per project per language: projects/<lang>/<slug>.md
const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    status: z.enum(['live', 'wip', 'archived']),
    stack: z.array(z.string()).default([]),
    repo: z.string().url().optional(),
    demo: z.string().optional()
  })
});

export const collections = { projects };
