import type { FileNode } from './disk';
import { DocumentIcon, DocumentsFolderIcon, FolderIcon, MusicFolderIcon, PhotosIcon, pngIcon, type IconComponent } from '../core/icons';
import { launch, rectOf } from '../core/registry';
import type { OSProject } from '../core/types';
import { MoviesFolderIcon } from '../media/discArt';
import { diaryYears, HOME_FOLDERS, type DiaryEntry, type HomeDocument } from './documents';

// Users › jincheng: Jincheng's home folder, with the folders a Mac's home
// has. To anyone else every folder but Public and Sites is locked, with
// the "no access" badge Mac OS X put on another user's, and opening one
// says so. Signed in as the owner, they open and hold Jincheng's
// documents, which open in TextEdit, and in Documents the diary, a year
// to a document. Public holds what Jincheng lets everyone read; Sites,
// Jincheng's sites, as Internet locations. What's in the folders comes
// from the database (home/home.ts), so this loads with Finder (and Time
// Machine, which shows it as it was), not with the desktop.

export const HOME = '/Users/jincheng';

/** The home's own icon: a house, with FileVault's lock on it. */
export const HomeIcon = pngIcon('home');
const FOLDER_ICONS: Record<string, IconComponent> = {
  desktop: pngIcon('desktop'),
  documents: DocumentsFolderIcon,
  downloads: FolderIcon,
  library: FolderIcon,
  movies: MoviesFolderIcon,
  music: MusicFolderIcon,
  pictures: PhotosIcon,
  public: pngIcon('public-folder'),
  sites: pngIcon('sites')
};
const WeblocIcon = pngIcon('webloc');

/** A document's first lines, for Quick Look. */
const opening = (body: string) =>
  body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((line) => (line.length > 120 ? `${line.slice(0, 119)}…` : line));

const kindOf = (name: string) => (/\.rtf$/i.test(name) ? 'Rich text document' : 'Plain text document');

function documentNode(dir: string, doc: HomeDocument, trash?: (doc: HomeDocument) => void): FileNode {
  return {
    path: `${dir}/${doc.id}`,
    name: doc.name,
    kind: kindOf(doc.name),
    Icon: DocumentIcon,
    date: doc.updated,
    look: { lines: opening(doc.body) },
    open: (el) => launch('textedit', { key: `textedit:${doc.id}`, title: doc.name, origin: rectOf(el), props: { doc: doc.id } }),
    ...(trash ? { trash: () => trash(doc) } : {}),
    // Another desktop's Finder may not be let in to open it.
    share: false
  };
}

function diaryNode(dir: string, year: number, diary: DiaryEntry[]): FileNode {
  const entries = diary.filter((e) => e.day.startsWith(`${year}-`));
  const last = [...entries].sort((a, b) => b.day.localeCompare(a.day) || b.created.localeCompare(a.created))[0];
  const name = `Diary ${year}.rtf`;
  return {
    path: `${dir}/diary-${year}`,
    name,
    kind: kindOf(name),
    Icon: DocumentIcon,
    date: entries.reduce<string | undefined>((latest, e) => (!latest || e.updated > latest ? e.updated : latest), undefined),
    look: { lines: [`${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`, ...(last ? opening(last.body).slice(0, 1) : [])] },
    open: (el) => launch('textedit', { key: `textedit:diary-${year}`, title: name, origin: rectOf(el), props: { diary: String(year) } }),
    share: false
  };
}

function siteNode(dir: string, project: OSProject & { demo: string }): FileNode {
  return {
    path: `${dir}/${project.slug}`,
    name: project.title,
    kind: 'Web Internet Location',
    Icon: WeblocIcon,
    look: { lines: [project.demo, project.description] },
    open: (el) => launch('browser', { origin: rectOf(el), props: { url: project.demo } })
  };
}

/**
 * The Users folder, with Jincheng's home in it: what `owner` may see of
 * `home` (the database has already left out what anyone else may not),
 * Jincheng's sites from `projects`, and `trash` for the owner's documents.
 */
export function usersFolder(
  home: { documents: HomeDocument[]; diary: DiaryEntry[] },
  owner: boolean,
  projects: OSProject[],
  trash: (doc: HomeDocument) => void
): FileNode {
  const folders: FileNode[] = HOME_FOLDERS.map(({ key, name, open }) => {
    const dir = `${HOME}/${name}`;
    const folder = { path: dir, name, kind: 'Folder', Icon: FOLDER_ICONS[key] };
    if (!owner && !open) return { ...folder, locked: true, children: [] };
    if (key === 'sites') {
      const sites = projects.filter((p): p is OSProject & { demo: string } => !!p.demo);
      return { ...folder, children: sites.map((p) => siteNode(dir, p)) };
    }
    const documents = home.documents.filter((d) => d.folder === key).map((d) => documentNode(dir, d, owner ? trash : undefined));
    const diaries = key === 'documents' && owner ? diaryYears(home.diary).map((year) => diaryNode(dir, year, home.diary)) : [];
    return { ...folder, children: [...diaries, ...documents] };
  });
  return {
    path: '/Users',
    name: 'Users',
    kind: 'Folder',
    Icon: FolderIcon,
    children: [{ path: HOME, name: 'jincheng', kind: 'Folder', Icon: HomeIcon, children: folders }]
  };
}
