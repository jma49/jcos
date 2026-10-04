import { useEffect, useRef, useState, type CSSProperties, type SubmitEvent } from 'react';
import { getSocial, NOTE_COLORS, NOTE_MAX, SocialError, type Limits, type Note, type NoteColor, type Social } from '../../social/social';
import { useAccount } from '../../social/account';
import type { AppProps } from '../../core/registry';
import { launch } from '../../core/registry';
import { play } from '../../core/sound';
import { useFocusedId, useWindows } from '../../core/store';
import { ownsKey } from '../../core/useKeys';
import { addSticky, readMine, useMyStickies } from '../../stickies/mine';
import { Yours } from './Yours';

type Load = { state: 'loading' } | { state: 'offline' } | { state: 'ready'; social: Social; notes: Note[] };
type Draft = { state: 'idle' | 'writing' | 'sending' } | { state: 'error'; message: string };

/** A small, stable tilt per note, so the wall looks hand-placed. */
function tilt(id: string) {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return ((hash % 7) - 3) * 0.6;
}

/** A small count in words, as the rest of the copy has them ("three a day"). */
const say = (n: number) => ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] ?? String(n);

/** Everyone's notes (the wall), or the member's own (stickies/mine.ts). */
type View = 'everyone' | 'yours';

/**
 * Mac OS X Stickies, twice over. Everyone's: a guestbook, everyone's notes
 * on a wall, where members (signed in) can put up three a day (the
 * database's limit, which it tells: member_limits()), signed with their
 * username, and take their own down. Yours: each member's own
 * stickies, which only they see, on their own desktop and here. File ›
 * New Sticky (⌥N; the browser keeps ⌘N) puts one up.
 */
export default function Stickies({ win }: AppProps) {
  const { account } = useAccount();
  const [view, setView] = useState<View>(win.props?.view === 'yours' ? 'yours' : 'everyone');
  /** The sticky just put up here, for the caret to go into. */
  const [newest, setNewest] = useState<string | null>(null);
  const [stickyTrouble, setStickyTrouble] = useState<string | null>(null);
  const mine = useMyStickies();
  const newSticky = useRef(async () => {});
  newSticky.current = async () => {
    setView('yours');
    if (!account) return;
    setStickyTrouble(null);
    try {
      // The ones there already first, so the new one goes down and across from them.
      await readMine(account.id);
      const made = await addSticky();
      play('pop');
      setNewest(made.id);
    } catch (error) {
      setStickyTrouble(error instanceof Error ? error.message : 'Couldn’t put one up.');
    }
  };
  const signedIn = !!account;

  // The File menu while Stickies is in front, and ⌥N.
  const front = useFocusedId() === win.id;
  useEffect(() => {
    const { setMenus, close } = useWindows.getState();
    setMenus(win.id, {
      File: [
        { label: 'New Sticky', shortcut: '⌥N', disabled: !signedIn, action: () => void newSticky.current() },
        { label: '', divider: true },
        { label: 'Close Window', shortcut: '⌥W', action: () => close(win.id) }
      ]
    });
    return () => setMenus(win.id, undefined);
  }, [win.id, signedIn]);
  useEffect(() => {
    if (!front || !signedIn) return;
    // e.code: ⌥ changes e.key on a Mac; in a note's text, ⌥N types (core/useKeys.ts).
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.metaKey || e.code !== 'KeyN' || !ownsKey(e)) return;
      e.preventDefault();
      void newSticky.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [front, signedIn]);
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [draft, setDraft] = useState<Draft>({ state: 'idle' });
  /** How many more notes the member can put up today; null until known. */
  const [left, setLeft] = useState<number | null>(null);
  /** The database's limits (notes a day, stickies); null until known, or if it can't say. */
  const [limits, setLimits] = useState<Limits | null>(null);
  const [body, setBody] = useState('');
  const [color, setColor] = useState<NoteColor>('yellow');
  // A field people never see; bots that fill every input give themselves away.
  const [trap, setTrap] = useState('');

  useEffect(() => {
    let cancelled = false;
    getSocial()
      .then(async (social) => {
        if (!social) return setLoad({ state: 'offline' });
        // Together, so the wall's count of what's left shows with it.
        const [notes, known] = await Promise.all([social.listNotes(), social.limits()]);
        if (cancelled) return;
        setLimits(known);
        setLoad({ state: 'ready', social, notes });
      })
      .catch((error) => {
        console.warn(`[stickies] ${error}`);
        if (!cancelled) setLoad({ state: 'offline' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // A member's allowance for today, whenever they sign in or post.
  const social = load.state === 'ready' ? load.social : null;
  useEffect(() => {
    if (!social || !account) return setLeft(null);
    social.notesLeft().then(setLeft, () => setLeft(null));
  }, [social, account]);

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    if (load.state !== 'ready' || !body.trim() || left === 0) return;
    if (trap) return setDraft({ state: 'idle' });
    setDraft({ state: 'sending' });
    try {
      await load.social.postNote({ body: body.trim(), color });
      play('pop');
      setBody('');
      setDraft({ state: 'idle' });
      setLeft(await load.social.notesLeft());
      // Show the new note in its place on the wall.
      setLoad({ ...load, notes: await load.social.listNotes() });
    } catch (error) {
      if (error instanceof SocialError && error.reason === 'limit') setLeft(0);
      setDraft({ state: 'error', message: error instanceof Error ? error.message : 'Couldn’t post the note.' });
    }
  };

  const takeDown = async (note: Note) => {
    if (load.state !== 'ready') return;
    try {
      await load.social.deleteNote(note.id);
      play('trash');
      setLoad({ ...load, notes: load.notes.filter((n) => n.id !== note.id) });
    } catch {
      play('error');
    }
  };

  const writing = draft.state === 'writing' || draft.state === 'sending' || draft.state === 'error';

  const whose = (
    <div className="os-segmented" role="group" aria-label="Whose stickies">
      <button type="button" aria-pressed={view === 'everyone'} onClick={() => setView('everyone')}>
        Everyone’s
      </button>
      <button type="button" aria-pressed={view === 'yours'} onClick={() => setView('yours')}>
        Yours
      </button>
    </div>
  );

  if (view === 'yours') {
    return (
      <div className="os-app os-stickies">
        <div className="os-toolbar">
          {whose}
          {account ? (
            <button type="button" className="os-button" onClick={() => void newSticky.current()} disabled={limits !== null && mine.length >= limits.stickies}>
              New Sticky
            </button>
          ) : null}
          <span className="os-toolbar-meta">
            {stickyTrouble ??
              (account ? `${mine.length}${limits ? ` of ${limits.stickies}` : ''} · only you see these` : 'only you would see them')}
          </span>
        </div>
        <Yours account={account?.id ?? null} newest={newest} />
      </div>
    );
  }

  if (load.state !== 'ready') {
    return (
      <div className="os-app os-stickies">
        <div className="os-toolbar">{whose}</div>
        <div className="os-empty os-stickies-status">
          <p>{load.state === 'loading' ? 'Loading notes…' : 'Stickies are offline right now.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="os-app os-stickies">
      <div className="os-toolbar">
        {whose}
        {account ? (
          <button type="button" className="os-button" onClick={() => setDraft({ state: 'writing' })} disabled={writing || left === 0}>
            New Note
          </button>
        ) : (
          <button type="button" className="os-button" onClick={() => launch('account', { props: { then: 'stickies' } })}>
            Sign In to Leave a Note…
          </button>
        )}
        <span className="os-toolbar-meta">
          {load.notes.length} note{load.notes.length === 1 ? '' : 's'}
          {account && left !== null
            ? left > 0
              ? ` · ${left}${limits ? ` of ${limits.notesPerDay}` : ''} left today`
              : ` · that’s your ${limits ? say(limits.notesPerDay) : 'notes'} for today`
            : ` · members can leave ${limits ? say(limits.notesPerDay) : 'a few'} a day`}
        </span>
      </div>

      <div className="os-scroll os-stickies-wall">
        {writing && (
          <form className="os-sticky os-sticky-draft" data-color={color} onSubmit={submit}>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={NOTE_MAX}
              placeholder="Leave a note on the desktop…"
              aria-label="Note"
              autoFocus
              required
            />
            <p className="os-sticky-signature">— {account?.username}</p>
            <input
              className="os-sticky-trap"
              value={trap}
              onChange={(e) => setTrap(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
            />
            <div className="os-sticky-colors" role="radiogroup" aria-label="Note colour">
              {NOTE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={c === color}
                  aria-label={c}
                  data-color={c}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
            <div className="os-sticky-actions">
              <span>
                {body.length}/{NOTE_MAX}
              </span>
              <button type="button" className="os-button" onClick={() => setDraft({ state: 'idle' })}>
                Cancel
              </button>
              <button
                type="submit"
                className="os-button os-button-primary"
                disabled={draft.state === 'sending' || !body.trim() || left === 0}
              >
                {draft.state === 'sending' ? 'Posting…' : 'Post'}
              </button>
            </div>
            {draft.state === 'error' && <p className="os-sticky-error">{draft.message}</p>}
          </form>
        )}

        {load.notes.map((note) => (
          <article key={note.id} className="os-sticky" data-color={note.color} style={{ '--tilt': `${tilt(note.id)}deg` } as CSSProperties}>
            {account && note.user_id === account.id && (
              <button type="button" className="os-sticky-remove" onClick={() => takeDown(note)} aria-label="Take this note down" title="Take down">
                ×
              </button>
            )}
            <p>{note.body}</p>
            <footer>
              {note.name ? `— ${note.name}` : ''}
              <time dateTime={note.created_at}>
                {new Date(note.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </time>
            </footer>
          </article>
        ))}

        {load.notes.length === 0 && !writing && (
          <p className="os-stickies-empty">No notes yet. Be the first to leave one.</p>
        )}
      </div>
    </div>
  );
}
