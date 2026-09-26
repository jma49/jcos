import { launch, openableApps } from './registry';
import { useWindows } from './store';
import type { AppId, OSData } from './types';

/** Handles links like /?open=resume or /?open=ocra. Returns whether it opened anything. */
export function openFromUrl(data: OSData): boolean {
  const params = new URLSearchParams(window.location.search);
  const target = params.get('open')?.toLowerCase();
  if (!target) return false;
  // A password reset link from the recovery email: its token opens the
  // Account window, and leaves the address bar so it isn't kept in history.
  const reset = target === 'account' ? params.get('reset') : null;
  if (reset) {
    const url = new URL(window.location.href);
    url.searchParams.delete('reset');
    window.history.replaceState(window.history.state, '', url);
    launch('account', { props: { tab: 'reset', reset }, center: true });
    return true;
  }
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
