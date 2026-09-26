import { useEffect, useState } from 'react';
import { getSocial, REACTIONS, SocialError, type Post, type Reaction, type Social } from '../social/social';
import { useAccount } from '../social/account';
import { loadJSON, saveJSON } from '../core/storage';
import { clockTimeZone, usePlace } from '../ambient/place';
import type { AppProps } from '../core/registry';
import { play } from '../core/sound';

// Soapbox: Jincheng's own notes and rants, sent from Telegram (see
// supabase/functions/soapbox-bot). Visitors read and react: members (signed
// in) pick a reaction and can change it or take it back (click it again);
// anyone else gets one per post, told apart by IP address.

/** Which reaction this browser gave each post while signed out, so the buttons can show it. */
const REACTED_KEY = 'os-soapbox-reacted';

type Filter = 'all' | 'note' | 'rant';
type Load = { state: 'loading' } | { state: 'offline' } | { state: 'ready'; social: Social; posts: Post[] };

const readReacted = () => loadJSON<Record<string, Reaction>>(REACTED_KEY, {});
const saveReacted = (reacted: Record<string, Reaction>) => saveJSON(REACTED_KEY, reacted);

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
  member,
  note,
  onReact
}: {
  post: Post;
  timeZone: string;
  mine: Reaction | undefined;
  /** Signed in: reactions can be changed and taken back. */
  member: boolean;
  /** Why the last reaction didn't go through, if it didn't. */
  note?: string;
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
                aria-pressed={mine === r}
                disabled={!member && Boolean(mine)}
                onClick={() => onReact(r)}
                aria-label={`${r} ${count}`}
                title={member ? (mine === r ? 'Take your reaction back' : mine ? 'Change your reaction' : 'React') : mine ? 'Sign in to change your reaction' : 'React'}
              >
                {r}
                {count > 0 && <b>{count}</b>}
              </button>
            );
          })}
        </span>
      </footer>
      {note && <p className="os-soapbox-refused">{note}</p>}
    </article>
  );
}

export default function Soapbox(_: AppProps) {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [filter, setFilter] = useState<Filter>('all');
  const { account } = useAccount();
  /** Signed out: this browser's own reactions. Signed in: the member's, from the server. */
  const [reacted, setReacted] = useState(readReacted);
  const [notes, setNotes] = useState<Record<string, string>>({});
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

  // A member's own reactions follow them to any device.
  const social = load.state === 'ready' ? load.social : null;
  useEffect(() => {
    if (!social) return;
    if (!account) return setReacted(readReacted());
    social.myReactions().then(setReacted, () => {});
  }, [social, account]);

  /** Adds `by` to a post's count of `reaction` on screen. */
  const bump = (postId: string, reaction: Reaction, by: number) =>
    setLoad((l) =>
      l.state !== 'ready'
        ? l
        : {
            ...l,
            posts: l.posts.map((p) =>
              p.id === postId ? { ...p, reactions: { ...p.reactions, [reaction]: Math.max(0, (p.reactions[reaction] ?? 0) + by) } } : p
            )
          }
    );

  const react = async (post: Post, reaction: Reaction) => {
    if (load.state !== 'ready') return;
    const before = reacted[post.id];
    if (!account && before) return;
    // Clicking your own reaction again takes it back (members only).
    const next = account && before === reaction ? null : reaction;
    const update = (value: Reaction | null) => {
      setReacted((all) => {
        const { [post.id]: _old, ...rest } = all;
        const result = value ? { ...rest, [post.id]: value } : rest;
        if (!account) saveReacted(result);
        return result;
      });
    };
    // Show it straight away; undo if the server says no.
    if (before) bump(post.id, before, -1);
    if (next) bump(post.id, next, 1);
    update(next);
    setNotes(({ [post.id]: _gone, ...rest }) => rest);
    play(next ? 'pop' : 'click');
    try {
      await load.social.react(post.id, next);
    } catch (error) {
      if (next) bump(post.id, next, -1);
      if (before) bump(post.id, before, 1);
      const already = error instanceof SocialError && error.reason === 'already';
      update(before ?? null);
      setNotes((all) => ({
        ...all,
        [post.id]: already
          ? 'Someone on your network already reacted to this one. Sign in to pick your own.'
          : 'That didn’t go through. Try again in a moment.'
      }));
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
          <PostCard
            key={post.id}
            post={post}
            timeZone={timeZone}
            mine={reacted[post.id]}
            member={Boolean(account)}
            note={notes[post.id]}
            onReact={(r) => react(post, r)}
          />
        ))}
      </div>
    </div>
  );
}
