import { JOB_STAGES } from '../../social/jobs';
import { lastMoved, shortDay, waiting, type JobApplication, type JobEvent } from './jobs';
import { KIND_NAMES, Monogram, OUTCOME_NAMES, STAGE_NAMES } from './parts';

// Every application in a list, as iTunes lists songs: sorted by a column
// header (the day applied for, newest first, to begin with), striped,
// the chosen one lit.

export type ListSort = 'applied' | 'company' | 'stage' | 'latest';

const SORTS: Record<ListSort, (a: JobApplication, b: JobApplication, by: Map<string, JobEvent[]>) => number> = {
  applied: (a, b) => b.appliedOn.localeCompare(a.appliedOn) || a.company.localeCompare(b.company),
  company: (a, b) => a.company.localeCompare(b.company) || a.role.localeCompare(b.role),
  stage: (a, b) => JOB_STAGES.indexOf(a.stage) - JOB_STAGES.indexOf(b.stage) || b.appliedOn.localeCompare(a.appliedOn),
  latest: (a, b, by) => lastMoved(b, by.get(b.id)).localeCompare(lastMoved(a, by.get(a.id)))
};

/** What the Latest column says: the last thing heard, or how long it has waited, or where it came from. */
function latest(app: JobApplication, events: JobEvent[]) {
  const last = [...events].reverse().find((e) => e.kind !== 'applied');
  if (last) return `${KIND_NAMES[last.kind]} · ${shortDay(last.at)}`;
  const late = waiting(app, events);
  if (late) return `${app.source ? `${app.source} · ` : ''}no word in ${late} days`;
  return app.source || '--';
}

export function ListView({
  apps,
  by,
  sort,
  onSort,
  selected,
  onSelect,
  onOpen
}: {
  apps: JobApplication[];
  by: Map<string, JobEvent[]>;
  sort: ListSort;
  onSort: (sort: ListSort) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onOpen: (id: string) => void;
}) {
  const rows = [...apps].sort((a, b) => SORTS[sort](a, b, by));
  const header = (label: string, key: ListSort) => (
    <span role="columnheader" aria-sort={sort === key ? (key === 'company' || key === 'stage' ? 'ascending' : 'descending') : undefined}>
      <button type="button" onClick={() => onSort(key)} title={`Sort by ${label}`}>
        {label}
        {sort === key && <span aria-hidden="true"> ▾</span>}
      </button>
    </span>
  );
  return (
    <div className="os-jh-list" role="table" aria-label="Applications">
      <div className="os-jh-list-head" role="row">
        {header('Company', 'company')}
        <span role="columnheader">Role</span>
        {header('Applied', 'applied')}
        {header('Stage', 'stage')}
        {header('Latest', 'latest')}
      </div>
      <div className="os-jh-list-rows" onPointerDown={(e) => e.target === e.currentTarget && onSelect(null)}>
        {rows.map((app) => (
          <button
            key={app.id}
            type="button"
            role="row"
            className="os-jh-list-row"
            data-selected={selected === app.id || undefined}
            aria-selected={selected === app.id}
            onClick={() => onSelect(app.id)}
            onDoubleClick={() => onOpen(app.id)}
          >
            <span role="cell" className="os-jh-name">
              <Monogram company={app.company} size={16} />
              {app.company}
            </span>
            <span role="cell">{app.role}</span>
            <span role="cell" className="os-jh-dim">
              {shortDay(app.appliedOn)}
            </span>
            <span role="cell" className="os-jh-stage" data-stage={app.stage}>
              <i aria-hidden="true" />
              {app.stage === 'closed' && app.outcome ? OUTCOME_NAMES[app.outcome] : STAGE_NAMES[app.stage]}
            </span>
            <span role="cell" className="os-jh-dim">
              {latest(app, by.get(app.id) ?? [])}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
