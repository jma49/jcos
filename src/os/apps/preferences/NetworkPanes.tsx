import { useRef, useState } from 'react';
import { useSystem } from '../../core/system';
import { usePlace, placeLabel } from '../../ambient/place';
import { setDiscoverable, useAirDrop } from '../../social/airdrop';
import { useAccount } from '../../social/account';
import { makeBackup, resetPreferences, restoreBackup } from './backup';
import { Group, Option } from './controls';

// System Preferences' Internet & Network row: Sharing, Software Update and
// Backup & Restore.

export function SharingPane() {
  const { shareCity, sharePointer, showPointers, set } = useSystem();
  const discoverable = useAirDrop((s) => s.discoverable);
  const { account } = useAccount();
  const place = usePlace();
  const city = place && place.source !== 'fallback' ? placeLabel(place) : null;
  return (
    <>
      <Group title="What others on the desktop see">
        <div className="os-prefs-radios">
          <Option checked={shareCity} onChange={(on) => set({ shareCity: on })} title="Share my city">
            {city ? `Others see you’re in ${city}.` : 'Once you’re located, others see which city you’re in.'} Off, you’re
            “Somewhere”.
          </Option>
          <Option checked={sharePointer} onChange={(on) => set({ sharePointer: on })} title="Share my pointer">
            Your pointer appears on other people’s screens as you move it.
          </Option>
          <Option
            checked={!!account && discoverable === 'everyone'}
            onChange={(on) => setDiscoverable(on ? 'everyone' : 'none')}
            title="Let members find me with AirDrop"
            disabled={!account}
          >
            {account
              ? 'Other signed-in members can offer you files. You always get to accept or decline.'
              : 'Sign in to use AirDrop.'}
          </Option>
        </div>
      </Group>
      <Group title="What I see">
        <div className="os-prefs-radios">
          <Option checked={showPointers} onChange={(on) => set({ showPointers: on })} title="Show other people’s pointers">
            Everyone else’s pointer, labelled with their name or city.
          </Option>
        </div>
      </Group>
    </>
  );
}

const REPO = 'jma49/jmos';

type Check =
  | { state: 'idle' | 'checking' | 'current' | 'failed' | 'unknown' }
  | { state: 'behind'; commits: { sha: string; message: string }[] };

export function SoftwareUpdatePane() {
  const build = __JMOS_BUILD__;
  const [check, setCheck] = useState<Check>({ state: 'idle' });

  const run = async () => {
    setCheck({ state: 'checking' });
    try {
      // How far main has moved on from this build.
      const res = await fetch(`https://api.github.com/repos/${REPO}/compare/${build}...main`);
      if (res.status === 404) return setCheck({ state: 'unknown' });
      if (!res.ok) throw new Error(String(res.status));
      const { status, commits } = (await res.json()) as {
        status: string;
        commits: { sha: string; commit: { message: string } }[];
      };
      if (status === 'identical' || status === 'behind') return setCheck({ state: 'current' });
      if (status !== 'ahead') return setCheck({ state: 'unknown' });
      setCheck({
        state: 'behind',
        commits: commits
          .reverse()
          .map((c) => ({ sha: c.sha.slice(0, 7), message: c.commit.message.split('\n')[0] }))
          .filter((c) => !c.message.startsWith('Merge '))
      });
    } catch {
      setCheck({ state: 'failed' });
    }
  };

  return (
    <Group title="Software Update">
      <div className="os-prefs-update">
        <img src="/os/icons/software-update.png" alt="" width={64} height={64} />
        <div>
          <p className="os-prefs-lead">
            <strong>JM/OS 10.4.11</strong>
            <br />
            {build === 'dev' ? (
              'A development build, straight from the source.'
            ) : (
              <>
                Build{' '}
                <a href={`https://github.com/${REPO}/commit/${build}`} target="_blank" rel="noopener">
                  {build}
                </a>
              </>
            )}
          </p>
          <p className="os-prefs-note" aria-live="polite">
            {check.state === 'checking' && 'Checking for new software…'}
            {check.state === 'current' && 'Your software is up to date.'}
            {check.state === 'failed' && 'Couldn’t reach the update server. Try again later.'}
            {check.state === 'unknown' && 'This build isn’t on the main line (a preview?), so there’s nothing to compare.'}
            {check.state === 'behind' &&
              `New software is available: ${check.commits.length || 'some'} change${check.commits.length === 1 ? '' : 's'} since this build.`}
          </p>
          {check.state === 'behind' && check.commits.length > 0 && (
            <ul className="os-prefs-changes">
              {check.commits.slice(0, 8).map((c) => (
                <li key={c.sha}>{c.message}</li>
              ))}
            </ul>
          )}
          <div className="os-prefs-row">
            {check.state === 'behind' ? (
              <button type="button" className="os-button os-button-primary" onClick={() => window.location.reload()}>
                Restart
              </button>
            ) : (
              <button type="button" className="os-button" disabled={build === 'dev' || check.state === 'checking'} onClick={run}>
                Check Now
              </button>
            )}
          </div>
          {check.state === 'behind' && (
            <p className="os-prefs-note">A new version can take a minute or two to reach this site.</p>
          )}
        </div>
      </div>
    </Group>
  );
}

export function BackupPane() {
  const reset = useSystem((s) => s.reset);
  const file = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Storage can be blocked (some private windows); then there's nothing to back up or restore.
  const backUp = () => {
    let backup;
    try {
      backup = makeBackup(window.localStorage);
    } catch {
      return setMessage('This browser isn’t letting JM/OS remember anything, so there’s nothing to back up.');
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `JM-OS backup ${backup.saved.slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage(`Backed up ${Object.keys(backup.settings).length} settings.`);
  };

  const restore = async (picked: File) => {
    try {
      const count = restoreBackup(window.localStorage, await picked.text());
      setMessage(`Restored ${count} settings. Restarting…`);
      setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  return (
    <>
      <Group title="Back Up">
        <p className="os-prefs-lead">
          Save everything JM/OS remembers in this browser (the desktop picture, appearance, installed applets, high scores, Photo
          Booth pictures…) to a file, and bring it back here or in another browser.
        </p>
        <div className="os-prefs-row">
          <button type="button" className="os-button os-button-primary" onClick={backUp}>
            Back Up Now…
          </button>
          <button type="button" className="os-button" onClick={() => file.current?.click()}>
            Restore from File…
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const picked = e.target.files?.[0];
              e.target.value = '';
              if (picked) restore(picked);
            }}
          />
        </div>
        {message && (
          <p className="os-prefs-note" aria-live="polite">
            {message}
          </p>
        )}
        <p className="os-prefs-note">Your account and chats live on the server and aren’t in the file.</p>
      </Group>
      <Group title="Reset">
        <p className="os-prefs-lead">
          Put every choice made in System Preferences back to how it came. Applets, scores and pictures stay.
        </p>
        <div className="os-prefs-row">
          {confirming ? (
            <>
              <span>Reset all preferences?</span>
              <button type="button" className="os-button" onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="os-button os-button-primary"
                onClick={() => {
                  try {
                    resetPreferences(window.localStorage);
                  } catch {}
                  reset();
                  window.location.reload();
                }}
              >
                Reset
              </button>
            </>
          ) : (
            <button type="button" className="os-button" onClick={() => setConfirming(true)}>
              Reset Preferences…
            </button>
          )}
        </div>
      </Group>
    </>
  );
}
