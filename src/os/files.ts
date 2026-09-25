// Macintosh HD: a read-only file system made from the site's content, for
// Finder. Nothing here is real storage; every file opens an app.

import type { ComponentType } from 'react';
import { apps, launch, rectOf } from './registry';
import {
  ApplicationsFolderIcon,
  AppletsFolderIcon,
  DocumentIcon,
  DocumentsFolderIcon,
  FolderIcon,
  PhotosIcon
} from './icons';
import type { AppId, OSData } from './types';

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
}

/** Apps in /Applications, alphabetically. */
const APPLICATIONS: AppId[] = ['appstore', 'ipod', 'karaoke', 'photos', 'preferences', 'soapbox', 'stickies', 'terminal', 'browser'];

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
      open: (el) => launch('photos', { origin: rectOf(el), props: { photo: p.id } })
    };
  });

  const projects: FileNode[] = data.projects.map((p) => ({
    path: `/Projects/${p.slug}`,
    name: p.title,
    kind: p.status === 'wip' ? 'Project · in progress' : 'Project',
    Icon: apps.project.Icon,
    thumb: p.cover,
    open: (el) =>
      launch('project', { key: `project:${p.slug}`, title: p.title, origin: rectOf(el), props: { slug: p.slug } })
  }));

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
      folder('Applications', ApplicationsFolderIcon, APPLICATIONS.map((a) => appFile('/Applications', a)).sort(byName)),
      folder('Applets', AppletsFolderIcon, applets.filter((a) => a in apps).map((a) => appFile('/Applets', a, 'Applet')).sort(byName)),
      folder('Documents', DocumentsFolderIcon, documents),
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
