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
// Signed in, the window says who you are, lets you sign out and change
// the recovery address. A forgotten password is reset with a link sent to
// that address (supabase/functions/account-recovery), which opens this
// window on the "reset" tab.

type Tab = 'create' | 'sign-in' | 'forgot' | 'reset';

const TABS: Tab[] = ['create', 'sign-in', 'forgot', 'reset'];

/** A refusal the interface can show as it is, or a general apology. */
const messageOf = (err: unknown) => (err instanceof SocialError ? err.message : 'Something went wrong. Try again in a moment.');

/** The signed-in member's recovery address: shown, added, changed or removed. */
function RecoveryAddress() {
  const [address, setAddress] = useState<string | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    getSocial()
      .then((social) => social?.recoveryEmail())
      .then((found) => live && setAddress(found ?? null))
      .catch(() => live && setAddress(null));
    return () => {
      live = false;
    };
  }, []);

  const save = async (next: string | null) => {
    const social = await getSocial();
    if (!social || busy) return;
    setBusy(true);
    setError(null);
    try {
      await social.setRecoveryEmail(next);
      setAddress(next?.trim() || null);
      setEditing(false);
      play('pop');
    } catch (err) {
      setError(messageOf(err));
      play('error');
    } finally {
      setBusy(false);
    }
  };

  if (address === undefined) return null;
  if (editing) {
    return (
      <form
        className="os-account-recovery"
        onSubmit={(e) => {
          e.preventDefault();
          save(draft);
        }}
      >
        <label>
          <span>Recovery email</span>
          <input type="email" value={draft} onChange={(e) => setDraft(e.target.value)} autoComplete="email" autoFocus required />
        </label>
        {error && <small data-bad>{error}</small>}
        <div className="os-account-actions">
          <button type="button" className="os-button" onClick={() => setEditing(false)}>
            Cancel
          </button>
          <button type="submit" className="os-button os-button-primary" disabled={busy || !draft.trim()}>
            Save
          </button>
        </div>
      </form>
    );
  }
  return (
    <div className="os-account-recovery">
      <small>
        {address ? (
          <>
            Recovery email: <strong>{address}</strong>
          </>
        ) : (
          'No recovery email. Add one so you can reset your password if you forget it.'
        )}
      </small>
      {error && <small data-bad>{error}</small>}
      <div className="os-account-actions">
        <button
          type="button"
          className="os-link"
          onClick={() => {
            setDraft(address ?? '');
            setEditing(true);
          }}
        >
          {address ? 'Change…' : 'Add…'}
        </button>
        {address && (
          <button type="button" className="os-link" disabled={busy} onClick={() => save(null)}>
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

export default function Account({ win }: AppProps) {
  const { account, available, ready } = useAccount();
  const asked = win.props?.tab as Tab | undefined;
  const [tab, setTab] = useState<Tab>(asked && TABS.includes(asked) ? asked : 'create');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [recovery, setRecovery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taken, setTaken] = useState(false);
  /** Forgot: the username a link was asked for. */
  const [sentFor, setSentFor] = useState<string | null>(null);
  /** Reset: whose link this is (null when it no longer works; undefined while checking). */
  const [resetFor, setResetFor] = useState<string | null | undefined>(undefined);
  /** Signed in by choosing a new password. */
  const [changed, setChanged] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  const token = win.props?.reset;

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
    setSentFor(null);
    first.current?.focus();
  }, [tab]);

  // A reset link: find out whose it is, and whether it still works.
  useEffect(() => {
    if (tab !== 'reset' || !token) return;
    let live = true;
    setResetFor(undefined);
    getSocial()
      .then((social) => social?.checkReset(token))
      .then((who) => live && setResetFor(who ?? null))
      .catch(() => live && setResetFor(null));
    return () => {
      live = false;
    };
  }, [tab, token]);

  // Signed in from here: this window has done its job (unless it was opened to show the account).
  const close = () => useWindows.getState().close(win.id);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const social = await getSocial();
    if (!social || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (tab === 'forgot') {
        await social.requestReset(name);
        setSentFor(name);
        play('pop');
        return;
      }
      if (tab === 'reset') {
        await social.resetPassword(token ?? '', password);
        play('chime');
        setPassword('');
        setConfirm('');
        setChanged(true);
        // The link is spent; don't keep it with the window.
        launch('account', { props: {} });
        return;
      }
      if (tab === 'create') await social.signUp(name, password, recovery);
      else await social.signIn(name, password);
      play('chime');
      setPassword('');
      // Opened on the way to something members can do (Chat): go on there.
      if (win.props?.then) launch(win.props.then as AppId);
      close();
    } catch (err) {
      if (err instanceof SocialError && err.reason === 'expired') setResetFor(null);
      setError(messageOf(err));
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
        {changed ? (
          <small>Your password is changed. Use the new one from now on.</small>
        ) : (
          <small>You can leave notes in Stickies (three a day), change your Soapbox reactions and talk in Chat.</small>
        )}
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
        <RecoveryAddress />
      </div>
    );
  }

  const valid =
    tab === 'forgot'
      ? USERNAME.test(name) && !busy
      : tab === 'reset'
        ? !!resetFor && password.length >= PASSWORD_MIN && password === confirm && !busy
        : USERNAME.test(name) && password.length >= PASSWORD_MIN && !(tab === 'create' && taken) && !busy;

  const label =
    tab === 'forgot' ? 'Send Link' : tab === 'reset' ? 'Change Password' : tab === 'create' ? 'Create Account' : 'Sign In';

  return (
    <form className="os-app os-account" onSubmit={submit}>
      <div className="os-account-tabs" role="tablist">
        {(['create', 'sign-in'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t || (t === 'sign-in' && (tab === 'forgot' || tab === 'reset'))}
            onClick={() => setTab(t)}
          >
            {t === 'create' ? 'Create Account' : 'Sign In'}
          </button>
        ))}
      </div>
      <div className="os-account-box" role="tabpanel">
        {tab === 'forgot' && (
          <p className="os-account-lead">
            {sentFor
              ? `If ${sentFor} has a recovery email, a link to choose a new password is on its way. It works once, for 30 minutes.`
              : 'Enter your username, and a link to choose a new password goes to the recovery email you gave.'}
          </p>
        )}
        {tab === 'reset' &&
          (resetFor === undefined ? (
            <p className="os-account-lead">Checking your link…</p>
          ) : resetFor === null ? (
            <p className="os-account-lead">
              This link has expired or has already been used.{' '}
              <button type="button" className="os-link" onClick={() => setTab('forgot')}>
                Ask for a new one
              </button>
            </p>
          ) : (
            <p className="os-account-lead">
              Choose a new password for <strong>{resetFor}</strong>.
            </p>
          ))}
        {(tab === 'create' || tab === 'sign-in' || (tab === 'forgot' && !sentFor)) && (
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
        )}
        {(tab === 'create' || tab === 'sign-in' || (tab === 'reset' && resetFor)) && (
          <label>
            <span>{tab === 'reset' ? 'New password' : 'Password'}</span>
            <input
              ref={tab === 'reset' ? first : undefined}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={tab === 'sign-in' ? 'current-password' : 'new-password'}
            />
            {tab !== 'sign-in' && <small>At least {PASSWORD_MIN} characters.</small>}
            {tab === 'sign-in' && (
              <button type="button" className="os-link os-account-forgot" onClick={() => setTab('forgot')}>
                Forgot your password?
              </button>
            )}
          </label>
        )}
        {tab === 'reset' && resetFor && (
          <label>
            <span>Type it again</span>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              aria-invalid={(confirm !== '' && confirm !== password) || undefined}
            />
            {confirm !== '' && confirm !== password && <small data-bad>The two don’t match.</small>}
          </label>
        )}
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
        {(tab === 'forgot' || tab === 'reset') && (
          <button type="button" className="os-button" onClick={() => setTab('sign-in')}>
            {sentFor ? 'Back to Sign In' : 'Cancel'}
          </button>
        )}
        {!sentFor && !(tab === 'reset' && !resetFor) && (
          <button type="submit" className="os-button os-button-primary" disabled={!valid}>
            {busy ? 'One moment…' : label}
          </button>
        )}
      </footer>
    </form>
  );
}
