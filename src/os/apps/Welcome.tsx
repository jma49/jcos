import type { AppProps } from '../core/registry';
import { apps, launch } from '../core/registry';
import { useWindows } from '../core/store';
import { useAccount } from '../social/account';

// A first visit's welcome: what JM/OS is and a few things worth trying.
// Opens once, next to About; the desktop remembers it was seen.

const TIPS: { icon: keyof typeof apps; text: string }[] = [
  { icon: 'projects', text: 'Double-click anything on the desktop, or open it from the Dock.' },
  { icon: 'terminal', text: '⌘K searches everything. F9 (or the bottom-left corner) shows all windows.' },
  { icon: 'ipod', text: 'The iPod has a working click wheel, Cover Flow and a karaoke mode.' },
  { icon: 'stickies', text: 'Make an account to leave a note in Stickies and talk in Chat.' },
  { icon: 'preferences', text: 'System Preferences changes the desktop picture, look and sounds.' }
];

export default function Welcome({ win }: AppProps) {
  const { account, available } = useAccount();
  const close = () => useWindows.getState().close(win.id);

  return (
    <div className="os-app os-welcome">
      <h2>Welcome to JM/OS</h2>
      <p className="os-welcome-lead">
        This is Jincheng’s portfolio, as a Mac OS X desktop you can use. Poke around; nothing here breaks.
      </p>
      <ul>
        {TIPS.map(({ icon, text }) => {
          const { Icon } = apps[icon];
          return (
            <li key={icon}>
              <Icon size={32} />
              <span>{text}</span>
            </li>
          );
        })}
      </ul>
      <footer>
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
        <button type="button" className="os-button os-button-primary" onClick={close}>
          Look Around
        </button>
      </footer>
    </div>
  );
}
