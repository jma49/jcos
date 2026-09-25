import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { apps, dockApps, launch } from './registry';
import { useWindows } from './store';
import { useOSData } from './context';

interface Result {
  id: string;
  label: string;
  hint: string;
  Icon: ComponentType<{ size?: number }>;
  run: () => void;
}

/** ⌘K launcher over apps, projects and a few system actions. */
export function Spotlight() {
  const open = useWindows((s) => s.spotlightOpen);
  const setSpotlight = useWindows((s) => s.setSpotlight);
  const data = useOSData();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const all = useMemo<Result[]>(
    () => [
      ...dockApps.map((id) => ({
        id,
        label: apps[id].name,
        hint: 'Application',
        Icon: apps[id].Icon,
        run: () => launch(id)
      })),
      ...data.projects.map((p) => ({
        id: `project:${p.slug}`,
        label: p.title,
        hint: `Project · ${p.description}`,
        Icon: apps.project.Icon,
        run: () => launch('project', { key: `project:${p.slug}`, title: p.title, props: { slug: p.slug } })
      }))
    ],
    [data]
  );

  const q = query.trim().toLowerCase();
  const results = q ? all.filter((r) => `${r.label} ${r.hint}`.toLowerCase().includes(q)) : all.slice(0, 6);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      requestAnimationFrame(() => input.current?.focus());
    }
  }, [open]);

  useEffect(() => setActive(0), [query]);

  const choose = (r?: Result) => {
    if (!r) return;
    setSpotlight(false);
    r.run();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="os-spotlight-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onPointerDown={(e) => e.target === e.currentTarget && setSpotlight(false)}
        >
          <motion.div
            className="os-spotlight"
            role="dialog"
            aria-label="Search"
            initial={{ y: -12, scale: 0.98 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: -8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 500, damping: 34 }}
          >
            <input
              ref={input}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search apps and projects"
              aria-label="Search apps and projects"
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive((a) => Math.min(results.length - 1, a + 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive((a) => Math.max(0, a - 1));
                } else if (e.key === 'Enter') {
                  choose(results[active]);
                } else if (e.key === 'Escape') {
                  setSpotlight(false);
                }
              }}
            />
            {results.length > 0 && (
              <ul role="listbox">
                {results.map((r, i) => (
                  <li key={r.id} role="option" aria-selected={i === active}>
                    <button type="button" onPointerEnter={() => setActive(i)} onClick={() => choose(r)}>
                      <r.Icon size={28} />
                      <span className="os-spotlight-label">{r.label}</span>
                      <span className="os-spotlight-hint">{r.hint}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
