import { useState } from 'react';
import { APPLETS, FEATURED, installApplet, removeApplet, useInstalledApplets, type Applet } from '../applets';
import { apps, launch, rectOf, type AppProps } from '../registry';
import { play } from '../sound';
import type { AppId } from '../types';

// The Applet Store: browse the applets, "Get" one to install it into
// Finder's Applets folder (and Spotlight), then open it from here.

type Section = 'featured' | 'Games' | 'Utilities';

/** "Get" → a moment of "Installing…" → "Open". */
function GetButton({ app, big = false }: { app: AppId; big?: boolean }) {
  const installed = useInstalledApplets().includes(app);
  const [installing, setInstalling] = useState(false);

  if (installed) {
    return (
      <button
        type="button"
        className={`os-button os-store-get${big ? ' os-store-get-big' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          launch(app, { origin: rectOf(e.currentTarget) });
        }}
      >
        Open
      </button>
    );
  }
  return (
    <button
      type="button"
      className={`os-button os-button-primary os-store-get${big ? ' os-store-get-big' : ''}`}
      disabled={installing}
      onClick={(e) => {
        e.stopPropagation();
        setInstalling(true);
        setTimeout(() => {
          installApplet(app);
          setInstalling(false);
          play('pop');
        }, 700);
      }}
    >
      {installing ? <span className="os-store-spinner" aria-label="Installing" /> : 'Get'}
    </button>
  );
}

function Row({ applet, onShow }: { applet: Applet; onShow: () => void }) {
  const { Icon, name } = apps[applet.app];
  return (
    <li>
      <button type="button" className="os-store-row" onClick={onShow}>
        <Icon size={48} />
        <span className="os-store-row-text">
          <strong>{name}</strong>
          <small>{applet.category}</small>
          <span>{applet.tagline}</span>
        </span>
      </button>
      <GetButton app={applet.app} />
    </li>
  );
}

function Detail({ applet, onBack }: { applet: Applet; onBack: () => void }) {
  const { Icon, name } = apps[applet.app];
  const installed = useInstalledApplets().includes(applet.app);
  return (
    <div className="os-store-detail">
      <button type="button" className="os-store-back" onClick={onBack}>
        ‹ Applet Store
      </button>
      <header>
        <Icon size={96} />
        <div>
          <h2>{name}</h2>
          <p>
            {applet.category} · by Jincheng Ma
          </p>
          <div className="os-store-actions">
            <GetButton app={applet.app} big />
            {installed && (
              <button type="button" className="os-button" onClick={() => removeApplet(applet.app)}>
                Remove
              </button>
            )}
          </div>
        </div>
      </header>
      <p className="os-store-description">{applet.description}</p>
      <dl className="os-prefs-facts">
        <dt>Category</dt>
        <dd>{applet.category}</dd>
        <dt>Added</dt>
        <dd>{new Date(`${applet.added}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</dd>
        <dt>Price</dt>
        <dd>Free</dd>
        <dt>Installs to</dt>
        <dd>Macintosh HD ▸ Applets</dd>
      </dl>
    </div>
  );
}

export default function AppletStore({ win }: AppProps) {
  const [section, setSection] = useState<Section>('featured');
  const [shown, setShown] = useState<AppId | null>((win.props?.applet as AppId | undefined) ?? null);
  // Opening the store again for an applet (e.g. from Spotlight) shows it.
  const [asked, setAsked] = useState(win.props?.applet);
  if (win.props?.applet !== asked) {
    setAsked(win.props?.applet);
    if (win.props?.applet) setShown(win.props.applet as AppId);
  }

  const detail = shown ? APPLETS.find((a) => a.app === shown) : undefined;
  const featured = APPLETS.find((a) => a.app === FEATURED)!;
  const list = section === 'featured' ? APPLETS : APPLETS.filter((a) => a.category === section);

  return (
    <div className="os-app os-store">
      <div className="os-toolbar">
        <div className="os-segmented" role="group" aria-label="Section">
          {(['featured', 'Games', 'Utilities'] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={section === s && !detail}
              onClick={() => {
                setSection(s);
                setShown(null);
              }}
            >
              {s === 'featured' ? 'Featured' : s}
            </button>
          ))}
        </div>
        <span className="os-toolbar-meta">{APPLETS.length} applets · all free</span>
      </div>
      <div className="os-scroll os-store-body">
        {detail ? (
          <Detail applet={detail} onBack={() => setShown(null)} />
        ) : (
          <>
            {section === 'featured' && (
              <section className="os-store-hero" onClick={() => setShown(featured.app)}>
                <div>
                  <p className="os-store-kicker">New this week</p>
                  <h2>{apps[featured.app].name}</h2>
                  <p>{featured.tagline}</p>
                  <GetButton app={featured.app} />
                </div>
                {(() => {
                  const { Icon } = apps[featured.app];
                  return <Icon size={112} />;
                })()}
              </section>
            )}
            <h3 className="os-store-heading">{section === 'featured' ? 'All Applets' : section}</h3>
            <ul className="os-store-list">
              {list.map((a) => (
                <Row key={a.app} applet={a} onShow={() => setShown(a.app)} />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
