import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { getSocial, NOTE_COLORS, NOTE_MAX, NOTES_PER_DAY, SocialError, type Note, type NoteColor, type Social } from '../social/social';
import { useAccount } from '../social/account';
import type { AppProps } from '../core/registry';
import { launch } from '../core/registry';
import { play } from '../core/sound';

type Load = { state: 'loading' } | { state: 'offline' } | { state: 'ready'; social: Social; notes: Note[] };
type Draft = { state: 'idle' | 'writing' | 'sending' } | { state: 'error'; message: string };

/** A small, stable tilt per note, so the wall looks hand-placed. */
function tilt(id: string) {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return ((hash % 7) - 3) * 0.6;
}

/**
 * Mac OS X Stickies as a guestbook: everyone's notes on a wall. Members
 * (signed in) can put up three a day, signed with their username, and take
 * their own down.
 */
export default function Stickies(_: AppProps) {
  const { account } = useAccount();
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [draft, setDraft] = useState<Draft>({ state: 'idle' });
  /** How many more notes the member can put up today; null until known. */
  const [left, setLeft] = useState<number | null>(null);
  const [body, setBody] = useState('');
  const [color, setColor] = useState<NoteColor>('yellow');
  // A field people never see; bots that fill every input give themselves away.
  const [trap, setTrap] = useState('');

  useEffect(() => {
    let cancelled = false;
    getSocial()
      .then(async (social) => {
        if (!social) return setLoad({ state: 'offline' });
        const notes = await social.listNotes();
        if (!cancelled) setLoad({ state: 'ready', social, notes });
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

  const submit = async (e: FormEvent) => {
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

  if (load.state === 'loading') {
    return (
      <div className="os-app os-empty">
        <p>Loading notes…</p>
      </div>
    );
  }
  if (load.state === 'offline') {
    return (
      <div className="os-app os-empty">
        <p>Stickies are offline right now.</p>
      </div>
    );
  }

  const writing = draft.state === 'writing' || draft.state === 'sending' || draft.state === 'error';

  return (
    <div className="os-app os-stickies">
      <div className="os-toolbar">
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
              ? ` · ${left} of ${NOTES_PER_DAY} left today`
              : ' · that’s your three for today'
            : ' · members can leave three a day'}
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
