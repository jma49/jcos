import { launch } from '../../core/registry';
import { useWindows } from '../../core/store';
import { play } from '../../core/sound';
import { useReduceMotion, useSystem, type MotionChoice, type NightShift } from '../../core/system';
import { hue } from '../../social/chatState';
import { useAccount } from '../../social/account';
import { getSocial } from '../../social/social';
import { Group, Option, Segmented } from './controls';

// System Preferences' Hardware & System row: Displays, Sound and Accounts.

const NIGHT_SHIFT: { value: NightShift; name: string }[] = [
  { value: 'off', name: 'Off' },
  { value: 'sunset', name: 'Sunset to Sunrise' },
  { value: 'on', name: 'On' }
];

const MOTION: { value: MotionChoice; blurb: string; name: string }[] = [
  { value: 'system', name: 'Like my computer', blurb: 'Follow the “reduce motion” setting of this device.' },
  { value: 'reduce', name: 'Reduce motion', blurb: 'Windows, Exposé and the Genie appear and go without flying about.' },
  { value: 'full', name: 'Full motion', blurb: 'Every animation, whatever this device prefers.' }
];

export function DisplaysPane() {
  const { nightShift, warmth, motion, set } = useSystem();
  const reduced = useReduceMotion();
  return (
    <>
      <Group title="Night Shift">
        <p className="os-prefs-lead">Warms the colours of the screen, easier on the eyes after dark.</p>
        <div className="os-prefs-form">
          <span>Turn on:</span>
          <Segmented label="Night Shift" value={nightShift} choices={NIGHT_SHIFT} onChange={(v) => set({ nightShift: v })} />
          <label htmlFor="os-warmth">Colour:</label>
          <div className="os-prefs-row os-prefs-slider">
            <small>Less warm</small>
            <input
              id="os-warmth"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={warmth}
              disabled={nightShift === 'off'}
              onChange={(e) => set({ warmth: Number(e.target.value) })}
            />
            <small>More warm</small>
          </div>
        </div>
        {nightShift === 'sunset' && <p className="os-prefs-note">From sunset to sunrise where you are (see Date &amp; Time).</p>}
      </Group>
      <Group title="Motion">
        <div className="os-prefs-radios" role="radiogroup" aria-label="Motion">
          {MOTION.map((m) => (
            <Option
              key={m.value}
              type="radio"
              name="motion"
              checked={motion === m.value}
              onChange={() => set({ motion: m.value })}
              title={m.name}
            >
              {m.blurb}
            </Option>
          ))}
        </div>
        <p className="os-prefs-note">Right now animations are {reduced ? 'reduced' : 'on'}.</p>
      </Group>
    </>
  );
}

export function SoundPane() {
  const on = useWindows((s) => s.soundOn);
  const volume = useWindows((s) => s.volume);
  const { setSound, setVolume } = useWindows.getState();
  return (
    <Group title="Sound">
      <p className="os-prefs-lead">
        One switch for everything that makes a sound: windows whoosh, menus click and mistakes thud (synthesized in your browser),
        and the music in the iPod and Karaoke.
      </p>
      <div className="os-prefs-radios">
        <Option
          checked={on}
          onChange={(checked) => {
            setSound(checked);
            if (checked) play('chime', { force: true });
          }}
          title="Play sound"
        >
          Off until you turn it on, or press Play on a song. The speaker in the menu bar does the same.
        </Option>
      </div>
      <div className="os-prefs-row os-prefs-volume os-prefs-slider">
        <label htmlFor="os-volume">Output volume:</label>
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
    </Group>
  );
}

export function AccountsPane() {
  const { account, available, ready } = useAccount();
  if (!ready) return <Group title="Accounts">Checking…</Group>;
  if (!available) {
    return (
      <Group title="Accounts">
        <p className="os-prefs-lead">Accounts need the desktop’s connection, and it isn’t available right now.</p>
      </Group>
    );
  }
  return (
    <>
      <Group title={account ? 'My Account' : 'Accounts'}>
        {account ? (
          <div className="os-prefs-account">
            <span
              className="os-prefs-avatar"
              style={{ '--hue': hue(account.username) } as React.CSSProperties}
              aria-hidden="true"
            >
              {account.username[0]?.toUpperCase()}
            </span>
            <div>
              <strong>{account.username}</strong>
              <small>Member · signed in on this browser</small>
            </div>
            <button type="button" className="os-button" onClick={() => getSocial().then((s) => s?.signOut())}>
              Sign Out
            </button>
          </div>
        ) : (
          <div className="os-prefs-account">
            <img src="/os/icons/users.png" alt="" width={48} height={48} />
            <div>
              <strong>Guest</strong>
              <small>Not signed in</small>
            </div>
            <button type="button" className="os-button" onClick={() => launch('account', { props: { tab: 'sign-in' } })}>
              Sign In…
            </button>
            <button type="button" className="os-button os-button-primary" onClick={() => launch('account')}>
              Create Account…
            </button>
          </div>
        )}
      </Group>
      <Group title="What members can do">
        <ul className="os-prefs-perks">
          <li>Leave notes in Stickies, the guestbook</li>
          <li>Talk in Chat, and message other members privately</li>
          <li>Send photos, songs and projects to each other with AirDrop</li>
          <li>React to Soapbox posts as themselves</li>
        </ul>
      </Group>
    </>
  );
}
