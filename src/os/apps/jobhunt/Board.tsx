import { useState } from 'react';
import type { JobStage } from '../../social/jobs';
import { shortDay, waiting, type JobApplication, type JobEvent, type JobTotals } from './jobs';
import { KIND_NAMES, Monogram, OUTCOME_NAMES, STAGE_NAMES } from './parts';

// The board: a column to a stage, headed as iCal heads its days, with a
// card to an application. Jincheng drags a card to another column when
// something happens that Mail didn't say (a call, a word from a friend).

/** What an application's card carries across a drag. */
const JOB_MIME = 'application/x-jmos-job';

/** The card's last line: what was heard last and when, or how long it has waited; and the day it was applied for. */
function meta(app: JobApplication, events: JobEvent[]) {
  const late = waiting(app, events);
  const last = [...events].reverse().find((e) => e.kind !== 'applied');
  if (app.stage === 'closed') return { news: `${app.outcome ? OUTCOME_NAMES[app.outcome] : 'Closed'}${last ? ` ${shortDay(last.at)}` : ''}`, late: null };
  if (last) return { news: `${KIND_NAMES[last.kind]} ${shortDay(last.at)}`, late: null };
  return { news: app.source || 'Applied', late };
}

export function Card({
  app,
  events,
  selected,
  onSelect,
  onOpen
}: {
  app: JobApplication;
  events: JobEvent[];
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const { news, late } = meta(app, events);
  return (
    <button
      type="button"
      className="os-jh-card"
      data-stage={app.stage}
      data-selected={selected || undefined}
      aria-pressed={selected}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(JOB_MIME, app.id);
        e.dataTransfer.setData('text/plain', app.company);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={onSelect}
      onDoubleClick={onOpen}
    >
      <span className="os-jh-card-head">
        <Monogram company={app.company} />
        <strong>{app.company}</strong>
      </span>
      {app.role && <span className="os-jh-role">{app.role}</span>}
      <span className="os-jh-meta">
        <span className={app.source && news === app.source ? undefined : 'os-jh-news'}>{news}</span>
        <span className={late ? 'os-jh-late' : undefined}>{late ? `${late} days` : shortDay(app.appliedOn)}</span>
      </span>
    </button>
  );
}

export function Board({
  columns,
  shown,
  current,
  by,
  selected,
  onSelect,
  onOpen,
  onMove
}: {
  columns: Record<JobStage, JobApplication[]>;
  /** The stages shown, in order. */
  shown: JobStage[];
  /** The one a phone shows. */
  current: JobStage;
  by: Map<string, JobEvent[]>;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onOpen: (id: string) => void;
  onMove: (id: string, stage: JobStage) => void;
}) {
  const [over, setOver] = useState<JobStage | null>(null);
  return (
    <div className="os-jh-cols" style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }}>
      {shown.map((stage) => (
        <section
          key={stage}
          className="os-jh-col"
          data-stage={stage}
          data-current={stage === current || undefined}
          data-over={over === stage || undefined}
          aria-label={STAGE_NAMES[stage]}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes(JOB_MIME)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setOver(stage);
          }}
          onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(null)}
          onDrop={(e) => {
            setOver(null);
            const id = e.dataTransfer.getData(JOB_MIME);
            if (!id) return;
            e.preventDefault();
            onMove(id, stage);
          }}
        >
          <h3 className="os-jh-col-head">
            <i aria-hidden="true" />
            {STAGE_NAMES[stage]}
            <b>{columns[stage].length}</b>
          </h3>
          <div className="os-jh-col-cards" onPointerDown={(e) => e.target === e.currentTarget && onSelect(null)}>
            {columns[stage].map((app) => (
              <Card
                key={app.id}
                app={app}
                events={by.get(app.id) ?? []}
                selected={selected === app.id}
                onSelect={() => onSelect(app.id)}
                onOpen={() => onOpen(app.id)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Most blank cards a visitor's column shows before it just says how many more. */
const STUBS = 12;

/** What a visitor sees: the columns and how many are in each, on blank cards that name nothing. */
export function StubBoard({ totals, shown, current }: { totals: JobTotals; shown: JobStage[]; current: JobStage }) {
  return (
    <div className="os-jh-cols" style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }}>
      {shown.map((stage) => {
        const n = totals.stages[stage];
        return (
          <section
            key={stage}
            className="os-jh-col"
            data-stage={stage}
            data-current={stage === current || undefined}
            aria-label={`${STAGE_NAMES[stage]}: ${n}`}
          >
            <h3 className="os-jh-col-head">
              <i aria-hidden="true" />
              {STAGE_NAMES[stage]}
              <b>{n}</b>
            </h3>
            <div className="os-jh-col-cards" aria-hidden="true">
              {Array.from({ length: Math.min(n, STUBS) }, (_, i) => (
                <span key={i} className="os-jh-stub" data-stage={stage} />
              ))}
              {n > STUBS && <span className="os-jh-more">and {n - STUBS} more</span>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
