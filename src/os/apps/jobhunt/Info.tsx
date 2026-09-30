import { useEffect, useState } from 'react';
import { JOB_OUTCOMES, JOB_STAGES, type JobDraft } from '../../social/jobs';
import { shortDay, type JobApplication, type JobEvent } from './jobs';
import { gmailLink, KIND_NAMES, KIND_STAGES, Monogram, OUTCOME_NAMES, STAGE_NAMES } from './parts';

// The info drawer, as iCal's: one application, to rename, move along,
// date and note, with what Mail said about it, each message a way back to
// Gmail. Text is kept as it's left (or with Return); the rest as it's
// changed.

/** A line of text kept when it's left or on Return, and taken back with Escape. */
function Field({ label, value, onKeep, type = 'text', most, required = false }: { label: string; value: string; onKeep: (value: string) => void; type?: string; most: number; required?: boolean }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const keep = () => {
    const kept = text.replace(/\s+/g, ' ').trim();
    if (required && !kept) return setText(value);
    if (kept !== value) onKeep(kept);
    else setText(value);
  };
  return (
    <label>
      <span>{label}</span>
      <input
        type={type}
        value={text}
        maxLength={most}
        onChange={(e) => setText(e.target.value)}
        onBlur={keep}
        onKeyDown={(e) => {
          if (e.key === 'Enter') keep();
          else if (e.key === 'Escape') {
            e.stopPropagation();
            setText(value);
          }
        }}
      />
    </label>
  );
}

export function Info({
  app,
  events,
  onChange,
  onDelete
}: {
  app: JobApplication;
  events: JobEvent[];
  onChange: (change: Partial<JobDraft>) => void;
  onDelete: () => void;
}) {
  const [notes, setNotes] = useState(app.notes);
  useEffect(() => setNotes(app.notes), [app.id, app.notes]);
  return (
    <div className="os-jh-info" data-stage={app.stage}>
      <div className="os-jh-info-head">
        <Monogram company={app.company} size={40} />
        <div>
          <h4>{app.company}</h4>
          {app.role && <p>{app.role}</p>}
        </div>
      </div>

      <div className="os-jh-fields">
        <Field label="company" value={app.company} most={120} required onKeep={(company) => onChange({ company })} />
        <Field label="role" value={app.role} most={160} onKeep={(role) => onChange({ role })} />
        <label>
          <span>stage</span>
          <select value={app.stage} onChange={(e) => onChange({ stage: e.target.value as JobApplication['stage'], outcome: e.target.value === 'closed' ? (app.outcome ?? 'rejected') : null })}>
            {JOB_STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_NAMES[s]}
              </option>
            ))}
          </select>
        </label>
        {app.stage === 'closed' && (
          <label>
            <span>why</span>
            <select value={app.outcome ?? 'rejected'} onChange={(e) => onChange({ outcome: e.target.value as JobApplication['outcome'] })}>
              {JOB_OUTCOMES.map((o) => (
                <option key={o} value={o}>
                  {OUTCOME_NAMES[o]}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          <span>applied</span>
          <input type="date" value={app.appliedOn} min="2000-01-01" max="2100-12-31" onChange={(e) => e.target.value && onChange({ appliedOn: e.target.value })} />
        </label>
        <Field label="source" value={app.source} most={40} onKeep={(source) => onChange({ source })} />
        <Field label="where" value={app.location} most={80} onKeep={(location) => onChange({ location })} />
        <Field label="posting" type="url" value={app.posting} most={500} onKeep={(posting) => onChange({ posting })} />
      </div>
      {/^https?:\/\//.test(app.posting) && (
        <a className="os-jh-link" href={app.posting} target="_blank" rel="noopener noreferrer">
          Open the posting ↗
        </a>
      )}

      <h5>From Mail</h5>
      {events.length ? (
        <ol className="os-jh-timeline">
          {events.map((e) => (
            <li key={e.id} data-stage={KIND_STAGES[e.kind]}>
              <time dateTime={e.at}>{shortDay(e.at)}</time>
              <div>
                <b>
                  <i aria-hidden="true" />
                  {KIND_NAMES[e.kind]}
                </b>
                {e.subject && <span>“{e.subject}”</span>}
                {e.thread && (
                  <a href={gmailLink(e.thread)} target="_blank" rel="noopener noreferrer">
                    Open in Gmail ↗
                  </a>
                )}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="os-jh-quiet">Nothing from Mail yet.</p>
      )}

      <h5>Notes</h5>
      <textarea
        className="os-jh-notes"
        aria-label="Notes"
        value={notes}
        maxLength={4000}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => notes !== app.notes && onChange({ notes })}
      />
      <button type="button" className="os-button" onClick={onDelete}>
        Delete Application
      </button>
    </div>
  );
}
