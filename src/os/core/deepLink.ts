import { launch, openableApps } from './registry';
import { useWindows } from './store';
import type { AppId, OSData } from './types';

/** Handles links like /?open=resume or /?open=ocra. Returns whether it opened anything. */
export function openFromUrl(data: OSData): boolean {
  const target = new URLSearchParams(window.location.search).get('open')?.toLowerCase();
  if (!target) return false;
  if (target === 'dashboard') {
    useWindows.getState().setDashboard(true);
    return true;
  }
  if (target === 'screensaver') {
    useWindows.getState().setScreensaver(true);
    return true;
  }
  if ((openableApps as string[]).includes(target)) {
    launch(target as AppId);
    return true;
  }
  const project = data.projects.find((p) => p.slug === target);
  if (project) {
    launch('project', { key: `project:${project.slug}`, title: project.title, props: { slug: project.slug } });
    return true;
  }
  return false;
}
