// Macintosh HD: a read-only file system made from the site's content, for
// Finder. Nothing here is real storage; every file opens an app.

import type { ComponentType } from 'react';
import { applicationApps, apps, launch, rectOf } from './registry';
import {
  ApplicationsFolderIcon,
  AppletsFolderIcon,
  DocumentIcon,
  DocumentsFolderIcon,
  FolderIcon,
  IPodIcon,
  MusicFolderIcon,
  PhotosIcon
} from './icons';
import type { AppId, OSData } from './types';
import { ALBUMS, SONGS, coverOf, tracksOf } from '../media/library';
import { useMusic } from '../media/music';

export interface FileNode {
  /** Absolute path, e.g. "/Applications/Photos". */
  path: string;
  name: string;
  /** What Finder's list view shows in the Kind column. */
  kind: string;
  Icon: ComponentType<{ size?: number }>;
  /** A picture to show instead of the icon (photos, project covers). */
  thumb?: string;
  /** ISO date for the Date Modified column. */
  date?: string;
  /** Folders list their contents; everything else opens. */
  children?: FileNode[];
  open?: (el: Element | null) => void;
  /** What Quick Look shows besides the name and kind: a picture and a line or two. */
  look?: { image?: string; lines?: string[] };
}


const appFile = (dir: string, app: AppId, kind = 'Application'): FileNode => ({
  path: `${dir}/${apps[app].name}`,
  name: apps[app].name,
  kind,
  Icon: apps[app].Icon,
  open: (el) => launch(app, { origin: rectOf(el) })
});

const byName = (a: FileNode, b: FileNode) => a.name.localeCompare(b.name);

/** The whole disk, rebuilt when the content or the installed applets change. */
export function buildDisk(data: OSData, applets: AppId[]): FileNode {
  // Numbered like a camera's files, oldest first.
  const oldestFirst = [...data.photos].sort((a, b) => a.taken.localeCompare(b.taken));
  const photos: FileNode[] = data.photos.map((p) => {
    const number = String(oldestFirst.indexOf(p) + 1).padStart(4, '0');
    return {
      path: `/Pictures/${p.id}`,
      name: `IMG_${number}.jpg`,
      kind: 'JPEG image',
      Icon: PhotosIcon,
      thumb: p.thumb,
      date: p.taken,
      look: { image: p.full, lines: [p.alt] },
      open: (el) => launch('photos', { origin: rectOf(el), props: { photo: p.id } })
    };
  });

  const projects: FileNode[] = data.projects.map((p) => ({
    path: `/Projects/${p.slug}`,
    name: p.title,
    kind: p.status === 'wip' ? 'Project · in progress' : 'Project',
    Icon: apps.project.Icon,
    thumb: p.cover,
    look: { image: p.cover, lines: [p.description, p.stack.join(' · ')] },
    open: (el) =>
      launch('project', { key: `project:${p.slug}`, title: p.title, origin: rectOf(el), props: { slug: p.slug } })
  }));

  const song = (dir: string, index: number, queue: number[]): FileNode => {
    const s = SONGS[index];
    const name = s.track ? `${String(s.track).padStart(2, '0')} ${s.title}` : `${s.artist} - ${s.title}`;
    return {
      path: `${dir}/${s.id}`,
      name: `${name}.m4a`,
      kind: 'MPEG-4 audio',
      Icon: IPodIcon,
      thumb: coverOf(s),
      look: { image: coverOf(s), lines: [s.title, [s.artist, s.album].filter(Boolean).join(' — ')] },
      open: (el) => {
        useMusic.getState().play('ipod', index, queue);
        launch('ipod', { origin: rectOf(el) });
      }
    };
  };
  const albums: FileNode[] = ALBUMS.map((a) => {
    const tracks = tracksOf(a);
    return {
      path: `/Music/${encodeURIComponent(a.title)}`,
      name: a.title,
      kind: 'Album',
      Icon: MusicFolderIcon,
      thumb: a.cover,
      date: `${a.year}-01-01`,
      look: { image: a.cover, lines: [`${a.artist} · ${a.year}`, ...(a.note ? [a.note] : [])] },
      children: tracks.map((i) => song(`/Music/${encodeURIComponent(a.title)}`, i, tracks))
    };
  });
  const singles = SONGS.flatMap((s, i) => (ALBUMS.some((a) => a.title === s.album) ? [] : [i]));
  const music: FileNode[] = [...albums, ...singles.map((i) => song('/Music', i, singles))];

  const documents: FileNode[] = [
    { ...appFile('/Documents', 'about', 'Plain text'), name: 'About Me.txt', Icon: apps.about.Icon },
    { ...appFile('/Documents', 'resume', 'Pages document'), name: 'Résumé.pages', Icon: DocumentIcon }
  ];

  const folder = (name: string, Icon: FileNode['Icon'], children: FileNode[]): FileNode => ({
    path: `/${name}`,
    name,
    kind: 'Folder',
    Icon,
    children
  });

  return {
    path: '/',
    name: 'Macintosh HD',
    kind: 'Volume',
    Icon: FolderIcon,
    children: [
      folder('Applications', ApplicationsFolderIcon, applicationApps.map((a) => appFile('/Applications', a)).sort(byName)),
      folder('Applets', AppletsFolderIcon, applets.filter((a) => a in apps).map((a) => appFile('/Applets', a, 'Applet')).sort(byName)),
      folder('Documents', DocumentsFolderIcon, documents),
      folder('Music', MusicFolderIcon, music),
      folder('Pictures', PhotosIcon, photos),
      folder('Projects', FolderIcon, projects)
    ]
  };
}

/** The node at a path, or null. */
export function find(root: FileNode, path: string): FileNode | null {
  if (path === '/' || path === '') return root;
  let node: FileNode | undefined = root;
  for (const part of path.split('/').filter(Boolean)) {
    node = node?.children?.find((c) => c.path.split('/').pop() === part || c.name === part);
    if (!node) return null;
  }
  return node ?? null;
}
