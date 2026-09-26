import type { APIRoute } from 'astro';
import { content, profile } from '../i18n/content';
import { getProjects, projectHref } from '../lib/projects';

// A plain-text summary of the site for LLM crawlers (https://llmstxt.org).
// The site itself is a desktop that needs JavaScript, so this carries the
// résumé in full rather than linking to it.
export const GET: APIRoute = async ({ site }) => {
  const t = content.en;
  const url = (path: string) => new URL(path, site).href;
  const projects = await getProjects('en');
  const strip = (text: string) => text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  const lines = [
    `# ${profile.name.en}`,
    '',
    `> ${t.meta.description}`,
    '',
    ...t.bio.longParagraphs.map(strip).flatMap((p) => [p, '']),
    `This site is JM/OS, a Mac OS X–style desktop that runs in the browser (${url('/')}). This file is its text.`,
    '',
    '## Projects',
    '',
    ...projects.map((p) => `- [${p.data.title}](${url(projectHref('en', p.slug))}): ${p.data.description}`),
    '',
    '## Experience',
    '',
    ...t.jobs.map((job) => `- ${job.company}, ${job.role} (${job.period}): ${job.summary}`),
    '',
    `## ${t.education.title}`,
    '',
    ...t.education.items.map((e) => `- ${e.school}, ${e.degree} (${e.period})`),
    '',
    `## ${t.skills.title}`,
    '',
    ...t.skills.groups.map((g) => `- ${g.name}: ${g.items.join(', ')}`),
    '',
    '## Links',
    '',
    `- [GitHub](${profile.github})`,
    `- [LinkedIn](${profile.linkedin})`,
    `- [Photography](${profile.photography})`,
    ''
  ];

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
};
