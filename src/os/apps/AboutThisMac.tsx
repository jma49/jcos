import { useEffect, useState } from 'react';
import type { AppProps } from '../core/registry';
import { launch } from '../core/registry';
import { useWindows } from '../core/store';

// About This Mac, as Tiger's: the Apple, the version, and a few facts about
// the "hardware", which here is the visitor's own browser and screen.
// More Info… opens a System Profiler–style list; Software Update… shows the
// commit this build came from.

/** What the browser will say about the machine it runs on. */
function machine() {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { effectiveType?: string }; userAgentData?: { platform?: string } };
  const cores = nav.hardwareConcurrency;
  const ua = nav.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'a browser';
  const platform = nav.userAgentData?.platform || (/Mac/.test(ua) ? 'macOS' : /Win/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : '');
  let gpu = '';
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    gpu = (info && gl ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '').replace(/^ANGLE \((.*)\)$/, '$1').replace(/\s*\(0x[0-9a-f]+\)/gi, '').split(',').slice(0, 2).join(',');
  } catch {}
  return {
    processor: cores ? `${cores}-core ${platform ? `${platform} ` : ''}processor` : 'One very patient processor',
    memory: nav.deviceMemory ? `${nav.deviceMemory} GB${nav.deviceMemory >= 8 ? ' or more' : ''}` : 'Enough',
    browser: `${browser}${platform ? ` on ${platform}` : ''}`,
    display: `${screen.width} × ${screen.height}${devicePixelRatio > 1 ? ` (Retina, ${devicePixelRatio}×)` : ''}`,
    graphics: gpu || 'Quartz Extreme (probably)',
    network: nav.connection?.effectiveType ? nav.connection.effectiveType.toUpperCase() : navigator.onLine ? 'Online' : 'Offline',
    language: navigator.language,
    zone: Intl.DateTimeFormat().resolvedOptions().timeZone
  };
}

export default function AboutThisMac({ win }: AppProps) {
  const [info] = useState(machine);
  const [more, setMore] = useState(false);
  const [update, setUpdate] = useState(false);
  const visitors = useWindows((s) => s.visitors?.length ?? 1);
  const [up, setUp] = useState(() => performance.now());
  useEffect(() => {
    const t = setInterval(() => setUp(performance.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const minutes = Math.floor(up / 60_000);
  const build = __JMOS_BUILD__;

  return (
    <div className="os-app os-aboutmac">
      <img className="os-aboutmac-apple" src="/os/icons/apple.png" alt="" width={72} height={72} />
      <h2>Mac OS X</h2>
      <p className="os-aboutmac-version">JM/OS · Version 10.4.11</p>
      <button type="button" className="os-button" onClick={() => setUpdate((u) => !u)}>
        Software Update…
      </button>
      {update && (
        <p className="os-aboutmac-update">
          {build === 'dev' ? 'This is a development build.' : 'Your software is up to date: build '}
          {build !== 'dev' && (
            <a href={`https://github.com/jma49/jmos/commit/${build}`} target="_blank" rel="noopener">
              {build}
            </a>
          )}
          {build !== 'dev' && '.'}
        </p>
      )}
      <dl className="os-aboutmac-facts">
        <dt>Processor</dt>
        <dd>{info.processor}</dd>
        <dt>Memory</dt>
        <dd>{info.memory}</dd>
        <dt>Startup Disk</dt>
        <dd>Macintosh HD</dd>
        {more && (
          <>
            <dt>Graphics</dt>
            <dd>{info.graphics}</dd>
            <dt>Display</dt>
            <dd>{info.display}</dd>
            <dt>Browser</dt>
            <dd>{info.browser}</dd>
            <dt>Network</dt>
            <dd>{info.network}</dd>
            <dt>Language</dt>
            <dd>{info.language}</dd>
            <dt>Time Zone</dt>
            <dd>{info.zone}</dd>
            <dt>Uptime</dt>
            <dd>{minutes < 1 ? 'Under a minute' : `${minutes} minute${minutes === 1 ? '' : 's'}`}</dd>
            <dt>Users</dt>
            <dd>
              {visitors} on this desktop
            </dd>
          </>
        )}
      </dl>
      <button
        type="button"
        className="os-button"
        onClick={() => {
          // The window grows to fit the details, as Tiger's did.
          useWindows.getState().setBounds(win.id, { height: Math.min(window.innerHeight - 80, more ? 420 : 600) });
          setMore((m) => !m);
        }}
      >
        {more ? 'Less Info' : 'More Info…'}
      </button>
      <p className="os-aboutmac-legal">
        TM &amp; © 2026 Jincheng Ma. Icons from ryOS.
        <br />
        <button type="button" className="os-link" onClick={() => launch('about')}>
          About the person who made this
        </button>
      </p>
    </div>
  );
}
