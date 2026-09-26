import { useState } from 'react';
import { useOSData } from '../core/context';
import { launch, rectOf } from '../core/registry';
import type { OSProject } from '../core/types';

const filters = [
  { id: 'all', label: 'All Projects' },
  { id: 'live', label: 'Live' },
  { id: 'wip', label: 'In Progress' }
] as const;

type Filter = (typeof filters)[number]['id'];

export function openProject(p: OSProject, el?: Element | null) {
  launch('project', { key: `project:${p.slug}`, title: p.title, origin: rectOf(el ?? null), props: { slug: p.slug } });
}

export default function Projects() {
  const { projects } = useOSData();
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const shown = projects.filter((p) => filter === 'all' || p.status === filter);

  return (
    <div className="os-app os-finder">
      <aside className="os-sidebar">
        <p className="os-sidebar-heading">Projects</p>
        {filters.map((f) => (
          <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
            <span>{projects.filter((p) => f.id === 'all' || p.status === f.id).length}</span>
          </button>
        ))}
      </aside>

      <div className="os-finder-main">
        <div className="os-toolbar">
          <span className="os-toolbar-meta">
            {shown.length} item{shown.length === 1 ? '' : 's'} · double-click to open
          </span>
        </div>
        <ul className="os-scroll os-finder-grid" onPointerDown={(e) => e.target === e.currentTarget && setSelected(null)}>
          {shown.map((p) => (
            <li key={p.slug}>
              <button
                type="button"
                data-selected={selected === p.slug}
                onClick={(e) => {
                  if ((e.nativeEvent as PointerEvent).pointerType === 'touch') openProject(p, e.currentTarget);
                  else setSelected(p.slug);
                }}
                onDoubleClick={(e) => openProject(p, e.currentTarget)}
                onKeyDown={(e) => e.key === 'Enter' && openProject(p, e.currentTarget)}
              >
                <span className="os-finder-thumb">
                  {p.cover ? <img src={p.cover} alt="" loading="lazy" /> : <span>{p.title}</span>}
                </span>
                <span className="os-finder-name">{p.title}</span>
                <span className="os-finder-meta">{p.status === 'wip' ? 'In progress' : p.when}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
