import { useEffect, useRef, useState } from 'react';
import { HOME_FOLDERS, type HomeDocument, type HomeFolder } from '../../home/home';

// TextEdit's Save As sheet, hanging from the top of the window as Tiger's
// did: the name (its extension left unselected) and Where, one of the
// home's folders. Documents are saved as they're typed, so here Save As
// renames the document or moves it; to Public, for everyone to read.

const FOLDERS = HOME_FOLDERS.filter((f): f is { key: HomeFolder; name: string } => f.key !== 'sites');

export function SaveAsSheet({
  doc,
  onCancel,
  onSave
}: {
  doc: HomeDocument;
  onCancel: () => void;
  onSave: (folder: HomeFolder, name: string) => Promise<void>;
}) {
  const [name, setName] = useState(doc.name);
  const [folder, setFolder] = useState<HomeFolder>(doc.folder);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.focus();
    const dot = el.value.lastIndexOf('.');
    el.setSelectionRange(0, dot > 0 ? dot : el.value.length);
  }, []);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await onSave(folder, name.trim());
    } catch (error) {
      setBusy(false);
      setProblem(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="os-textedit-sheet-layer">
      <form
        className="os-textedit-sheet"
        aria-label="Save As"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          e.preventDefault();
          e.stopPropagation();
          onCancel();
        }}
      >
        <label>
          <span>Save As:</span>
          <input ref={field} value={name} maxLength={80} spellCheck={false} autoComplete="off" onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          <span>Where:</span>
          <select value={folder} onChange={(e) => setFolder(e.target.value as HomeFolder)}>
            {FOLDERS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <p className="os-textedit-sheet-note" role={problem ? 'alert' : undefined} data-problem={problem ? true : undefined}>
          {problem ?? (folder === 'public' ? 'Anyone who comes by can read what’s in Public.' : 'Only you can open it.')}
        </p>
        <div className="os-textedit-sheet-buttons">
          <button type="button" className="os-button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="os-button os-button-primary" disabled={busy || !name.trim()}>
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
