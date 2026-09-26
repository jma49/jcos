import { launch } from '../core/registry';
import { useWindows } from '../core/store';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';

/** The menu a right-click on the empty desktop opens. */
export function DesktopMenu({ at, onClose }: { at: { x: number; y: number }; onClose: () => void }) {
  const custom = useWindows((s) => s.wallpaper);
  const arranged = useWindows((s) => s.iconPositions !== null);
  const s = useWindows.getState();
  const items: ContextMenuItem[] = [
    { label: 'Change Desktop Background…', action: () => launch('preferences', { props: { pane: 'desktop' } }) },
    { label: 'Use Default Desktop Picture', disabled: !custom, action: () => s.setWallpaper(null) },
    { label: 'Clean Up Icons', disabled: !arranged, action: () => s.setIconPositions(null) },
    { divider: true, label: '' },
    { label: 'Exposé', shortcut: 'F9', action: () => s.setExpose(true) },
    { label: 'Start Screen Saver', action: () => s.setScreensaver(true) }
  ];

  return <ContextMenu at={at} items={items} onClose={onClose} label="Desktop" />;
}
