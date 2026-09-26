import { useEffect, useRef, useState } from 'react';
import type { AppProps } from '../core/registry';
import { launch } from '../core/registry';
import { play } from '../core/sound';
import { useWindows } from '../core/store';
import type { AppId } from '../core/types';
import { getSocial, PASSWORD_MIN, SocialError, USERNAME } from '../social/social';
import { useAccount } from '../social/account';

// Sign in to JM/OS, or make an account: a username, a password and, if
// they like, an address to recover it with. Members can put notes up in
// Stickies (three a day), change their Soapbox reactions and talk in Chat.
// Signed in, the window says who you are and lets you sign out.

type Tab = 'create' | 'sign-in';

export default function Account({ win }: AppProps) {
  const { account, available, ready } = useAccount();
  const [tab, setTab] = useState<Tab>(win.props?.tab === 'sign-in' ? 'sign-in' : 'create');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [recovery, setRecovery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taken, setTaken] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  // Say whether a username is free while it's being typed.
  const name = username.trim().toLowerCase();
  useEffect(() => {
    setTaken(false);
    if (tab !== 'create' || !USERNAME.test(name)) return;
    let live = true;
    const t = setTimeout(async () => {
      const social = await getSocial();
      const free = await social?.usernameAvailable(name).catch(() => true);
      if (live) setTaken(free === false);
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [name, tab]);

  useEffect(() => {
    setError(null);
    first.current?.focus();
  }, [tab]);

  // Signed in from here: this window has done its job (unless it was opened to show the account).
  const close = () => useWindows.getState().close(win.id);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const social = await getSocial();
    if (!social || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (tab === 'create') await social.signUp(name, password, recovery);
      else await social.signIn(name, password);
      play('chime');
      setPassword('');
      // Opened on the way to something members can do (Chat): go on there.
      if (win.props?.then) launch(win.props.then as AppId);
      close();
    } catch (err) {
      setError(err instanceof SocialError ? err.message : 'Something went wrong. Try again in a moment.');
      play('error');
    } finally {
      setBusy(false);
    }
  };

  if (!ready) return <div className="os-app os-account" />;

  if (!available) {
    return (
      <div className="os-app os-account">
        <p className="os-account-note">Accounts aren’t available right now.</p>
      </div>
    );
  }

  if (account) {
    return (
      <div className="os-app os-account os-account-signed-in">
        <img src="/os/icons/account.png" alt="" width={64} height={64} />
        <p>
          Signed in as <strong>{account.username}</strong>
        </p>
        <small>You can leave notes in Stickies (three a day), change your Soapbox reactions and talk in Chat.</small>
        <div className="os-account-actions">
          <button type="button" className="os-button" onClick={() => launch('chat')}>
            Open Chat
          </button>
          <button
            type="button"
            className="os-button"
            onClick={async () => {
              await (await getSocial())?.signOut();
              play('click');
            }}
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  const valid =
    USERNAME.test(name) && password.length >= PASSWORD_MIN && !(tab === 'create' && taken) && !busy;

  return (
    <form className="os-app os-account" onSubmit={submit}>
      <div className="os-account-tabs" role="tablist">
        {(['create', 'sign-in'] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {t === 'create' ? 'Create Account' : 'Sign In'}
          </button>
        ))}
      </div>
      <div className="os-account-box" role="tabpanel">
        <label>
          <span>Username</span>
          <input
            ref={first}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={20}
            aria-invalid={taken || undefined}
          />
          {tab === 'create' && (
            <small data-bad={(taken || (username !== '' && !USERNAME.test(name))) || undefined}>
              {taken ? 'That username is taken.' : '3 to 20 letters, digits or underscores.'}
            </small>
          )}
        </label>
        <label>
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={tab === 'create' ? 'new-password' : 'current-password'}
          />
          {tab === 'create' && <small>At least {PASSWORD_MIN} characters.</small>}
        </label>
        {tab === 'create' && (
          <label>
            <span>Recovery email (optional)</span>
            <input type="email" value={recovery} onChange={(e) => setRecovery(e.target.value)} autoComplete="email" />
            <small>Only used if you forget your password. Never shown to anyone.</small>
          </label>
        )}
      </div>
      <footer className="os-account-footer">
        <p role="alert">{error}</p>
        <button type="submit" className="os-button os-button-primary" disabled={!valid}>
          {busy ? 'One moment…' : tab === 'create' ? 'Create Account' : 'Sign In'}
        </button>
      </footer>
    </form>
  );
}
