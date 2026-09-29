import { useEffect, useRef } from 'react';
import type { IconComponent } from '../core/icons';

// An app's alert, as Tiger drew one: the app's icon on the left, what
// happened beside it, and OK (with Cancel, and perhaps a third choice,
// when there's a choice). It sits over the app's window, which it keeps
// the keys of: Return is the default button, Escape cancels (or is OK when
// that's all there is). Its styles are alert.css, which an app's own
// stylesheet imports; only apps that load later use it, so it isn't in
// the first load.

export function Alert({
  Icon,
  message,
  detail,
  confirm = 'OK',
  onConfirm,
  onCancel,
  other
}: {
  Icon: IconComponent;
  message: string;
  detail?: string;
  confirm?: string;
  onConfirm: () => void;
  /** Offers Cancel beside the default button. */
  onCancel?: () => void;
  /** A third choice, on the left, as "Don't Save" was. */
  other?: { label: string; action: () => void };
}) {
  const ok = useRef<HTMLButtonElement>(null);
  const latest = useRef({ onConfirm, onCancel });
  latest.current = { onConfirm, onCancel };

  useEffect(() => {
    ok.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      const { onConfirm: confirmed, onCancel: cancelled } = latest.current;
      if (e.key === 'Enter') confirmed();
      else (cancelled ?? confirmed)();
    };
    // Before Finder's own keys, which would open or look at what's selected.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  return (
    <div className="os-alert-layer">
      <div className="os-alert" role="alertdialog" aria-modal="true" aria-label={message}>
        <Icon size={64} />
        <div>
          <p>{message}</p>
          {detail && <p className="os-alert-detail">{detail}</p>}
          <div className="os-alert-buttons">
            {other && (
              <button type="button" className="os-button os-alert-other" onClick={other.action}>
                {other.label}
              </button>
            )}
            {onCancel && (
              <button type="button" className="os-button" onClick={onCancel}>
                Cancel
              </button>
            )}
            <button ref={ok} type="button" className="os-button os-button-primary" onClick={onConfirm}>
              {confirm}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
