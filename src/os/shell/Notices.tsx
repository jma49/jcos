import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { dismiss, NOTICE_SECONDS, useNotices, type Notice } from '../core/notices';

/** One Growl-style bubble. Without buttons it goes by itself after a few seconds. */
function Bubble({ notice }: { notice: Notice }) {
  const timed = !notice.actions?.length;
  useEffect(() => {
    if (!timed) return;
    const t = setTimeout(() => dismiss(notice.id), NOTICE_SECONDS * 1000);
    return () => clearTimeout(t);
  }, [notice.id, timed]);

  return (
    <motion.div
      layout
      className="os-notice"
      role={timed ? 'status' : 'alertdialog'}
      aria-label={notice.title}
      data-clickable={notice.onClick ? true : undefined}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.3 } }}
      transition={{ duration: 0.2 }}
      onClick={() => {
        if (!notice.onClick) return;
        notice.onClick();
        dismiss(notice.id, true);
      }}
    >
      <button
        type="button"
        className="os-notice-close"
        aria-label="Close"
        onClick={(e) => {
          e.stopPropagation();
          dismiss(notice.id);
        }}
      >
        ×
      </button>
      {notice.icon && <span className="os-notice-icon">{notice.icon}</span>}
      <div className="os-notice-text">
        <strong>{notice.title}</strong>
        {notice.body && <p>{notice.body}</p>}
        {notice.actions && (
          <div className="os-notice-actions">
            {notice.actions.map((a) => (
              <button
                key={a.label}
                type="button"
                className={a.primary ? 'os-button os-button-primary' : 'os-button'}
                onClick={(e) => {
                  e.stopPropagation();
                  dismiss(notice.id, true);
                  a.run();
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

/** The stack of notifications under the menu bar's right end. */
export function Notices() {
  const notices = useNotices((s) => s.notices);
  return (
    <div className="os-notices" aria-live="polite">
      <AnimatePresence initial={false}>
        {notices.map((n) => (
          <Bubble key={n.id} notice={n} />
        ))}
      </AnimatePresence>
    </div>
  );
}
