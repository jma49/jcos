import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { AppProps } from '../core/registry';
import { launch } from '../core/registry';
import { useWindows } from '../core/store';
import { play } from '../core/sound';
import { CHAT_MAX, getSocial, SocialError, type ChatMessage, type Social } from '../social/social';
import { useAccount } from '../social/account';

// Chat: one room for everyone on JM/OS, in the manner of iChat. Anyone can
// read along; members (signed in) can talk. Messages are kept for good and
// arrive live. A member can take back their own messages.

type Load = { state: 'loading' } | { state: 'offline' } | { state: 'ready'; social: Social };

/** A steady colour per username, for the little avatar. */
function hue(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

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

export default function Chat(_: AppProps) {
  const { account } = useAccount();
  const here = useWindows((s) => s.visitors?.length ?? 0);
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [more, setMore] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  /** Whether the view should follow new messages: it was at the bottom. */
  const follow = useRef(true);

  useEffect(() => {
    let live = true;
    let stop: (() => void) | undefined;
    getSocial()
      .then(async (social) => {
        if (!social) return live && setLoad({ state: 'offline' });
        const first = await social.listChat();
        if (!live) return;
        setMessages(first);
        setMore(first.length >= 100);
        setLoad({ state: 'ready', social });
        stop = social.watchChat({
          onMessage: (m) => {
            setMessages((all) => (all.some((x) => x.id === m.id) ? all : [...all, m]));
            if (m.user_id !== social.account()?.id) play('pop');
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

  // New messages keep the view at the bottom, unless the reader scrolled up.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && follow.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const earlier = async () => {
    if (load.state !== 'ready' || !messages.length) return;
    const el = scroller.current;
    const from = el ? el.scrollHeight - el.scrollTop : 0;
    const older = await load.social.listChat(messages[0].created_at);
    setMore(older.length >= 100);
    follow.current = false;
    setMessages((all) => [...older, ...all]);
    // Keep the reader's place once the older messages are above it.
    requestAnimationFrame(() => el && (el.scrollTop = el.scrollHeight - from));
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (load.state !== 'ready' || !text) return;
    setError(null);
    follow.current = true;
    setDraft('');
    try {
      await load.social.sendChat(text);
    } catch (err) {
      setDraft(text);
      setError(err instanceof SocialError ? err.message : 'Couldn’t send that. Try again.');
      play('error');
    }
  };

  const remove = async (id: string) => {
    if (load.state !== 'ready') return;
    try {
      await load.social.deleteChat(id);
      setMessages((all) => all.filter((m) => m.id !== id));
    } catch {
      play('error');
    }
  };

  return (
    <div className="os-app os-chat">
      <div className="os-toolbar">
        <strong className="os-chat-room">Lobby</strong>
        <span className="os-toolbar-meta">
          {here > 0 ? `${here} on the desktop now · ` : ''}
          {account ? `You’re ${account.username}` : 'Reading as a guest'}
        </span>
      </div>

      <div
        ref={scroller}
        className="os-chat-log"
        onScroll={(e) => {
          const el = e.currentTarget;
          follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
      >
        {load.state === 'loading' && <p className="os-chat-empty">Loading…</p>}
        {load.state === 'offline' && <p className="os-chat-empty">Chat is offline right now.</p>}
        {load.state === 'ready' && messages.length === 0 && <p className="os-chat-empty">Nobody’s said anything yet. Say hello.</p>}
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
          return (
            <Fragment key={m.id}>
              {newDay && <p className="os-chat-day">{dayLabel(m.created_at)}</p>}
              <div className="os-chat-message" data-mine={mine || undefined} data-grouped={grouped || undefined}>
                {!grouped && (
                  <span className="os-chat-avatar" style={{ '--hue': hue(m.username) } as React.CSSProperties} aria-hidden="true">
                    {m.username[0]?.toUpperCase()}
                  </span>
                )}
                <div className="os-chat-bubble-wrap">
                  {!grouped && (
                    <p className="os-chat-meta">
                      <strong>{mine ? 'You' : m.username}</strong>
                      <time dateTime={m.created_at}>{clock(m.created_at)}</time>
                    </p>
                  )}
                  <p className="os-chat-bubble" title={clock(m.created_at)}>
                    {m.body}
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
      </div>

      {account ? (
        <form className="os-chat-compose" onSubmit={send}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Message the Lobby"
            maxLength={CHAT_MAX}
            aria-label="Message"
            disabled={load.state !== 'ready'}
          />
          <button type="submit" className="os-button os-button-primary" disabled={!draft.trim() || load.state !== 'ready'}>
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
  );
}
