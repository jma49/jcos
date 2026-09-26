import { useEffect } from 'react';
import { launch } from '../core/registry';
import { useWindows } from '../core/store';

interface ContextMenuItem {
  label: string;
  shortcut?: string;
  action?: () => void;
  disabled?: boolean;
  divider?: boolean;
}

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', onClose);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('pointerdown', onClose);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  return (
    <ul
      className="os-menu-list os-context-menu"
      role="menu"
      style={{ left: Math.min(at.x, window.innerWidth - 240), top: Math.min(at.y, window.innerHeight - 140) }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {items.map((item, i) =>
        item.divider ? (
          <li key={i} className="os-menu-divider" role="separator" />
        ) : (
          <li key={i} role="none">
            <button
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                onClose();
                item.action?.();
              }}
            >
              <span>{item.label}</span>
              {item.shortcut && <kbd>{item.shortcut}</kbd>}
            </button>
          </li>
        )
      )}
    </ul>
  );
}
