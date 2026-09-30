import { useEffect, useRef, useState } from 'react';
import { AboutIcon } from '../../core/icons';
import { launch } from '../../core/registry';
import { useWindows } from '../../core/store';
import type { WindowState } from '../../core/types';
import {
  draftOf,
  dropDraft,
  homeNow,
  keepDraft,
  latest,
  newName,
  readHome,
  saveDocument,
  useHome,
  type HomeDocument,
  type HomeFolder
} from '../../home/home';
import { Alert } from '../../shell/Alert';
import { SocialError } from '../../social/types';
import { SaveAsSheet } from './SaveAsSheet';
import { useAutosave } from '../../core/useAutosave';
import { useFileMenu } from './useFileMenu';

// One of Jincheng's documents in TextEdit: the page, which the owner
// writes on and anyone else may only read (a document in Public). A new
// one (File › New) is saved as "Untitled.txt" in Documents once something
// is typed; Save As renames it or moves it to another folder.

type Problem =
  /** A save from an older copy: the document was saved somewhere else since. */
  | { kind: 'conflict' }
  /** Thrown away somewhere else while it was open here. */
  | { kind: 'gone'; doc: HomeDocument }
  | { kind: 'failed'; message: string };

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function DocumentPage({ win, owner }: { win: WindowState; owner: boolean }) {
  const home = useHome();
  // A new document goes into this folder once something is typed; TextEdit opened by itself starts one in Documents.
  const newIn = (win.props?.new as HomeFolder | undefined) ?? (win.props?.doc ? undefined : 'documents');
  const [id, setId] = useState<string | undefined>(win.props?.doc);
  const doc = id ? home.documents.find((d) => d.id === id) : undefined;
  const draftKey = `doc:${id ?? `new:${win.id}`}`;
  // What's on the page; null until the document is here. A new document's
  // draft (typed, and the tab closed before it was saved) is on it from the start.
  const [text, setText] = useState<string | null>(() => (id ? null : (draftOf(`doc:new:${win.id}`)?.body ?? '')));
  const [dirty, setDirty] = useState(!id && !!text);
  // The home folder has been read for this window: a document not in it now can't be opened.
  const [checked, setChecked] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [savingAs, setSavingAs] = useState(false);
  // For saves, which run later: the id, what's typed and the version it was typed over.
  const idNow = useRef(id);
  const typed = useRef(text);
  const base = useRef<number | undefined>(undefined);
  // Keep the last known copy, to say what was thrown away and to save it again.
  const known = useRef<HomeDocument | undefined>(doc);
  useEffect(() => {
    if (doc) known.current = doc;
  }, [doc]);

  useEffect(() => {
    let live = true;
    void readHome(owner).then(() => live && setChecked(true));
    return () => {
      live = false;
    };
  }, [owner]);

  // The document, once it's here. Something typed and not saved (a draft) wins, and is saved again (below).
  useEffect(() => {
    if (!doc || text !== null) return;
    const draft = draftOf(`doc:${doc.id}`);
    const body = draft?.body ?? doc.body;
    typed.current = body;
    base.current = draft ? draft.version : doc.version;
    setText(body);
    setDirty(!!draft && draft.body !== doc.body);
  }, [doc, text]);

  // Saved somewhere else while nothing is typed here: the page shows the newer copy.
  useEffect(() => {
    if (!doc || text === null || dirty || base.current === doc.version) return;
    base.current = doc.version;
    typed.current = doc.body;
    setText(doc.body);
  }, [doc, text, dirty]);

  // The caret on the page as it opens, as TextEdit's was, for the owner to type straight away.
  const page = useRef<HTMLTextAreaElement>(null);
  const ready = text !== null;
  useEffect(() => {
    if (ready && owner && useWindows.getState().order.at(-1) === win.id) page.current?.focus();
  }, [ready, owner, win.id]);

  const name = doc?.name ?? known.current?.name ?? (newIn ? 'Untitled' : 'TextEdit');
  useEffect(() => {
    useWindows.getState().setTitle(win.id, name);
  }, [win.id, name]);

  const saver = useAutosave(async () => {
    const body = typed.current;
    if (body === null || !owner) return;
    try {
      if (!idNow.current) {
        if (!body.trim() || !newIn) return;
        const made = await saveDocument({ folder: newIn, name: newName(homeNow().documents, newIn), body });
        idNow.current = made.id;
        base.current = made.version;
        dropDraft(`doc:new:${win.id}`);
        setId(made.id);
        // The window holds this document from now on, after a reload too.
        launch('textedit', { key: win.id, props: { doc: made.id } });
      } else {
        const current = homeNow().documents.find((d) => d.id === idNow.current) ?? known.current;
        if (!current) return;
        const saved = await saveDocument({ id: current.id, version: base.current, folder: current.folder, name: current.name, body });
        base.current = saved.version;
      }
      if (typed.current === body) {
        setDirty(false);
        dropDraft(`doc:${idNow.current}`);
      }
    } catch (error) {
      if (error instanceof SocialError && error.reason === 'conflict') {
        await latest(owner);
        const newer = homeNow().documents.find((d) => d.id === idNow.current);
        setProblem(newer ? { kind: 'conflict' } : known.current ? { kind: 'gone', doc: known.current } : { kind: 'failed', message: messageOf(error) });
      } else {
        setProblem({ kind: 'failed', message: messageOf(error) });
      }
    }
  });

  // A draft from before (a closed tab, a dropped connection) is saved again,
  // once, as the page opens: from the version it was typed over, so one from
  // an older copy meets the conflict alert rather than the newer save.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || text === null) return;
    opened.current = true;
    if (dirty) saver.soon();
  }, [text, dirty, saver]);

  const type = (value: string) => {
    typed.current = value;
    setText(value);
    setDirty(true);
    keepDraft(draftKey, { body: value, version: base.current ?? 0 });
    saver.soon();
  };

  useFileMenu(win, owner, {
    save: () => void saver.now(),
    saveAs: idNow.current ? () => setSavingAs(true) : undefined
  });

  /** Takes the copy saved somewhere else, and lets go of what's typed here. */
  const revert = () => {
    const newer = homeNow().documents.find((d) => d.id === idNow.current);
    setProblem(null);
    if (!newer) return;
    saver.cancel();
    typed.current = newer.body;
    base.current = newer.version;
    setText(newer.body);
    setDirty(false);
    dropDraft(`doc:${newer.id}`);
  };

  // Not this reader's to see (the owner signed out while it was open): the page goes at once.
  const hidden = !owner && !!idNow.current && !doc;
  if (text === null || hidden) {
    return (
      <div className="os-app os-textedit">
        {(checked || hidden) && !doc && (
          <div className="os-textedit-missing">
            <p>This document can’t be opened.</p>
            <p>It may have been thrown away, or it may be one of Jincheng’s own.</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="os-app os-textedit">
      <textarea
        ref={page}
        className="os-scroll os-textedit-page"
        value={text}
        readOnly={!owner}
        spellCheck={owner}
        aria-label={name}
        placeholder={owner && newIn && !idNow.current ? 'Start typing: it’s saved in Documents as you go.' : undefined}
        onChange={(e) => type(e.target.value)}
      />
      {dirty && owner && <span className="os-textedit-status">Edited</span>}
      {problem?.kind === 'conflict' && (
        <Alert
          Icon={AboutIcon}
          message={`The document “${name}” was changed somewhere else since you opened it.`}
          detail="Revert to see that copy, or save this one over it."
          other={{ label: 'Revert', action: revert }}
          onCancel={() => setProblem(null)}
          confirm="Save Anyway"
          onConfirm={() => {
            const newer = homeNow().documents.find((d) => d.id === idNow.current);
            if (newer) base.current = newer.version;
            setProblem(null);
            void saver.now();
          }}
        />
      )}
      {problem?.kind === 'gone' && (
        <Alert
          Icon={AboutIcon}
          message={`The document “${problem.doc.name}” was thrown away somewhere else.`}
          detail="Save it again to keep what’s here."
          onCancel={() => setProblem(null)}
          confirm="Save Again"
          onConfirm={() => {
            const { folder, name: named } = problem.doc;
            setProblem(null);
            void saveDocument({ folder, name: named, body: typed.current ?? '' })
              .then((made) => {
                idNow.current = made.id;
                base.current = made.version;
                setId(made.id);
                setDirty(false);
                dropDraft(`doc:${problem.doc.id}`);
                launch('textedit', { key: win.id, props: { doc: made.id } });
              })
              .catch((error) => setProblem({ kind: 'failed', message: messageOf(error) }));
          }}
        />
      )}
      {problem?.kind === 'failed' && (
        <Alert
          Icon={AboutIcon}
          message={`The document “${name}” couldn’t be saved.`}
          detail={`${problem.message} What you typed is kept in this browser until it is.`}
          onCancel={() => setProblem(null)}
          confirm="Try Again"
          onConfirm={() => {
            setProblem(null);
            void saver.now();
          }}
        />
      )}
      {savingAs && doc && (
        <SaveAsSheet
          doc={doc}
          onCancel={() => setSavingAs(false)}
          onSave={async (folder, named) => {
            const saved = await saveDocument({ id: doc.id, version: base.current, folder, name: named, body: typed.current ?? doc.body });
            base.current = saved.version;
            setSavingAs(false);
            if (typed.current === saved.body) {
              setDirty(false);
              dropDraft(`doc:${doc.id}`);
            }
          }}
        />
      )}
    </div>
  );
}
