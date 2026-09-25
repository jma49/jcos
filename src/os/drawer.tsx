import { createContext, useContext, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Drawers, as in Mac OS X: a panel that slides out from under a window's
// right edge and moves with it. Each window provides a slot (Window.tsx);
// an app renders <Drawer> anywhere in its tree and it appears there.

export const DrawerSlot = createContext<HTMLElement | null>(null);

export function Drawer({ open, label, width = 240, children }: { open: boolean; label: string; width?: number; children: ReactNode }) {
  const slot = useContext(DrawerSlot);
  if (!slot) return null;
  return createPortal(
    <aside
      className="os-drawer"
      data-open={open || undefined}
      aria-label={label}
      aria-hidden={!open}
      inert={!open}
      style={{ '--drawer-width': `${width}px` } as CSSProperties}
    >
      <div className="os-drawer-inner">{children}</div>
    </aside>,
    slot
  );
}
