import { useEffect, useState } from 'react';
import { AlreadyPostedError, getSocial, REACTIONS, type Post, type Reaction, type Social } from '../social';
import { clockTimeZone, usePlace } from '../place';
import type { AppProps } from '../registry';
import { play } from '../sound';

// Soapbox: Jincheng's own notes and rants, sent from Telegram (see
// supabase/functions/soapbox-bot). Visitors read, and leave one reaction
// per post.

/** Which reaction this browser gave each post, so the buttons can show it. */
const REACTED_KEY = 'os-soapbox-reacted';

type Filter = 'all' | 'note' | 'rant';
type Load = { state: 'loading' } | { state: 'offline' } | { state: 'ready'; social: Social; posts: Post[] };

function readReacted(): Record<string, Reaction> {
  try {
    return JSON.parse(localStorage.getItem(REACTED_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function saveReacted(reacted: Record<string, Reaction>) {
  try {
    localStorage.setItem(REACTED_KEY, JSON.stringify(reacted));
  } catch {}
}

/** Links in a post become clickable; everything else stays plain text. */
function Linked({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 ? (
          <a key={i} href={part} target="_blank" rel="noreferrer noopener">
            {part.replace(/^https?:\/\//, '')}
          </a>
        ) : (
          part
        )
      )}
    </>
  );
}

function PostCard({
  post,
  timeZone,
  mine,
  onReact
}: {
  post: Post;
  timeZone: string;
  mine: Reaction | undefined;
  onReact: (reaction: Reaction) => void;
}) {
  const when = new Date(post.created_at);
  return (
    <article className="os-soapbox-post" data-kind={post.kind}>
      <header>
        <span className="os-soapbox-kind">{post.kind === 'rant' ? '🔥 Rant' : '📝 Note'}</span>
        <time dateTime={post.created_at} title={when.toLocaleString('en-US', { timeZone })}>
          {when.toLocaleDateString('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' })} ·{' '}
          {when.toLocaleTimeString('en-US', { timeZone, hour: 'numeric', minute: '2-digit' })}
        </time>
      </header>
      <p className="os-soapbox-body">
        <Linked text={post.body} />
      </p>
      <footer>
        {(post.place || post.weather) && (
          <span className="os-soapbox-where">
            {post.place && <>📍 {post.place}</>}
            {post.place && post.weather && ' · '}
            {post.weather}
          </span>
        )}
        <span className="os-soapbox-reactions" role="group" aria-label="Reactions">
          {REACTIONS.map((r) => {
            const count = post.reactions[r] ?? 0;
            return (
              <button
                key={r}
                type="button"
                data-mine={mine === r || undefined}
                disabled={Boolean(mine)}
                onClick={() => onReact(r)}
                aria-label={`${r} ${count}`}
                title={mine ? 'You’ve reacted to this one' : 'React'}
              >
                {r}
                {count > 0 && <b>{count}</b>}
              </button>
            );
          })}
        </span>
      </footer>
    </article>
  );
}

export default function Soapbox(_: AppProps) {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [filter, setFilter] = useState<Filter>('all');
  const [reacted, setReacted] = useState(readReacted);
  const timeZone = clockTimeZone(usePlace());

  useEffect(() => {
    let cancelled = false;
    getSocial()
      .then(async (social) => {
        if (!social) return setLoad({ state: 'offline' });
        const posts = await social.listPosts();
        if (!cancelled) setLoad({ state: 'ready', social, posts });
      })
      .catch((error) => {
        console.warn(`[soapbox] ${error}`);
        if (!cancelled) setLoad({ state: 'offline' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const react = async (post: Post, reaction: Reaction) => {
    if (load.state !== 'ready' || reacted[post.id]) return;
    const bump = (by: number) =>
      setLoad((l) =>
        l.state !== 'ready'
          ? l
          : {
              ...l,
              posts: l.posts.map((p) =>
                p.id === post.id ? { ...p, reactions: { ...p.reactions, [reaction]: (p.reactions[reaction] ?? 0) + by } } : p
              )
            }
      );
    const next = { ...reacted, [post.id]: reaction };
    setReacted(next);
    saveReacted(next);
    bump(1);
    play('pop');
    try {
      await load.social.react(post.id, reaction);
    } catch (error) {
      // Already reacted from this address (another browser): keep the lock, drop the count.
      bump(-1);
      if (!(error instanceof AlreadyPostedError)) {
        const { [post.id]: _undo, ...rest } = next;
        setReacted(rest);
        saveReacted(rest);
      }
    }
  };

  const posts = load.state === 'ready' ? load.posts.filter((p) => filter === 'all' || p.kind === filter) : [];
  const total = load.state === 'ready' ? load.posts.length : 0;

  return (
    <div className="os-app os-soapbox">
      <div className="os-toolbar">
        <div className="os-segmented" role="group" aria-label="Show">
          {(['all', 'note', 'rant'] as const).map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f === 'note' ? 'Notes' : 'Rants'}
            </button>
          ))}
        </div>
        <span className="os-toolbar-meta">{load.state === 'ready' ? `${total} post${total === 1 ? '' : 's'} · straight from Jincheng’s phone` : ''}</span>
      </div>
      <div className="os-scroll os-soapbox-feed">
        {load.state === 'loading' && <p className="os-soapbox-empty">Loading…</p>}
        {load.state === 'offline' && <p className="os-soapbox-empty">The Soapbox is offline right now.</p>}
        {load.state === 'ready' && posts.length === 0 && (
          <p className="os-soapbox-empty">{total === 0 ? 'Nothing on the Soapbox yet.' : 'Nothing here with this filter.'}</p>
        )}
        {posts.map((post) => (
          <PostCard key={post.id} post={post} timeZone={timeZone} mine={reacted[post.id]} onReact={(r) => react(post, r)} />
        ))}
      </div>
    </div>
  );
}
