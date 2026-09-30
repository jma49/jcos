import type { AppProps } from '../../core/registry';
import { launch } from '../../core/registry';
import { useOwnerAnswer } from '../../social/owner';
import { DiaryPage } from './DiaryPage';
import { DocumentPage } from './DocumentPage';

// TextEdit, as in Tiger, for Jincheng's home folder (home/home.ts): a
// plain page for one of Jincheng's documents, or a year of the diary.
// What's typed is saved as it's typed; only the owner writes, and anyone
// else may only read a document in Public. File › New (⌥N) starts a new
// document, which goes into the home's Documents.

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
