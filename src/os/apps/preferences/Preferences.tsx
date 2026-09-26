import { useEffect, useRef, useState, type ComponentType } from 'react';
import type { AppProps } from '../../core/registry';
import { useWindows } from '../../core/store';
import { play } from '../../core/sound';
import { AppearancePane, DateTimePane, DesktopPane, DockPane } from './PersonalPanes';
import { AccountsPane, DisplaysPane, SoundPane } from './HardwarePanes';
import { BackupPane, SharingPane, SoftwareUpdatePane } from './NetworkPanes';
import { paneInfo, paneOf, PANES, searchPanes, SECTIONS, type PaneId } from './panes';

// System Preferences, as in Leopard: every pane in rows under Show All,
// back and forward through the panes visited, and a search field that
// lights up the panes it finds. It opens from the Apple menu rather than
// being an app of its own. Everything here is remembered in this browser.

const VIEWS: Record<PaneId, ComponentType> = {
  appearance: AppearancePane,
  desktop: DesktopPane,
  dock: DockPane,
  datetime: DateTimePane,
  displays: DisplaysPane,
  sound: SoundPane,
  accounts: AccountsPane,
  sharing: SharingPane,
  update: SoftwareUpdatePane,
  backup: BackupPane
};

/** 'all' is the Show All grid. */
type View = PaneId | 'all';

interface History {
  views: View[];
  at: number;
}

function ShowAll({ found, searching, onOpen }: { found: PaneId[]; searching: boolean; onOpen: (id: PaneId) => void }) {
  return (
    <div className="os-prefs-all" data-searching={searching || undefined}>
      {SECTIONS.map((section) => (
        <section key={section} className="os-prefs-row-section" aria-label={section}>
          <h3>{section}</h3>
          <ul>
            {PANES.filter((p) => p.section === section).map(({ id, name, Icon }) => (
              <li key={id}>
                <button type="button" data-found={found.includes(id) || undefined} onClick={() => onOpen(id)}>
                  <Icon size={32} />
                  <span>{name}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default function Preferences({ win }: AppProps) {
  const [history, setHistory] = useState<History>(() => ({ views: [paneOf(win.props?.pane) ?? 'all'], at: 0 }));
  const view = history.views[history.at];
  const [query, setQuery] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const found = searchPanes(query);

  const go = (next: View) => {
    if (next === view) return;
    setHistory((h) => ({ views: [...h.views.slice(0, h.at + 1), next], at: h.at + 1 }));
  };
  const open = (id: PaneId) => {
    setQuery('');
    go(id);
  };
  const step = (by: -1 | 1) => setHistory((h) => ({ ...h, at: Math.min(h.views.length - 1, Math.max(0, h.at + by)) }));

  // Opening the window again with a pane (the desktop menu's "Change
  // Desktop Background…", a link) goes to it.
  const [asked, setAsked] = useState(win.props?.pane);
  if (win.props?.pane !== asked) {
    setAsked(win.props?.pane);
    const pane = paneOf(win.props?.pane);
    if (pane && pane !== view) setHistory((h) => ({ views: [...h.views.slice(0, h.at + 1), pane], at: h.at + 1 }));
  }

  // The window is named after the pane that's showing, as on a Mac.
  const title = view === 'all' ? 'System Preferences' : paneInfo(view).name;
  useEffect(() => useWindows.getState().setTitle(win.id, title), [win.id, title]);

  const Pane = view === 'all' ? null : VIEWS[view];
  const searching = query.trim() !== '';

  return (
    <div className="os-app os-prefs">
      <div className="os-toolbar os-prefs-toolbar">
        <div className="os-segmented" role="group" aria-label="Navigate">
          <button type="button" aria-label="Back" title="Back" disabled={history.at === 0} onClick={() => step(-1)}>
            ◀
          </button>
          <button
            type="button"
            aria-label="Forward"
            title="Forward"
            disabled={history.at === history.views.length - 1}
            onClick={() => step(1)}
          >
            ▶
          </button>
        </div>
        <button type="button" className="os-button" disabled={view === 'all'} onClick={() => go('all')}>
          Show All
        </button>
        <div className="os-prefs-find">
          <label className="os-search-field">
            <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
              <circle cx="6.8" cy="6.8" r="4.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M10.4 10.4L14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <input
              ref={search}
              type="search"
              placeholder="Search"
              aria-label="Search preferences"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                // Leopard goes back to Show All to light up what it finds.
                if (e.target.value.trim()) go('all');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && found[0]) {
                  play('click');
                  open(found[0]);
                }
                if (e.key === 'Escape' && query) {
                  e.stopPropagation();
                  setQuery('');
                }
              }}
            />
          </label>
          {searching && (
            <ul className="os-prefs-results os-menu-list" role="listbox" aria-label="Search results">
              {found.length ? (
                found.map((id) => (
                  <li key={id} role="option" aria-selected={id === found[0]}>
                    <button type="button" onClick={() => open(id)}>
                      {paneInfo(id).name}
                    </button>
                  </li>
                ))
              ) : (
                <li className="os-prefs-noresult">No Results</li>
              )}
            </ul>
          )}
        </div>
      </div>
      <div className="os-scroll os-prefs-pane" data-view={view}>
        {Pane ? <Pane /> : <ShowAll found={found} searching={searching} onOpen={open} />}
      </div>
    </div>
  );
}
