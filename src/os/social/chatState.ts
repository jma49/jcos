// Chat outside the Chat window: which room it shows, what's unread, and
// the alerts for private messages and @mentions. The watcher runs while
// the Chat window is open, and all the time for a signed-in member so a
// private message or a mention reaches them with Chat closed.

import { createElement } from 'react';
import { create } from 'zustand';
import { launch } from '../core/registry';
import { notify } from '../core/notices';
import { play } from '../core/sound';
import { loadJSON, saveJSON } from '../core/storage';
import { useWindows } from '../core/store';
import { useAccount } from './account';
import { getSocial } from './social';
import { isDM, type ChatMessage } from './types';

const READ_KEY = 'os-chat-read';

interface ChatState {
  /** The room the Chat window shows, while it's open. */
  room: string | null;
  /** New messages per room since it was last read. */
  unread: Record<string, number>;
  /** Of those, the ones that call for the member: private messages and @mentions. */
  alerts: Record<string, number>;
  /** When each room was last read (ISO), kept in this browser. */
  read: Record<string, string>;
}

export const useChatState = create<ChatState>(() => ({
  room: null,
  unread: {},
  alerts: {},
  read: loadJSON<Record<string, string>>(READ_KEY, {})
}));

/** The room the Chat window now shows (null as it closes). */
export function showRoom(room: string | null) {
  useChatState.setState({ room });
  if (room) markRead(room);
}

/** Everything in a room up to `at` (default: now) has been seen. */
export function markRead(room: string, at = new Date().toISOString()) {
  useChatState.setState((s) => {
    const read = { ...s.read, [room]: at > (s.read[room] ?? '') ? at : s.read[room] };
    saveJSON(READ_KEY, read);
    return { read, unread: { ...s.unread, [room]: 0 }, alerts: { ...s.alerts, [room]: 0 } };
  });
}

/** How many messages are waiting for the member, for the Dock. */
export function useChatBadge() {
  return useChatState((s) => Object.values(s.alerts).reduce((a, b) => a + b, 0));
}

/** Whether a message says @username (case aside, not inside a longer name). */
export function mentions(body: string, username: string) {
  return new RegExp(`(^|[^\\w@])@${username}(?!\\w)`, 'i').test(body);
}

/** Whether the visitor is looking at this room right now. */
function watching(room: string) {
  if (typeof document !== 'undefined' && document.hidden) return false;
  if (useChatState.getState().room !== room) return false;
  const { windows, order } = useWindows.getState();
  const front = [...order].reverse().find((id) => !windows[id]?.minimized);
  return front !== undefined && windows[front]?.app === 'chat';
}

function receive(message: ChatMessage) {
  const me = useAccount.getState().account;
  if (me && message.user_id === me.id) return;
  if (watching(message.room)) return markRead(message.room, message.created_at);

  const calling = me !== null && (isDM(message.room) || mentions(message.body, me.username));
  useChatState.setState((s) => ({
    unread: { ...s.unread, [message.room]: (s.unread[message.room] ?? 0) + 1 },
    alerts: calling ? { ...s.alerts, [message.room]: (s.alerts[message.room] ?? 0) + 1 } : s.alerts
  }));
  if (!calling) return;
  play('pop');
  notify({
    id: `chat:${message.room}`,
    title: isDM(message.room) ? message.username : `${message.username} mentioned you in #${message.room}`,
    body: message.body,
    icon: createElement('span', { className: 'os-chat-avatar', style: { '--hue': hue(message.username) } }, message.username[0]?.toUpperCase()),
    onClick: () => launch('chat', { props: { room: message.room } })
  });
}

/** A steady colour per username, for avatars. */
export function hue(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

let stop: (() => void) | null = null;
let started = false;

/**
 * Watches chat whenever it's useful: while a Chat window is open, or all
 * the time for a signed-in member. Call once, as the desktop starts.
 */
export function startChatWatch() {
  if (started) return;
  started = true;
  const update = async () => {
    const chatOpen = Object.values(useWindows.getState().windows).some((w) => w.app === 'chat');
    const wanted = chatOpen || useAccount.getState().account !== null;
    if (wanted && !stop) {
      const social = await getSocial();
      if (!social || stop) return;
      stop = social.watchChat({ onMessage: receive, onRemove: () => {} });
    } else if (!wanted && stop) {
      stop();
      stop = null;
    }
  };
  useWindows.subscribe((s, prev) => s.windows !== prev.windows && update());
  useAccount.subscribe((s, prev) => {
    if (s.account?.id === prev.account?.id) return;
    // Someone else's private conversations aren't this member's to count.
    useChatState.setState({ unread: {}, alerts: {} });
    update();
  });
  update();
}
