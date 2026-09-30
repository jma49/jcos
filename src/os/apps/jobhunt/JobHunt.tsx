import { useEffect, useMemo, useRef, useState } from 'react';
import { apps, type AppProps } from '../../core/registry';
import { loadJSON, saveJSON } from '../../core/storage';
import { isPhone, useFocusedId, useWindows } from '../../core/store';
import { Alert } from '../../shell/Alert';
import { Drawer } from '../../shell/drawer';
import { JOB_STAGES, type JobStage } from '../../social/jobs';
import { useOwnerAnswer } from '../../social/owner';
import { Board, StubBoard } from './Board';
import { Info } from './Info';
import { addJob, allOf, changeJob, columns, deleteJob, eventsBy, inPlay, matches, shortDay, today, useHuntRefresh, useJobHunt, type JobApplication, type JobDraft, type JobTotals } from './jobs';
import { ListView, type ListSort } from './ListView';
import { Capacity, Funnel, STAGE_NAMES } from './parts';

// Job Hunt: every company Jincheng has applied to, on a board of stages in
// iCal's brushed metal, or in a list, with an info drawer for one. What
// Mail said comes in through Claude (scripts/job-hunt-import.mjs); here
// Jincheng moves them along, adds one by hand, notes and deletes. Anyone
// else sees only how many are at each stage, on blank cards, and how far
// they got: Jincheng decided the companies stay Jincheng's.

const VIEW_KEY = 'os-jobhunt-view';
type View = 'board' | 'list';

/** "18 applications · 6 in play". */
const heading = (t: JobTotals) => `${allOf(t)} application${allOf(t) === 1 ? '' : 's'} · ${inPlay(t)} in play`;

/** The stage a phone shows first: the first with something in it. */
const firstShown = (t: JobTotals): JobStage => JOB_STAGES.find((s) => t.stages[s] > 0) ?? 'applied';

/** On a phone, one stage at a time, picked here. */
function Chips({ totals, current, onPick }: { totals: JobTotals; current: JobStage; onPick: (stage: JobStage) => void }) {
  return (
    <div className="os-jh-chips" role="group" aria-label="Stage">
      {JOB_STAGES.map((s) => (
        <button key={s} type="button" className="os-jh-chip" data-stage={s} aria-pressed={s === current} onClick={() => onPick(s)}>
          <i aria-hidden="true" />
          {STAGE_NAMES[s]} <b>{totals.stages[s]}</b>
        </button>
      ))}
    </div>
  );
}

export default function JobHunt({ win }: AppProps) {
  const { owner, known } = useOwnerAnswer();
  const hunt = useJobHunt();
  useHuntRefresh(owner, known);
  const [phoneStage, setPhoneStage] = useState<JobStage | null>(null);
  const current = phoneStage ?? firstShown(hunt.totals);

  if (!known) return <div className="os-app os-jh" aria-busy="true" />;
  if (!owner) return <Totals totals={hunt.totals} current={current} onPick={setPhoneStage} />;
  return <Mine win={win} current={current} onPick={setPhoneStage} />;
}

/** What anyone but Jincheng sees: the numbers, never a company. */
function Totals({ totals, current, onPick }: { totals: JobTotals; current: JobStage; onPick: (stage: JobStage) => void }) {
  return (
    <div className="os-app os-jh" data-visitor>
      <div className="os-jh-frame">
        <div className="os-jh-top">
          <div />
          <h2>{heading(totals)}</h2>
          <div className="os-jh-top-end">{totals.updated && <span className="os-jh-quiet">Updated {shortDay(totals.updated)}</span>}</div>
        </div>
        <Chips totals={totals} current={current} onPick={onPick} />
        <div className="os-jh-body">
          <aside className="os-jh-pane os-jh-side" aria-label="Stages">
            <h3>Stages</h3>
            <ul className="os-jh-checks">
              {JOB_STAGES.map((s) => (
                <li key={s} data-stage={s}>
                  <span className="os-jh-swatch" />
                  {STAGE_NAMES[s]}
                  <span className="os-jh-count">{totals.stages[s]}</span>
                </li>
              ))}
            </ul>
            <Funnel totals={totals} />
          </aside>
          <section className="os-jh-pane os-jh-main" aria-label="Board">
            <StubBoard totals={totals} shown={[...JOB_STAGES]} current={current} />
            <p className="os-jh-private">Only Jincheng sees which companies.</p>
          </section>
        </div>
        <div className="os-jh-bottom">
          <Capacity totals={totals} />
        </div>
      </div>
    </div>
  );
}

/** Jincheng's own: the board or the list, the drawer, and the means to change them. */
function Mine({ win, current, onPick }: { win: AppProps['win']; current: JobStage; onPick: (stage: JobStage) => void }) {
  const hunt = useJobHunt();
  const [view, setView] = useState<View>(() => (loadJSON<string>(VIEW_KEY, 'board') === 'list' ? 'list' : 'board'));
  const [sort, setSort] = useState<ListSort>('applied');
  const [query, setQuery] = useState('');
  const [hidden, setHidden] = useState<JobStage[]>([]);
  const [offSources, setOffSources] = useState<string[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [info, setInfo] = useState(false);
  const [deleting, setDeleting] = useState<JobApplication | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const phone = isPhone();
  const front = useFocusedId() === win.id;

  const by = useMemo(() => eventsBy(hunt.events), [hunt.events]);
  const sourceOf = (a: JobApplication) => a.source || 'Other';
  const sources = useMemo(() => [...new Set(hunt.applications.map(sourceOf))].sort((a, b) => (a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b))), [hunt.applications]);
  const visible = hunt.applications.filter((a) => matches(a, query) && !offSources.includes(sourceOf(a)));
  const cols = columns(visible, by);
  const shown = JOB_STAGES.filter((s) => !hidden.includes(s));
  const picked = hunt.applications.find((a) => a.id === chosen) ?? null;

  const say = (error: unknown) => setNote(error instanceof Error ? error.message : String(error));
  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(null), 6000);
    return () => clearTimeout(timer);
  }, [note]);

  const choose = (id: string | null) => setChosen(id);
  const open = (id: string) => {
    setChosen(id);
    setInfo(true);
  };
  const move = (id: string, stage: JobStage) => {
    const app = hunt.applications.find((a) => a.id === id);
    if (!app || app.stage === stage) return;
    setChosen(id);
    void changeJob(app, { stage, outcome: stage === 'closed' ? (app.outcome ?? 'rejected') : null }).catch(say);
  };
  const change = (app: JobApplication) => (patch: Partial<JobDraft>) => void changeJob(app, patch).catch(say);
  const showView = (next: View) => {
    setView(next);
    saveJSON(VIEW_KEY, next);
  };

  /** A new application, named so as not to meet another, chosen with its drawer open to fill in. */
  const newApplication = async () => {
    const taken = new Set(hunt.applications.filter((a) => !a.role).map((a) => a.company.toLowerCase()));
    let company = 'New Company';
    for (let n = 2; taken.has(company.toLowerCase()); n++) company = `New Company ${n}`;
    try {
      const made = await addJob({ company, role: '', stage: 'applied', outcome: null, appliedOn: today(), source: '', location: '', posting: '', notes: '' });
      setQuery('');
      setHidden((h) => h.filter((s) => s !== 'applied'));
      onPick('applied');
      open(made.id);
    } catch (error) {
      say(error);
    }
  };
  const remove = (app: JobApplication) => {
    setDeleting(null);
    if (chosen === app.id) setChosen(null);
    void deleteJob(app.id).catch(say);
  };

  // The menu bar's File and View while Job Hunt is in front, and the keys.
  const commands = useRef({ newApplication, showView, picked, info });
  useEffect(() => {
    commands.current = { newApplication, showView, picked, info };
  });
  useEffect(() => {
    const { setMenus, close } = useWindows.getState();
    const run = (act: (c: typeof commands.current) => void) => () => act(commands.current);
    setMenus(win.id, {
      File: [
        { label: 'New Application', shortcut: '⌥N', action: run((c) => void c.newApplication()) },
        { label: '', divider: true },
        { label: 'Close Window', shortcut: '⌥W', action: () => close(win.id) }
      ],
      View: [
        { label: 'as Board', shortcut: '⌥1', action: run((c) => c.showView('board')) },
        { label: 'as List', shortcut: '⌥2', action: run((c) => c.showView('list')) },
        { label: '', divider: true },
        { label: 'Show or Hide Info', shortcut: '⌥I', action: () => setInfo((i) => !i) }
      ]
    });
    return () => setMenus(win.id, undefined);
  }, [win.id]);

  useEffect(() => {
    if (!front) return;
    const onKey = (e: KeyboardEvent) => {
      if (useWindows.getState().exposeOpen) return;
      const c = commands.current;
      // e.code: ⌥ changes e.key on a Mac.
      if (e.altKey && !e.metaKey && !e.ctrlKey) {
        const act = { KeyN: () => void c.newApplication(), KeyI: () => setInfo((i) => !i), Digit1: () => c.showView('board'), Digit2: () => c.showView('list') }[e.code];
        if (act) {
          e.preventDefault();
          act();
        }
        return;
      }
      if (e.metaKey || e.ctrlKey || (e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return;
      if (e.key === 'Escape' && c.info) setInfo(false);
      else if ((e.key === 'Delete' || e.key === 'Backspace') && c.picked) {
        e.preventDefault();
        setDeleting(c.picked);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [front]);

  const details = picked ? (
    <Info key={picked.id} app={picked} events={by.get(picked.id) ?? []} onChange={change(picked)} onDelete={() => setDeleting(picked)} />
  ) : (
    <p className="os-jh-quiet">Choose an application to see it here.</p>
  );

  return (
    <div className="os-app os-jh">
      <div className="os-jh-frame">
        <div className="os-jh-top">
          <div>
            <div className="os-segmented" role="group" aria-label="View">
              <button type="button" aria-pressed={view === 'board'} onClick={() => showView('board')} title="As Board (⌥1)">
                Board
              </button>
              <button type="button" aria-pressed={view === 'list'} onClick={() => showView('list')} title="As List (⌥2)">
                List
              </button>
            </div>
          </div>
          <h2>{heading(hunt.totals)}</h2>
          <div className="os-jh-top-end">
            <label className="os-search-field">
              <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
                <circle cx="6.8" cy="6.8" r="4.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <path d="M10.4 10.4L14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <input
                type="search"
                placeholder="Company or role"
                aria-label="Search applications"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    setQuery('');
                  }
                }}
              />
            </label>
          </div>
        </div>
        {view === 'board' && <Chips totals={hunt.totals} current={current} onPick={onPick} />}
        <div className="os-jh-body">
          <aside className="os-jh-pane os-jh-side" aria-label="Stages and sources">
            <h3>Stages</h3>
            <ul className="os-jh-checks">
              {JOB_STAGES.map((s) => (
                <li key={s} data-stage={s}>
                  <label>
                    <input type="checkbox" checked={!hidden.includes(s)} onChange={() => setHidden((h) => (h.includes(s) ? h.filter((x) => x !== s) : [...h, s]))} />
                    <span className="os-jh-swatch" />
                    {STAGE_NAMES[s]}
                    <span className="os-jh-count">{hunt.totals.stages[s]}</span>
                  </label>
                </li>
              ))}
            </ul>
            {sources.length > 0 && (
              <>
                <h3>Sources</h3>
                <ul className="os-jh-checks">
                  {sources.map((src) => (
                    <li key={src}>
                      <label>
                        <input type="checkbox" checked={!offSources.includes(src)} onChange={() => setOffSources((o) => (o.includes(src) ? o.filter((x) => x !== src) : [...o, src]))} />
                        {src}
                        <span className="os-jh-count">{hunt.applications.filter((a) => sourceOf(a) === src).length}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <Funnel totals={hunt.totals} />
          </aside>
          <section className="os-jh-pane os-jh-main" aria-label={view === 'board' ? 'Board' : 'List'}>
            {phone && info && picked ? (
              <div className="os-jh-phone-info">
                <button type="button" className="os-button" onClick={() => setInfo(false)}>
                  ‹ Back
                </button>
                {details}
              </div>
            ) : view === 'board' ? (
              <Board columns={cols} shown={shown} current={current} by={by} selected={chosen} onSelect={choose} onOpen={open} onMove={move} />
            ) : (
              <ListView apps={visible} by={by} sort={sort} onSort={setSort} selected={chosen} onSelect={choose} onOpen={open} />
            )}
            {hunt.loaded && hunt.applications.length === 0 && (
              <p className="os-jh-empty">Nothing here yet. Ask Claude to sync with Mail, or add one with +.</p>
            )}
          </section>
        </div>
        <div className="os-jh-bottom">
          {note && (
            <p className="os-jh-note" role="status">
              {note}
            </p>
          )}
          <Capacity totals={hunt.totals} />
          <button type="button" className="os-button" aria-label="New Application" title="New Application (⌥N)" onClick={() => void newApplication()}>
            +
          </button>
          <button type="button" className="os-button" aria-pressed={info} onClick={() => setInfo((i) => !i)} title="Show or hide the info drawer (⌥I)">
            i
          </button>
        </div>
      </div>

      {!phone && (
        <Drawer open={info} label="Info" width={250}>
          {details}
        </Drawer>
      )}

      {deleting && (
        <Alert
          Icon={apps.jobhunt.Icon}
          message={`Are you sure you want to delete “${deleting.company}”${deleting.role ? `, ${deleting.role}` : ''}?`}
          detail="What Mail said about it goes too. You can’t undo this action."
          confirm="Delete"
          onCancel={() => setDeleting(null)}
          onConfirm={() => remove(deleting)}
        />
      )}
    </div>
  );
}
