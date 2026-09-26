// Growl-style notifications in the top-right corner: a new chat message
// that mentions the visitor, an AirDrop asking to be accepted. Shown by
// shell/Notices.tsx.

import type { ReactNode } from 'react';
import { create } from 'zustand';

export interface NoticeAction {
  label: string;
  primary?: boolean;
  run: () => void;
}

export interface Notice {
  id: string;
  title: string;
  body?: string;
  /** An icon or avatar at the left. */
  icon?: ReactNode;
  /** Clicking the notice itself (not one of its buttons). */
  onClick?: () => void;
  /** Buttons; a notice with any stays up until one is used. */
  actions?: NoticeAction[];
  /** Called when it goes away without an action (timed out or closed). */
  onDismiss?: () => void;
}

interface NoticeStore {
  notices: Notice[];
}

export const useNotices = create<NoticeStore>(() => ({ notices: [] }));

/** How many can be on screen; older ones make way. */
const MAX = 4;
/** Seconds a notice without buttons stays up. */
export const NOTICE_SECONDS = 6;

/** Shows a notification; returns its id. A notice with the same id replaces the old one. */
export function notify(notice: Omit<Notice, 'id'> & { id?: string }): string {
  const id = notice.id ?? crypto.randomUUID();
  useNotices.setState(({ notices }) => {
    const rest = notices.filter((n) => n.id !== id);
    const dropped = rest.length >= MAX ? rest.slice(0, rest.length - MAX + 1) : [];
    dropped.forEach((n) => n.onDismiss?.());
    return { notices: [...rest.slice(dropped.length), { ...notice, id }] };
  });
  return id;
}

/** Takes a notice away; `quietly` skips its onDismiss (it was answered). */
export function dismiss(id: string, quietly = false) {
  const notice = useNotices.getState().notices.find((n) => n.id === id);
  if (!notice) return;
  useNotices.setState(({ notices }) => ({ notices: notices.filter((n) => n.id !== id) }));
  if (!quietly) notice.onDismiss?.();
}
