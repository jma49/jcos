import { useState } from 'react';
import { useOSData } from '../context';
import type { AppProps } from '../registry';
import { useWindows, type Appearance } from '../store';
import { choosePlace, clockTimeZone, HOME, placeLabel, usePlace, usesFahrenheit } from '../place';
import { PlaceSearch } from '../PlaceSearch';
import { DriftingClock, SAVER_STYLES, Starfield } from '../Screensaver';
import { play } from '../sound';
import { ACCENTS, cachedAccent, type AccentChoice } from '../accent';

// System Preferences, Tiger style: a toolbar of panes. Everything here is
// remembered in this browser.

type Pane = 'desktop' | 'appearance' | 'sound' | 'location';

const PANES: { id: Pane; name: string; icon: string }[] = [
  { id: 'desktop', name: 'Desktop & Screen Saver', icon: 'desktop-screen-saver' },
  { id: 'appearance', name: 'Appearance', icon: 'appearance-pane' },
  { id: 'sound', name: 'Sound', icon: 'sound' },
  { id: 'location', name: 'Date, Time & Place', icon: 'international' }
];

const IDLE_CHOICES = [
  { minutes: 1, label: '1 minute' },
  { minutes: 2, label: '2 minutes' },
  { minutes: 5, label: '5 minutes' },
  { minutes: 15, label: '15 minutes' },
  { minutes: 0, label: 'Never' }
];

function DesktopPane() {
  const data = useOSData();
  const custom = useWindows((s) => s.wallpaper);
  const saver = useWindows((s) => s.saver);
  const { setWallpaper, setSaver, setScreensaver } = useWindows.getState();
  const pictures = [{ id: 'default', thumb: data.wallpaper, full: null as string | null, alt: 'Stones (default)' }].concat(
    data.photos.map((p) => ({ id: p.id, thumb: p.thumb, full: p.full, alt: p.alt }))
  );
  const blurb = SAVER_STYLES.find((s) => s.style === saver.style)?.blurb;

  return (
    <>
      <section className="os-prefs-section">
        <h3>Desktop Picture</h3>
        <ul className="os-prefs-pictures" role="listbox" aria-label="Desktop picture">
          {pictures.map((p) => {
            const selected = (custom ?? null) === p.full;
            return (
              <li key={p.id} role="option" aria-selected={selected}>
                <button type="button" onClick={() => setWallpaper(p.full)} title={p.alt}>
                  <img src={p.thumb} alt={p.alt} loading="lazy" draggable={false} />
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="os-prefs-section os-prefs-saver">
        <h3>Screen Saver</h3>
        <div className="os-prefs-saver-body">
          <ul className="os-prefs-list" role="listbox" aria-label="Screen saver">
            {SAVER_STYLES.map((s) => (
              <li key={s.style} role="option" aria-selected={saver.style === s.style}>
                <button type="button" onClick={() => setSaver({ style: s.style })}>
                  {s.name}
                </button>
              </li>
            ))}
          </ul>
          <div className="os-prefs-preview">
            <div className="os-prefs-screen">
              {saver.style === 'starfield' && <Starfield />}
              {saver.style === 'clock' && <DriftingClock />}
              {saver.style === 'photos' && data.photos[0] && <img src={data.photos[0].thumb} alt="" />}
            </div>
            <p>{blurb}</p>
            <div className="os-prefs-row">
              <label htmlFor="os-saver-idle">Start after</label>
              <select id="os-saver-idle" value={saver.idle} onChange={(e) => setSaver({ idle: Number(e.target.value) })}>
                {IDLE_CHOICES.map((c) => (
                  <option key={c.minutes} value={c.minutes}>
                    {c.label}
                  </option>
                ))}
              </select>
              <button type="button" className="os-button" onClick={() => setScreensaver(true)}>
                Test
              </button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

const APPEARANCES: { value: Appearance; name: string; blurb: string }[] = [
  { value: 'system', name: 'Automatic', blurb: 'Match your computer’s setting.' },
  { value: 'light', name: 'Light', blurb: 'Classic Aqua.' },
  { value: 'dark', name: 'Dark', blurb: 'Graphite windows for late nights.' },
  { value: 'sun', name: 'Follow the sun', blurb: 'Light while the sun is up where you are, dark after sunset.' }
];

function AccentPicker() {
  const data = useOSData();
  const accent = useWindows((s) => s.accent);
  const setAccent = useWindows((s) => s.setAccent);
  const wallpaper = useWindows((s) => s.wallpaper) ?? data.wallpaper;
  const fromPicture = cachedAccent(wallpaper);
  const choices: { value: AccentChoice; name: string; color: string }[] = [
    {
      value: 'auto',
      name: 'From Desktop Picture',
      color: fromPicture ?? 'conic-gradient(#e5484d, #ffc53d, #30a46c, #0090ff, #8e4ec6, #e5484d)'
    },
    ...Object.entries(ACCENTS).map(([value, a]) => ({ value: value as AccentChoice, name: a.name, color: a.color }))
  ];
  const current = choices.find((c) => c.value === accent);
  return (
    <section className="os-prefs-section">
      <h3>Accent Color</h3>
      <div className="os-prefs-swatches" role="radiogroup" aria-label="Accent color">
        {choices.map((c) => (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={accent === c.value}
            aria-label={c.name}
            title={c.name}
            data-auto={c.value === 'auto' || undefined}
            style={{ background: c.color }}
            onClick={() => setAccent(c.value)}
          />
        ))}
        <span>{current?.name}</span>
      </div>
      <p className="os-prefs-note">
        {accent === 'auto'
          ? 'Selections, menus and buttons take their color from the desktop picture. Change the picture and they follow.'
          : 'A fixed color, whatever the desktop picture.'}
      </p>
    </section>
  );
}

function AppearancePane() {
  const appearance = useWindows((s) => s.appearance);
  const setAppearance = useWindows((s) => s.setAppearance);
  return (
    <>
      <section className="os-prefs-section">
        <h3>Appearance</h3>
        <div className="os-prefs-radios" role="radiogroup" aria-label="Appearance">
          {APPEARANCES.map((a) => (
            <label key={a.value}>
              <input type="radio" name="appearance" checked={appearance === a.value} onChange={() => setAppearance(a.value)} />
              <span>
                <strong>{a.name}</strong>
                <small>{a.blurb}</small>
              </span>
            </label>
          ))}
        </div>
      </section>
      <AccentPicker />
    </>
  );
}

function SoundPane() {
  const on = useWindows((s) => s.soundOn);
  const volume = useWindows((s) => s.volume);
  const { setSound, setVolume } = useWindows.getState();
  return (
    <section className="os-prefs-section">
      <h3>Sound Effects</h3>
      <p className="os-prefs-lead">Windows whoosh, menus click and mistakes thud. All of it is synthesized in your browser.</p>
      <div className="os-prefs-radios">
        <label>
          <input
            type="checkbox"
            checked={on}
            onChange={(e) => {
              setSound(e.target.checked);
              if (e.target.checked) play('chime', { force: true });
            }}
          />
          <span>
            <strong>Play user interface sound effects</strong>
            <small>Off unless you turn it on. The speaker in the menu bar does the same.</small>
          </span>
        </label>
      </div>
      <div className="os-prefs-row os-prefs-volume">
        <label htmlFor="os-volume">Volume</label>
        <span aria-hidden="true">🔈</span>
        <input
          id="os-volume"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          disabled={!on}
          onChange={(e) => setVolume(Number(e.target.value))}
          onPointerUp={() => play('pop')}
          onKeyUp={() => play('pop')}
        />
        <span aria-hidden="true">🔊</span>
      </div>
    </section>
  );
}

function LocationPane() {
  const place = usePlace();
  const [changing, setChanging] = useState(false);
  const timeZone = clockTimeZone(place);
  const how =
    place?.source === 'ip'
      ? 'Found from your internet connection. Nothing is stored.'
      : place?.source === 'chosen'
        ? 'Chosen by you, and remembered in this browser.'
        : place?.source === 'url'
          ? 'Set by the link you opened.'
          : `Couldn’t find where you are, so the weather is ${HOME.city}’s.`;

  return (
    <section className="os-prefs-section">
      <h3>Your Place</h3>
      <p className="os-prefs-lead">The desktop’s light, weather and clocks follow this place.</p>
      <dl className="os-prefs-facts">
        <dt>Place</dt>
        <dd>{place ? (place.source === 'fallback' ? `${HOME.city} (fallback)` : placeLabel(place)) : 'Locating…'}</dd>
        <dt>Time zone</dt>
        <dd>{timeZone.replace(/_/g, ' ')}</dd>
        <dt>Temperature</dt>
        <dd>{place && usesFahrenheit(place) ? 'Fahrenheit' : 'Celsius'}</dd>
      </dl>
      <p className="os-prefs-note">{how}</p>
      {changing ? (
        <div className="os-prefs-search">
          <PlaceSearch
            id="os-prefs-place"
            onPick={(p) => {
              choosePlace(p);
              setChanging(false);
            }}
            onCancel={() => setChanging(false)}
          />
          <button type="button" className="os-button" onClick={() => setChanging(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="os-prefs-row">
          <button type="button" className="os-button" onClick={() => setChanging(true)}>
            Choose a City…
          </button>
          {place?.source === 'chosen' && (
            <button type="button" className="os-button" onClick={() => choosePlace(null)}>
              Use My Location
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export default function Preferences({ win }: AppProps) {
  const initial = PANES.some((p) => p.id === win.props?.pane) ? (win.props!.pane as Pane) : 'desktop';
  const [pane, setPane] = useState<Pane>(initial);
  // Opening the window again with a pane (e.g. from the desktop menu) switches to it.
  const [asked, setAsked] = useState(win.props?.pane);
  if (win.props?.pane !== asked) {
    setAsked(win.props?.pane);
    if (PANES.some((p) => p.id === win.props?.pane)) setPane(win.props!.pane as Pane);
  }

  return (
    <div className="os-app os-prefs">
      <div className="os-toolbar os-prefs-toolbar" role="tablist" aria-label="Preference panes">
        {PANES.map((p) => (
          <button key={p.id} type="button" role="tab" aria-selected={pane === p.id} onClick={() => setPane(p.id)}>
            <img src={`/os/icons/${p.icon}.png`} alt="" width={32} height={32} draggable={false} />
            <span>{p.name}</span>
          </button>
        ))}
      </div>
      <div className="os-scroll os-prefs-pane" role="tabpanel">
        {pane === 'desktop' && <DesktopPane />}
        {pane === 'appearance' && <AppearancePane />}
        {pane === 'sound' && <SoundPane />}
        {pane === 'location' && <LocationPane />}
      </div>
    </div>
  );
}
