import { useEffect, useRef } from 'react';
import { launch } from '../../core/registry';
import { useFocusedId, useWindows } from '../../core/store';
import type { WindowState } from '../../core/types';

/** A new document, in its own window; it goes into the home's Documents once something is typed. */
export const newDocument = () => launch('textedit', { key: `textedit:new:${Date.now()}`, title: 'Untitled', props: { new: 'documents' } });

/**
 * TextEdit's File menu while its window is in front (it stands in for the
 * desktop's), and its keys: ⌥N for a new document (the browser keeps ⌘N),
 * ⌘S to save now and ⇧⌘S for Save As. Only the owner writes, so anyone
 * else gets only Open and Close.
 */
export function useFileMenu(win: WindowState, owner: boolean, actions: { save?: () => void; saveAs?: () => void }) {
  const latest = useRef(actions);
  useEffect(() => {
    latest.current = actions;
  });
  const front = useFocusedId() === win.id;
  const canSave = !!actions.save;
  const canSaveAs = !!actions.saveAs;

  useEffect(() => {
    const { setMenus, close } = useWindows.getState();
    setMenus(win.id, {
      File: [
        ...(owner ? [{ label: 'New', shortcut: '⌥N', action: newDocument }] : []),
        { label: 'Open…', action: () => launch('finder', { props: { path: '/Users/jincheng/Documents' } }) },
        { label: '', divider: true },
        { label: 'Close Window', shortcut: '⌥W', action: () => close(win.id) },
        ...(owner
          ? [
              { label: 'Save', shortcut: '⌘S', disabled: !canSave, action: () => latest.current.save?.() },
              { label: 'Save As…', shortcut: '⇧⌘S', disabled: !canSaveAs, action: () => latest.current.saveAs?.() }
            ]
          : [])
      ]
    });
    return () => setMenus(win.id, undefined);
  }, [win.id, owner, canSave, canSaveAs]);

  useEffect(() => {
    if (!front || !owner) return;
    // e.code: ⌥ changes e.key on a Mac.
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && !e.metaKey && e.code === 'KeyN') {
        e.preventDefault();
        newDocument();
      } else if (e.metaKey && e.code === 'KeyS') {
        e.preventDefault();
        if (e.shiftKey) latest.current.saveAs?.();
        else latest.current.save?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [front, owner]);
}
