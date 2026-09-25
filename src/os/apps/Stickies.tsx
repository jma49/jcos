import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { getSocial, NAME_MAX, NOTE_COLORS, NOTE_MAX, type Note, type NoteColor, type Social } from '../social';
import type { AppProps } from '../registry';

/** One note per visitor per minute, checked in the browser (the database has its own backstop). */
const COOLDOWN_MS = 60_000;
const LAST_POST_KEY = 'os-stickies-last-post';

type Load = { state: 'loading' } | { state: 'offline' } | { state: 'ready'; social: Social; notes: Note[] };
type Draft = { state: 'idle' | 'writing' | 'sending' | 'sent' } | { state: 'error'; message: string };

/** A small, stable tilt per note, so the wall looks hand-placed. */
function tilt(id: string) {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return ((hash % 7) - 3) * 0.6;
}

function lastPost() {
  try {
    return Number(localStorage.getItem(LAST_POST_KEY) ?? 0);
  } catch {
    return 0;
  }
}

/** Mac OS X Stickies as a guestbook: approved notes on a wall, and a blank note to write on. */
export default function Stickies(_: AppProps) {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [draft, setDraft] = useState<Draft>({ state: 'idle' });
  const [body, setBody] = useState('');
  const [name, setName] = useState('');
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

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (load.state !== 'ready' || !body.trim()) return;
    if (trap) return setDraft({ state: 'sent' });
    const wait = lastPost() + COOLDOWN_MS - Date.now();
    if (wait > 0) {
      return setDraft({ state: 'error', message: `One note a minute, please. Try again in ${Math.ceil(wait / 1000)}s.` });
    }
    setDraft({ state: 'sending' });
    try {
      await load.social.postNote({ body: body.trim(), name: name.trim(), color });
      try {
        localStorage.setItem(LAST_POST_KEY, String(Date.now()));
      } catch {}
      setBody('');
      setDraft({ state: 'sent' });
    } catch (error) {
      setDraft({ state: 'error', message: error instanceof Error ? error.message : 'Couldn’t post the note.' });
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
        <button
          type="button"
          className="os-button"
          onClick={() => setDraft({ state: 'writing' })}
          disabled={writing}
        >
          New Note
        </button>
        <span className="os-toolbar-meta">
          {load.notes.length} note{load.notes.length === 1 ? '' : 's'} · notes appear after Jincheng reads them
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
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={NAME_MAX}
              placeholder="Your name (optional)"
              aria-label="Your name"
            />
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
              <button type="submit" className="os-button os-button-primary" disabled={draft.state === 'sending' || !body.trim()}>
                {draft.state === 'sending' ? 'Posting…' : 'Post'}
              </button>
            </div>
            {draft.state === 'error' && <p className="os-sticky-error">{draft.message}</p>}
          </form>
        )}

        {draft.state === 'sent' && (
          <div className="os-sticky os-sticky-thanks" data-color={color}>
            <p>Thanks! Your note will show up here once Jincheng has read it.</p>
          </div>
        )}

        {load.notes.map((note) => (
          <article key={note.id} className="os-sticky" data-color={note.color} style={{ '--tilt': `${tilt(note.id)}deg` } as CSSProperties}>
            <p>{note.body}</p>
            <footer>
              {note.name ? `— ${note.name}` : ''}
              <time dateTime={note.created_at}>
                {new Date(note.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </time>
            </footer>
          </article>
        ))}

        {load.notes.length === 0 && !writing && draft.state !== 'sent' && (
          <p className="os-stickies-empty">No notes yet. Be the first to leave one.</p>
        )}
      </div>
    </div>
  );
}
