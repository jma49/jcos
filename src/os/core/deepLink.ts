import { launch, openableApps } from './registry';
import { useWindows } from './store';
import type { AppId, OSData } from './types';

/**
 * Handles links like /?open=resume or /?open=ocra, once: `open` leaves the
 * address as it's handled, so a reload brings the session back
 * (windowSession.ts) rather than this again. Returns whether it opened
 * anything.
 */
export function openFromUrl(data: OSData): boolean {
  const url = new URL(window.location.href);
  const target = url.searchParams.get('open')?.toLowerCase();
  if (!target) return false;
  // A password reset link from the recovery email: its token opens the
  // Account window. It leaves the address bar with `open`, so neither is
  // kept in history.
  const reset = target === 'account' ? url.searchParams.get('reset') : null;
  url.searchParams.delete('open');
  url.searchParams.delete('reset');
  window.history.replaceState(window.history.state, '', url);
  if (reset) {
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
