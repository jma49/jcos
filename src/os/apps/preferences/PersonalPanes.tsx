import { useEffect, useState } from 'react';
import { useOSData } from '../../core/context';
import { apps, launch } from '../../core/registry';
import { DOCK_MAGNIFY, DOCK_SIZES, useSystem, type DockSize } from '../../core/system';
import { Group, Option, Segmented } from './controls';
import { useWindows, type Appearance } from '../../core/store';
import { choosePlace, clockTimeZone, HOME, placeLabel, usePlace, usesFahrenheit } from '../../ambient/place';
import { PlaceSearch } from '../../ambient/PlaceSearch';
import { SAVER_STYLES } from '../../shell/Screensaver';
import { SAVER_VIEWS } from '../../shell/saverViews';
import { ACCENTS, cachedAccent, type AccentChoice } from '../../look/accent';
import {
  backgroundFor,
  COVER,
  PATTERNS,
  PICTURE_SETS,
  SCENIC,
  setOf,
  SKY,
  SOLID_COLORS,
  tileBackground,
  TILES
} from '../../look/wallpapers';
import { coverOf, SONGS } from '../../media/library';
import { useMusic } from '../../media/music';
import { useSky } from '../../ambient/Sky';

// System Preferences' Personal row: Appearance, Desktop & Screen Saver,
// Dock, and Date & Time (with the visitor's place).

const IDLE_CHOICES = [
  { minutes: 1, label: '1 minute' },
  { minutes: 2, label: '2 minutes' },
  { minutes: 5, label: '5 minutes' },
  { minutes: 15, label: '15 minutes' },
  { minutes: 0, label: 'Never' }
];

/** A built-in collection, or the id of a ryOS set (PICTURE_SETS, TILES). */
type Collection = string;

interface Picture {
  /** What's stored: null for the default picture, a URL, or color:/pattern:/dynamic: (wallpapers.ts). */
  value: string | null;
  name: string;
  /** An image thumbnail, or a CSS background for generated pictures. */
  thumb?: string;
  background?: string;
}

const COLLECTIONS: { id: Collection; name: string }[] = [
  { id: 'desktop', name: 'Desktop Pictures' },
  ...PICTURE_SETS.map((set) => ({ id: set.id, name: set.name })),
  { id: TILES.id, name: TILES.name },
  { id: 'colors', name: 'Solid Colors' },
  { id: 'patterns', name: 'Patterns' },
  { id: 'dynamic', name: 'Dynamic' }
];

function collectionOf(value: string | null): Collection {
  if (!value) return 'desktop';
  if (value.startsWith('color:')) return 'colors';
  if (value.startsWith('pattern:')) return 'patterns';
  if (value.startsWith('dynamic:')) return 'dynamic';
  return setOf(value)?.id ?? 'desktop';
}

export function DesktopPane() {
  const data = useOSData();
  const custom = useWindows((s) => s.wallpaper);
  const saver = useWindows((s) => s.saver);
  const rotate = useWindows((s) => s.rotateWallpaper);
  const { setWallpaper, setSaver, setScreensaver, setRotateWallpaper } = useWindows.getState();
  const sky = useSky();
  const [collection, setCollection] = useState<Collection>(() => collectionOf(custom));
  const skyNow = backgroundFor(SKY, data.wallpaper, sky);
  // The cover of the song that's on, or the first album's for the thumbnail.
  const playing = useMusic((s) => (s.owner ? coverOf(SONGS[s.index]) : null));
  const nowCover = playing ?? coverOf(SONGS[0]);

  const pictures: Record<Collection, Picture[]> = {
    ...Object.fromEntries(PICTURE_SETS.map((set) => [set.id, set.items])),
    [TILES.id]: TILES.items.map((t) => ({ value: t.value, name: t.name, background: tileBackground(t.value) })),
    desktop: [{ value: null, name: 'Stones', thumb: data.wallpaper }],
    colors: SOLID_COLORS.map((c) => ({
      value: `color:${c.id}`,
      name: c.name,
      background: backgroundFor(`color:${c.id}`, '', sky)
    })),
    patterns: PATTERNS.map((p) => ({ value: `pattern:${p.id}`, name: p.name, background: p.background })),
    dynamic: [
      { value: SKY, name: 'Sky: the light and weather where you are, all day', background: skyNow },
      {
        value: COVER,
        name: 'Now Playing: the cover of the song that’s on',
        background: `url("${nowCover}") center / cover, #333`
      }
    ]
  };
  const blurb = SAVER_STYLES.find((s) => s.style === saver.style)?.blurb;
  // Desktop and Screen Saver are two tabs, as in Leopard.
  const [tab, setTab] = useState<'desktop' | 'saver'>('desktop');

  return (
    <>
      <div className="os-prefs-tabs">
        <Segmented
          label="Desktop or screen saver"
          value={tab}
          choices={[
            { value: 'desktop', name: 'Desktop' },
            { value: 'saver', name: 'Screen Saver' }
          ]}
          onChange={setTab}
        />
      </div>
      {tab === 'desktop' ? (
        <Group title="Desktop Picture">
          <div className="os-prefs-saver-body">
            <ul className="os-prefs-list" role="listbox" aria-label="Collection">
              {COLLECTIONS.map((c) => (
                <li key={c.id} role="option" aria-selected={collection === c.id}>
                  <button type="button" onClick={() => setCollection(c.id)}>
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
            <ul className="os-prefs-pictures" role="listbox" aria-label="Desktop picture">
              {pictures[collection].map((p) => (
                <li key={p.value ?? 'default'} role="option" aria-selected={(custom ?? null) === p.value}>
                  <button type="button" onClick={() => setWallpaper(p.value)} title={p.name}>
                    {p.thumb ? (
                      <img src={p.thumb} alt={p.name} loading="lazy" draggable={false} />
                    ) : (
                      <span className="os-prefs-swatch-picture" style={{ background: p.background }} aria-label={p.name} />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          {collection === 'dynamic' ? (
            <p className="os-prefs-note">
              {custom === COVER
                ? 'The cover of whatever the iPod or Karaoke is playing, blurred into a wash of its colours; the menus take its colour too. With nothing on, the default picture.'
                : 'The sky follows the sun where you are: dawn, day, golden hour, dusk and night, greyed by clouds and rain.'}
            </p>
          ) : (
            <div className="os-prefs-radios os-prefs-rotate">
              <label>
                <input type="checkbox" checked={rotate} onChange={(e) => setRotateWallpaper(e.target.checked)} />
                <span>
                  <strong>Change picture when you come back</strong>
                  <small>Switch to another tab or app and return to a new picture from this collection.</small>
                </span>
              </label>
            </div>
          )}
        </Group>
      ) : (
        <Group title="Screen Saver" className="os-prefs-saver">
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
                {saver.style === 'photos' ? <img src={SCENIC[0].thumb} alt="" /> : SAVER_VIEWS[saver.style]?.()}
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
        </Group>
      )}
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
    <Group title="Accent Color">
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
    </Group>
  );
}

function MaterialPicker() {
  const glass = useWindows((s) => s.glass);
  const setGlass = useWindows((s) => s.setGlass);
  const options = [
    { glass: false, name: 'Aqua', blurb: 'Pinstripes and brushed metal, as in Mac OS X Tiger.' },
    { glass: true, name: 'Glass', blurb: 'Frosted, translucent windows and menus that let the desktop show through.' }
  ];
  return (
    <Group title="Material">
      <div className="os-prefs-radios" role="radiogroup" aria-label="Material">
        {options.map((o) => (
          <label key={o.name}>
            <input type="radio" name="material" checked={glass === o.glass} onChange={() => setGlass(o.glass)} />
            <span>
              <strong>{o.name}</strong>
              <small>{o.blurb}</small>
            </span>
          </label>
        ))}
      </div>
    </Group>
  );
}

export function AppearancePane() {
  const appearance = useWindows((s) => s.appearance);
  const setAppearance = useWindows((s) => s.setAppearance);
  // Without a place yet (or in `astro dev`), the sun is San Jose's: say so.
  const place = usePlace();
  const guessing = !place || place.source === 'fallback';
  return (
    <>
      <Group title="Appearance">
        <div className="os-prefs-radios" role="radiogroup" aria-label="Appearance">
          {APPEARANCES.map((a) => (
            <label key={a.value}>
              <input type="radio" name="appearance" checked={appearance === a.value} onChange={() => setAppearance(a.value)} />
              <span>
                <strong>{a.name}</strong>
                <small>{a.blurb}</small>
                {a.value === 'sun' && appearance === 'sun' && guessing && (
                  <small className="os-prefs-hint">
                    We don’t know where you are yet, so this follows the sun in {HOME.city}.{' '}
                    <button
                      type="button"
                      className="os-link"
                      onClick={() => launch('preferences', { props: { pane: 'datetime' } })}
                    >
                      Pick a city…
                    </button>
                  </small>
                )}
              </span>
            </label>
          ))}
        </div>
      </Group>
      <MaterialPicker />
      <AccentPicker />
    </>
  );
}

/** A small analog clock for the Date & Time pane, in the place's time. */
function AnalogClock({ timeZone }: { timeZone: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const [h, m, sec] = now.toLocaleTimeString('en-GB', { timeZone, hour12: false }).split(':').map(Number);
  const hand = (turn: number, length: number, width: number, color: string) => (
    <line
      x1="50"
      y1="50"
      x2={50 + length * Math.sin(turn * 2 * Math.PI)}
      y2={50 - length * Math.cos(turn * 2 * Math.PI)}
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
    />
  );
  return (
    <svg className="os-prefs-clock" viewBox="0 0 100 100" role="img" aria-label={now.toLocaleTimeString('en-US', { timeZone })}>
      <circle cx="50" cy="50" r="47" className="os-prefs-clock-rim" />
      <circle cx="50" cy="50" r="42" className="os-prefs-clock-face" />
      {Array.from({ length: 12 }, (_, i) => (
        <line
          key={i}
          x1="50"
          y1={i % 3 ? 12 : 11}
          x2="50"
          y2={i % 3 ? 16 : 19}
          strokeWidth={i % 3 ? 1.2 : 2.4}
          transform={`rotate(${i * 30} 50 50)`}
          className="os-prefs-clock-tick"
        />
      ))}
      {hand(((h % 12) + m / 60) / 12, 22, 3.6, 'currentColor')}
      {hand((m + sec / 60) / 60, 32, 2.4, 'currentColor')}
      {hand(sec / 60, 34, 1, '#e5484d')}
      <circle cx="50" cy="50" r="2.6" fill="#e5484d" />
    </svg>
  );
}

export function DateTimePane() {
  const place = usePlace();
  const [changing, setChanging] = useState(false);
  const timeZone = clockTimeZone(place);
  const { clock24, clockDate, set } = useSystem();
  const how =
    place?.source === 'ip'
      ? 'Found from your internet connection. Nothing is stored.'
      : place?.source === 'chosen'
        ? 'Chosen by you, and remembered in this browser.'
        : place?.source === 'url'
          ? 'Set by the link you opened.'
          : `Couldn’t find where you are, so the weather is ${HOME.city}’s.`;

  return (
    <>
      <Group title="Your Place">
        <div className="os-prefs-place">
          <AnalogClock timeZone={timeZone} />
          <div>
            <dl className="os-prefs-facts">
              <dt>Place</dt>
              <dd>{place ? (place.source === 'fallback' ? `${HOME.city} (fallback)` : placeLabel(place)) : 'Locating…'}</dd>
              <dt>Time zone</dt>
              <dd>{timeZone.replace(/_/g, ' ')}</dd>
              <dt>Temperature</dt>
              <dd>{place && usesFahrenheit(place) ? 'Fahrenheit' : 'Celsius'}</dd>
            </dl>
            <p className="os-prefs-note">{how} The desktop’s light, weather and clocks follow this place.</p>
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
          </div>
        </div>
      </Group>
      <Group title="Menu Bar Clock">
        <div className="os-prefs-radios">
          <Option checked={clock24} onChange={(on) => set({ clock24: on })} title="Use a 24-hour clock">
            {new Date().toLocaleTimeString('en-US', {
              timeZone,
              hour: clock24 ? '2-digit' : 'numeric',
              minute: '2-digit',
              hourCycle: clock24 ? 'h23' : 'h12'
            })}
          </Option>
          <Option checked={clockDate} onChange={(on) => set({ clockDate: on })} title="Show the date">
            The day and date before the time. Phones show the time alone.
          </Option>
        </div>
      </Group>
    </>
  );
}

const DOCK_CHOICES: { value: DockSize; name: string }[] = [
  { value: 'small', name: 'Small' },
  { value: 'medium', name: 'Medium' },
  { value: 'large', name: 'Large' }
];

export function DockPane() {
  const { dockSize, magnify, set } = useSystem();
  const base = DOCK_SIZES[dockSize];
  return (
    <>
      <Group title="Dock">
        <div className="os-prefs-dock-preview" aria-hidden="true">
          <div className="os-prefs-dock-shelf" style={{ '--size': `${base * 0.7}px` } as React.CSSProperties}>
            {(['finder', 'projects', 'photos', 'ipod', 'chat'] as const).map((id, i) => {
              const { Icon } = apps[id];
              // The middle icon shows how far magnification goes.
              const size = magnify && i === 2 ? (base + DOCK_MAGNIFY) * 0.7 : base * 0.7;
              return (
                <span key={id} style={{ width: size, height: size }}>
                  <Icon size={Math.round(size)} />
                </span>
              );
            })}
          </div>
        </div>
        <div className="os-prefs-form">
          <span>Size:</span>
          <Segmented label="Dock size" value={dockSize} choices={DOCK_CHOICES} onChange={(v) => set({ dockSize: v })} />
          <span />
          <div className="os-prefs-radios">
            <Option checked={magnify} onChange={(on) => set({ magnify: on })} title="Magnification">
              Icons grow as the pointer passes over them.
            </Option>
          </div>
        </div>
      </Group>
      <p className="os-prefs-note">
        The Dock keeps Finder, Projects, Photos, the iPod and Chat; other apps join it while they’re open.
      </p>
    </>
  );
}
