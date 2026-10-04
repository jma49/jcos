import type { AppProps } from '../../core/registry';
import { launch } from '../../core/registry';
import { useOwnerAnswer } from '../../social/owner';
import { DiaryPage } from './DiaryPage';
import { DocumentPage } from './DocumentPage';

// TextEdit, as in Tiger, for Jincheng's home folder (files/documents.ts): a
// plain page for one of Jincheng's documents, or a year of the diary.
// What's typed is saved as it's typed; only the owner writes, and anyone
// else may only read a document in Public. File › New (⌥N) starts a new
// document, which goes into the home's Documents.
//
// It's in Applications. A document is a white page (DocumentPage.tsx); a
// year of the diary (DiaryPage.tsx) has the days newest first under their
// dates in grey, each entry a paragraph that grows as it's typed, and this
// year's has today at the top and a line to write a new entry on. An
// emptied diary entry is taken out when it's left.
//
// What's typed is saved once the typing rests for a second, at once with
// ⌘S, and when the window closes (core/useAutosave.ts), and kept as a draft
// in the browser until it is, so a closed tab loses nothing: a draft found
// as a page opens (a document's, a new document's, a diary entry's) is
// saved again then, as a sticky's is (#190). A save names the version it
// was typed over, so one from an older copy, a restored draft's included,
// is refused and the alert offers Revert or Save Anyway. A save or a delete
// in one of the owner's tabs reaches the pages open in the others at once
// (the os-home channel, files/documents.ts); a page with unsaved typing keeps it,
// and its next save meets the conflict alert.
//
// File › New is ⌥N (the browser keeps ⌘N); the new document goes into
// Documents as "Untitled.txt" once something is typed. Save As (⇧⌘S,
// SaveAsSheet.tsx) renames it or moves it to another folder, Public
// included. Entries and documents also come from Telegram (the bot's /diary
// and /doc); they show on the next read of the home folder (at most 30 s,
// or when the tab comes back).

export default function TextEdit({ win }: AppProps) {
  const { owner, known } = useOwnerAnswer();
  // Until it's known whose eyes these are, nothing: the owner mustn't see "that's not yours" for a moment.
  if (!known) return <div className="os-app os-textedit" />;
  const year = Number(win.props?.diary);
  if (win.props?.diary && Number.isInteger(year)) return <DiaryPage win={win} year={year} owner={owner} />;
  // Opened by itself (Applications, Spotlight): a new document for the owner, as a Mac would; for anyone else, where to read.
  if (!win.props?.doc && !win.props?.new && !owner) {
    return (
      <div className="os-app os-textedit">
        <div className="os-textedit-missing">
          <p>TextEdit opens Jincheng’s documents.</p>
          <p>Those in Public are anyone’s to read.</p>
          <button type="button" className="os-button" onClick={() => launch('finder', { props: { path: '/Users/jincheng/Public' } })}>
            Show Public
          </button>
        </div>
      </div>
    );
  }
  return <DocumentPage win={win} owner={owner} />;
}
