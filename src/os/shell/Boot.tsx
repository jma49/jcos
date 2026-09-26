import { useEffect } from 'react';
import { motion } from 'motion/react';

/** The grey boot screen, once per session. */
export function Boot({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 1500);
    return () => clearTimeout(timer);
  }, [onDone]);
  return (
    <motion.div className="os-boot" exit={{ opacity: 0 }} transition={{ duration: 0.45 }}>
      <motion.div
        className="os-boot-mark"
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        JM
      </motion.div>
      <div className="os-boot-bar">
        <motion.span initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 1.2, ease: [0.65, 0, 0.35, 1] }} />
      </div>
    </motion.div>
  );
}

/** With reduced motion: no boot screen at all. */
export function BootSkip({ onDone }: { onDone: () => void }) {
  useEffect(onDone, [onDone]);
  return null;
}
