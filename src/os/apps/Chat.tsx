import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AppProps } from '../core/registry';
import { launch } from '../core/registry';
import { isPhone, useFocusedId, useWindows } from '../core/store';
import { play } from '../core/sound';
import { load as loadKey, save } from '../core/storage';
import {
  CHAT_MAX,
  LOBBY,
  SocialError,
  dmPeer,
  dmRoom,
  getSocial,
  isDM,
  type ChatActivity,
  type ChatMessage,
  type ChatRoom,
  type Social
} from '../social/social';
import { useAccount } from '../social/account';
import { hue, markRead, mentions, showRoom, useChatState } from '../social/chatState';
import { onSignal, sendSignal } from '../social/signals';
import { notify } from '../core/notices';

// Chat, in the manner of iChat: public rooms everyone can read, and private
// conversations between two members. Members (signed in) can talk; anyone
// can read the rooms. Messages are kept for good and arrive live. Around
// them: who's in the room, who's typing, @mentions, and a nudge that shakes
// the other member's window.

type Load = { state: 'loading' } | { state: 'offline' } | { state: 'ready'; social: Social };

const ROOM_KEY = 'os-chat-room';
/** How long "is typing" lasts without another keystroke. */
const TYPING_MS = 4000;
/** At most one typing signal this often. */
const TYPING_EVERY = 2500;
/** At most one nudge this often, each way. */
const NUDGE_EVERY = 15_000;

/**
 * Whether a signal's sender is on the desktop as `username`. Signals can
 * say anything, so a name in one only counts if it's the name the sender's
 * own presence carries: one connection can't pose as many people.
 */
const sentBy = (from: string, username: unknown) =>
  typeof username === 'string' && useWindows.getState().visitors?.some((v) => v.id === from && v.username === username) === true;

const day = (iso: string) => new Date(iso).toDateString();

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) });
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

/** Messages that are only emoji (up to three) show large, as iChat did. */
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*\s*){1,3}$/u;

/** Links and @mentions in a message; everything else stays plain text. */
function Body({ text, me }: { text: string; me?: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]'"]|@[a-z0-9_]{3,20}\b)/gi);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return part;
        if (part.startsWith('@')) {
          const name = part.slice(1).toLowerCase();
          return (
            <span key={i} className="os-chat-mention" data-me={name === me || undefined}>
              {part}
            </span>
          );
        }
        return (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow ugc">
            {part}
          </a>
        );
      })}
    </>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="os-chat-avatar" style={{ '--hue': hue(name) } as React.CSSProperties} aria-hidden="true">
      {name[0]?.toUpperCase()}
    </span>
  );
}

/** The count, or a dot for news from before this visit. */
function Unread({ count, dot }: { count: number; dot: boolean }) {
  if (count > 0) return <span className="os-chat-unread">{count > 20 ? '20+' : count}</span>;
  if (dot) return <span className="os-chat-unread" data-dot aria-label="New messages" />;
  return null;
}

export default function Chat({ win }: AppProps) {
  const { account } = useAccount();
  const visitors = useWindows((s) => s.visitors) ?? [];
  const front = useFocusedId() === win.id;
  const unread = useChatState((s) => s.unread);
  const readAt = useChatState((s) => s.read);
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [rooms, setRooms] = useState<ChatRoom[]>([LOBBY]);
  const [activity, setActivity] = useState<Record<string, string>>({});
  /** Usernames by account id, for private conversations. */
  const [names, setNames] = useState<Record<string, string>>({});
  const [room, setRoom] = useState<string>(() => win.props?.room ?? loadKey(ROOM_KEY) ?? LOBBY.id);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingRoom, setLoadingRoom] = useState(true);
  const [more, setMore] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Narrow windows (and phones) show the room list over the conversation, so it starts closed there.
  const narrow = isPhone() || win.width < 440;
  const [sidebar, setSidebar] = useState(!narrow);
  const [newChat, setNewChat] = useState<string | null>(null);
  const [typing, setTyping] = useState<Record<string, number>>({});
  const [nudged, setNudged] = useState(false);
  /** Messages that arrived while the reader was scrolled up. */
  const [below, setBelow] = useState(0);
  const [pick, setPick] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  /** Whether the view should follow new messages: it was at the bottom. */
  const follow = useRef(true);
  const roomRef = useRef(room);
  roomRef.current = room;
  const lastTyping = useRef(0);
  const lastNudge = useRef(0);
  const nudgesFrom = useRef<Record<string, number>>({});

  const social = load.state === 'ready' ? load.social : null;
  const current = rooms.find((r) => r.id === room);
  const peer = account && isDM(room) ? dmPeer(room, account.id) : null;
  const peerName = peer ? (names[peer] ?? '…') : null;

  // The backend, the rooms, and news from every room.
  useEffect(() => {
    let live = true;
    let stop: (() => void) | undefined;
    getSocial()
      .then(async (s) => {
        if (!s) return live && setLoad({ state: 'offline' });
        const [list, act] = await Promise.all([s.listRooms(), s.chatActivity()]);
        if (!live) return;
        setRooms(list);
        setActivity(Object.fromEntries(act.map((a: ChatActivity) => [a.room, a.last_at])));
        setLoad({ state: 'ready', social: s });
        stop = s.watchChat({
          onMessage: (m) => {
            setActivity((all) => ({ ...all, [m.room]: m.created_at }));
            if (m.room !== roomRef.current) return;
            setMessages((all) => (all.some((x) => x.id === m.id) ? all : [...all, m]));
            setTyping(({ [m.username]: _done, ...rest }) => rest);
            if (m.user_id !== s.account()?.id) {
              play('pop');
              if (!follow.current) setBelow((n) => n + 1);
            }
          },
          onRemove: (id) => setMessages((all) => all.filter((m) => m.id !== id))
        });
      })
      .catch(() => live && setLoad({ state: 'offline' }));
    return () => {
      live = false;
      stop?.();
    };
  }, []);

  // The member's private conversations change with who's signed in.
  useEffect(() => {
    if (!social) return;
    social.chatActivity().then((act) => setActivity(Object.fromEntries(act.map((a) => [a.room, a.last_at]))));
    if (!account && isDM(roomRef.current)) setRoom(LOBBY.id);
  }, [social, account]);

  // Another window (a notification, a deep link) asked for a room.
  const asked = win.props?.room;
  useEffect(() => {
    if (asked) setRoom(asked);
  }, [asked, win.props]);

  // A room that doesn't exist falls back to the Lobby once the rooms are known.
  useEffect(() => {
    if (load.state === 'ready' && !isDM(room) && !rooms.some((r) => r.id === room)) setRoom(LOBBY.id);
  }, [load.state, rooms, room]);

  // Load the room's messages.
  useEffect(() => {
    if (!social) return;
    let live = true;
    save(ROOM_KEY, isDM(room) ? null : room);
    setLoadingRoom(true);
    setMessages([]);
    setTyping({});
    setBelow(0);
    setError(null);
    follow.current = true;
    social
      .listChat(room)
      .then((first) => {
        if (!live) return;
        setMessages(first);
        setMore(first.length >= 100);
      })
      .catch(() => live && setError('Couldn’t load this conversation.'))
      .finally(() => live && setLoadingRoom(false));
    return () => {
      live = false;
    };
  }, [social, room]);

  // The rest of JM/OS knows which room is open (for unread counts and presence).
  useEffect(() => {
    showRoom(room);
  }, [room]);
  useEffect(() => () => showRoom(null), []);
  useEffect(() => {
    if (front) markRead(room);
  }, [front, room, messages.length]);

  // Names for the private conversations in the list.
  const dmRooms = useMemo(() => {
    const list = Object.keys(activity).filter(isDM);
    if (isDM(room) && !list.includes(room)) list.push(room);
    return list.sort((a, b) => (activity[b] ?? '9').localeCompare(activity[a] ?? '9'));
  }, [activity, room]);
  useEffect(() => {
    if (!social || !account) return;
    for (const r of dmRooms) {
      const id = dmPeer(r, account.id);
      if (!names[id]) social.usernameOf(id).then((name) => setNames((all) => ({ ...all, [id]: name })));
    }
  }, [social, account, dmRooms, names]);

  // Who's typing, and nudges from the other member of a private conversation.
  useEffect(() => {
    const stopTyping = onSignal('chat-typing', ({ from, payload }) => {
      const { room: r, username } = payload;
      if (typeof r !== 'string' || typeof username !== 'string' || r !== roomRef.current || !sentBy(from, username)) return;
      if (username === useAccount.getState().account?.username) return;
      setTyping((all) => ({ ...all, [username.slice(0, 20)]: Date.now() }));
    });
    const stopNudge = onSignal('chat-nudge', ({ from: sender, payload }) => {
      const me = useAccount.getState().account;
      const { to, from } = payload;
      if (!me || to !== me.username || typeof from !== 'string' || !sentBy(sender, from)) return;
      const name = from.slice(0, 20);
      // One nudge per person per 15 seconds, and at most one every 3 seconds from anyone.
      const last = Math.max(0, ...Object.values(nudgesFrom.current));
      if (Date.now() - (nudgesFrom.current[name] ?? 0) < NUDGE_EVERY || Date.now() - last < 3000) return;
      nudgesFrom.current[name] = Date.now();
      play('chime');
      setNudged(true);
      setTimeout(() => setNudged(false), 800);
      notify({ title: `${name} nudged you`, body: 'Say something back?', onClick: () => startDM(name) });
    });
    const tick = setInterval(
      () =>
        setTyping((all) => {
          const now = Date.now();
          const kept = Object.entries(all).filter(([, at]) => now - at < TYPING_MS);
          return kept.length === Object.keys(all).length ? all : Object.fromEntries(kept);
        }),
      1000
    );
    return () => {
      stopTyping();
      stopNudge();
      clearInterval(tick);
    };
  }, []);

  // New messages keep the view at the bottom, unless the reader scrolled up.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && follow.current) el.scrollTop = el.scrollHeight;
  }, [messages, typing]);

  const toBottom = () => {
    const el = scroller.current;
    follow.current = true;
    setBelow(0);
    el?.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  const earlier = async () => {
    if (!social || !messages.length) return;
    const el = scroller.current;
    const from = el ? el.scrollHeight - el.scrollTop : 0;
    const older = await social.listChat(room, messages[0].created_at);
    setMore(older.length >= 100);
    follow.current = false;
    setMessages((all) => [...older, ...all]);
    // Keep the reader's place once the older messages are above it.
    requestAnimationFrame(() => el && (el.scrollTop = el.scrollHeight - from));
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!social || !text) return;
    setError(null);
    follow.current = true;
    setDraft('');
    try {
      await social.sendChat(room, text);
    } catch (err) {
      setDraft(text);
      setError(err instanceof SocialError ? err.message : 'Couldn’t send that. Try again.');
      play('error');
    }
  };

  const remove = async (id: string) => {
    if (!social) return;
    try {
      await social.deleteChat(id);
      setMessages((all) => all.filter((m) => m.id !== id));
    } catch {
      play('error');
    }
  };

  /** Opens (or starts) a private conversation with a member. */
  async function startDM(username: string) {
    const s = social ?? (await getSocial());
    const me = useAccount.getState().account;
    if (!s || !me) return;
    const name = username.trim().replace(/^@/, '').toLowerCase();
    if (name === me.username) return setError('That’s you.');
    const member = await s.findMember(name);
    if (!member) return setError(`There’s no member called ${name}.`);
    setNames((all) => ({ ...all, [member.id]: member.username }));
    setNewChat(null);
    setError(null);
    setRoom(dmRoom(me.id, member.id));
    requestAnimationFrame(() => input.current?.focus());
  }

  const nudge = () => {
    if (!account || !peerName || Date.now() - lastNudge.current < NUDGE_EVERY) return play('error');
    lastNudge.current = Date.now();
    sendSignal('chat-nudge', { to: peerName, from: account.username });
    play('click');
    notify({ title: `You nudged ${peerName}`, body: 'Their Chat window will shake if it’s open.' });
  };

  const onDraft = (value: string) => {
    setDraft(value);
    setPick(0);
    // Tell the room someone's typing (public rooms only: signals reach everyone).
    if (!account || isDM(room) || !value.trim() || Date.now() - lastTyping.current < TYPING_EVERY) return;
    lastTyping.current = Date.now();
    sendSignal('chat-typing', { room, username: account.username });
  };

  // People in this room right now, from presence: members by name, guests counted.
  const here = visitors.filter((v) => v.room === room);
  const hereNames = [...new Set(here.flatMap((v) => (v.username ? [v.username] : [])))];
  const guests = here.filter((v) => !v.username).length;
  const online = new Set(visitors.flatMap((v) => (v.username ? [v.username] : [])));

  // @mention suggestions: people in the conversation and on the desktop.
  const at = /(^|\s)@([a-z0-9_]*)$/i.exec(draft);
  const suggestions = useMemo(() => {
    if (!at) return [];
    const q = at[2].toLowerCase();
    const known = [...new Set([...messages.map((m) => m.username).reverse(), ...online])];
    return known.filter((n) => n !== account?.username && n.startsWith(q)).slice(0, 5);
  }, [at?.[2], messages, visitors, account]);
  const complete = (name: string) => {
    setDraft(draft.replace(/@([a-z0-9_]*)$/i, `@${name} `));
    input.current?.focus();
  };

  const typers = Object.keys(typing);
  const title = peerName ?? `#${current?.name.toLowerCase() ?? room}`;

  useEffect(() => {
    useWindows.getState().setTitle(win.id, isDM(room) ? `Chat with ${peerName ?? '…'}` : `Chat — ${current?.name ?? 'Lobby'}`);
  }, [win.id, room, peerName, current?.name]);

  const roomButton = (id: string, label: React.ReactNode, meta?: React.ReactNode) => (
    <button key={id} type="button" className="os-chat-roomlink" aria-current={id === room || undefined} onClick={() => {
        setRoom(id);
        if (narrow) setSidebar(false);
      }}>
      <span className="os-chat-roomname">{label}</span>
      {meta}
      {/* A dot for rooms with news since the visitor last looked (never-visited rooms stay quiet). */}
      <Unread count={unread[id] ?? 0} dot={id !== room && !!activity[id] && !!readAt[id] && activity[id] > readAt[id]} />
    </button>
  );

  return (
    <div className="os-app os-chat" data-nudged={nudged || undefined}>
      <div className="os-toolbar">
        <button
          type="button"
          className="os-button os-chat-sidebar-toggle"
          aria-pressed={sidebar}
          aria-label={sidebar ? 'Hide rooms' : 'Show rooms'}
          title={sidebar ? 'Hide rooms' : 'Show rooms'}
          onClick={() => setSidebar((s) => !s)}
        >
          <svg viewBox="0 0 16 12" width="14" height="11" aria-hidden="true">
            <rect x="0.75" y="0.75" width="14.5" height="10.5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M5.5 1v10" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
        <div className="os-chat-heading">
          <strong className="os-chat-room">
            {peer && <i className="os-chat-status" data-online={online.has(peerName ?? '') || undefined} aria-hidden="true" />}
            {title}
          </strong>
          <span className="os-toolbar-meta">
            {peer
              ? online.has(peerName ?? '')
                ? 'On the desktop now · private'
                : 'Private conversation'
              : [
                  current?.topic,
                  hereNames.length || guests
                    ? `here: ${[...hereNames, ...(guests ? [`${guests} guest${guests === 1 ? '' : 's'}`] : [])].join(', ')}`
                    : null
                ]
                  .filter(Boolean)
                  .join(' · ')}
          </span>
        </div>
        {peer && (
          <button type="button" className="os-button" onClick={nudge} title="Shake their Chat window">
            👋 Nudge
          </button>
        )}
      </div>

      <div className="os-chat-body">
        {sidebar && (
          <nav className="os-chat-sidebar" aria-label="Conversations">
            <p className="os-chat-sidebar-head">Rooms</p>
            {rooms.map((r) => {
              const count = visitors.filter((v) => v.room === r.id).length;
              return roomButton(
                r.id,
                <># {r.name.toLowerCase()}</>,
                count > 0 ? <span className="os-chat-count" title={`${count} here`}>{count}</span> : null
              );
            })}
            {account && (
              <>
                <p className="os-chat-sidebar-head">Messages</p>
                {dmRooms.map((r) => {
                  const name = names[dmPeer(r, account.id)] ?? '…';
                  return roomButton(
                    r,
                    <>
                      <i className="os-chat-status" data-online={online.has(name) || undefined} aria-hidden="true" />
                      {name}
                    </>
                  );
                })}
                {newChat === null ? (
                  <button type="button" className="os-chat-roomlink os-chat-new" onClick={() => setNewChat('')}>
                    + New Message…
                  </button>
                ) : (
                  <form
                    className="os-chat-newform"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (newChat.trim()) startDM(newChat);
                    }}
                  >
                    <input
                      autoFocus
                      value={newChat}
                      onChange={(e) => setNewChat(e.target.value)}
                      onKeyDown={(e) => e.key === 'Escape' && setNewChat(null)}
                      onBlur={() => !newChat.trim() && setNewChat(null)}
                      placeholder="Username"
                      aria-label="Message a member"
                      list="os-chat-online"
                    />
                    <datalist id="os-chat-online">
                      {[...online].filter((n) => n !== account.username).map((n) => (
                        <option key={n} value={n} />
                      ))}
                    </datalist>
                  </form>
                )}
              </>
            )}
          </nav>
        )}

        <div className="os-chat-main">
          <div
            ref={scroller}
            className="os-chat-log"
            onScroll={(e) => {
              const el = e.currentTarget;
              follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
              if (follow.current) setBelow(0);
            }}
          >
            {load.state === 'loading' && <p className="os-chat-empty">Loading…</p>}
            {load.state === 'offline' && <p className="os-chat-empty">Chat is offline right now.</p>}
            {load.state === 'ready' && !loadingRoom && messages.length === 0 && (
              <p className="os-chat-empty">{peer ? `This is the start of your conversation with ${peerName}.` : 'Nobody’s said anything here yet. Say hello.'}</p>
            )}
            {more && (
              <button type="button" className="os-button os-chat-more" onClick={earlier}>
                Load earlier messages
              </button>
            )}
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const newDay = !prev || day(prev.created_at) !== day(m.created_at);
              // Consecutive messages from one person within a few minutes share a header.
              const grouped = !newDay && prev?.user_id === m.user_id && Date.parse(m.created_at) - Date.parse(prev.created_at) < 5 * 60_000;
              const mine = m.user_id === account?.id;
              const canDM = account && !mine && !isDM(room);
              return (
                <Fragment key={m.id}>
                  {newDay && <p className="os-chat-day">{dayLabel(m.created_at)}</p>}
                  <div
                    className="os-chat-message"
                    data-mine={mine || undefined}
                    data-grouped={grouped || undefined}
                    data-mention={(!mine && account && mentions(m.body, account.username)) || undefined}
                  >
                    {!grouped &&
                      (canDM ? (
                        <button type="button" className="os-chat-avatar-button" title={`Message ${m.username} privately`} onClick={() => startDM(m.username)}>
                          <Avatar name={m.username} />
                        </button>
                      ) : (
                        <Avatar name={m.username} />
                      ))}
                    <div className="os-chat-bubble-wrap">
                      {!grouped && (
                        <p className="os-chat-meta">
                          <strong>{mine ? 'You' : m.username}</strong>
                          <time dateTime={m.created_at}>{clock(m.created_at)}</time>
                        </p>
                      )}
                      <p className="os-chat-bubble" title={clock(m.created_at)} data-emoji={EMOJI_ONLY.test(m.body.trim()) || undefined}>
                        <Body text={m.body} me={account?.username} />
                      </p>
                    </div>
                    {mine && (
                      <button type="button" className="os-chat-delete" onClick={() => remove(m.id)} aria-label="Delete message" title="Delete">
                        ×
                      </button>
                    )}
                  </div>
                </Fragment>
              );
            })}
            {typers.length > 0 && (
              <div className="os-chat-typing" aria-live="polite">
                <span className="os-chat-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                {typers.length === 1 ? `${typers[0]} is typing…` : `${typers.slice(0, 2).join(' and ')}${typers.length > 2 ? ' and others' : ''} are typing…`}
              </div>
            )}
          </div>
          {below > 0 && (
            <button type="button" className="os-chat-below" onClick={toBottom}>
              ↓ {below} new message{below === 1 ? '' : 's'}
            </button>
          )}

          {account ? (
            <form className="os-chat-compose" onSubmit={send}>
              {suggestions.length > 0 && (
                <ul className="os-chat-suggest os-menu-list" role="listbox" aria-label="Mention">
                  {suggestions.map((n, i) => (
                    <li key={n} role="option" aria-selected={i === pick % suggestions.length}>
                      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => complete(n)}>
                        <Avatar name={n} />@{n}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <input
                ref={input}
                value={draft}
                onChange={(e) => onDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (!suggestions.length) return;
                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    setPick((p) => (p + (e.key === 'ArrowDown' ? 1 : suggestions.length - 1)) % suggestions.length);
                  } else if (e.key === 'Tab' || e.key === 'Enter') {
                    e.preventDefault();
                    complete(suggestions[pick % suggestions.length]);
                  }
                }}
                placeholder={peer ? `Message ${peerName}` : `Message #${current?.name.toLowerCase() ?? 'lobby'} · @ to mention`}
                maxLength={CHAT_MAX}
                aria-label="Message"
                disabled={!social}
              />
              <button type="submit" className="os-button os-button-primary" disabled={!draft.trim() || !social}>
                Send
              </button>
              {error && <p role="alert">{error}</p>}
            </form>
          ) : (
            <div className="os-chat-compose os-chat-guest">
              <span>Sign in or make an account to join in.</span>
              <button type="button" className="os-button os-button-primary" onClick={() => launch('account', { props: { then: 'chat' } })}>
                Sign In…
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
