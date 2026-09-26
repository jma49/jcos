import { useEffect } from 'react';
import type { AppProps } from '../core/registry';
import { apps, launch } from '../core/registry';
import { useWindows } from '../core/store';
import type { AppId } from '../core/types';
import { useAccount } from '../social/account';

// A first visit's welcome: what JM/OS is and a few things worth trying. It
// opens once, alone and in the middle of the screen; when it's closed,
// About follows, so the desktop is never left empty.

const TIPS: { icon: AppId; title: string; text: string }[] = [
  { icon: 'projects', title: 'Open things', text: 'Double-click on the desktop, click in the Dock, or right-click for more.' },
  { icon: 'terminal', title: 'Find anything', text: '⌘K searches everything. F9 or the bottom-left corner shows every window.' },
  { icon: 'ipod', title: 'Put on music', text: 'The iPod has a click wheel and Cover Flow; Karaoke sings along.' },
  { icon: 'chat', title: 'Say hello', text: 'Make an account to talk in Chat and leave a note in Stickies.' },
  { icon: 'airdrop', title: 'Share', text: 'AirDrop a photo, song or project to someone else who’s here.' },
  { icon: 'photobooth', title: 'Play', text: 'Take your picture in Photo Booth, or get games in the Applet Store.' }
];

export default function Welcome({ win }: AppProps) {
  const { account, available } = useAccount();
  const others = useWindows((s) => Math.max(0, (s.visitors?.length ?? 1) - 1));
  const close = () => useWindows.getState().close(win.id);

  // Once this window has gone, About takes its place if nothing else opened.
  useEffect(
    () => () => {
      setTimeout(() => {
        const { windows } = useWindows.getState();
        if (!windows[win.id] && Object.keys(windows).length === 0) launch('about');
      }, 0);
    },
    [win.id]
  );

  return (
    <div className="os-app os-welcome">
      <header>
        <img src="/os/icons/apple.png" alt="" width={44} height={44} />
        <div>
          <h2>Welcome to JM/OS</h2>
          <p className="os-welcome-lead">
            Jincheng’s portfolio, as a Mac OS X desktop you can use. Poke around; nothing here breaks.
          </p>
        </div>
      </header>
      <ul>
        {TIPS.map(({ icon, title, text }) => {
          const { Icon } = apps[icon];
          return (
            <li key={icon}>
              <Icon size={32} />
              <span>
                <b>{title}</b>
                {text}
              </span>
            </li>
          );
        })}
      </ul>
      <footer>
        <span className="os-welcome-here" aria-live="polite">
          {others > 0 && (
            <>
              <i aria-hidden="true" />
              {others === 1 ? 'Someone else is here right now' : `${others} other people are here right now`}
            </>
          )}
        </span>
        {available && !account && (
          <button
            type="button"
            className="os-button"
            onClick={() => {
              close();
              launch('account');
            }}
          >
            Create an Account…
          </button>
        )}
        <button type="button" className="os-button os-button-primary" onClick={close} autoFocus>
          Look Around
        </button>
      </footer>
    </div>
  );
}
