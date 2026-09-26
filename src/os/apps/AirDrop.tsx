import { useMemo, useState } from 'react';
import { useOSData } from '../core/context';
import type { AppProps } from '../core/registry';
import { apps, launch } from '../core/registry';
import { buildDisk, find } from '../core/files';
import { AirDropIcon } from '../core/icons';
import { useWindows } from '../core/store';
import type { AppId } from '../core/types';
import { flag } from '../social/Presence';
import { hue } from '../social/chatState';
import { useAccount } from '../social/account';
import {
  labelOf,
  PATH_MIME,
  reachable,
  sendAirDrop,
  setDiscoverable,
  useAirDrop,
  type Discoverable,
  type Transfer
} from '../social/airdrop';
import type { Visitor } from '../social/types';

// AirDrop, as Lion's window: other members on the desktop appear around a
// radar with you in the middle, and a file from Macintosh HD (dropped on
// someone, or chosen with "Share with AirDrop…") goes to whoever's
// clicked. They get to accept or decline. It's for members: signed out,
// the window asks you to sign in, as ryOS's does.

/** Where a person sits: evenly round the inner ring, then the outer one, turned a little by who they are. */
function spot(id: string, i: number, count: number) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  const inner = Math.min(count, 6);
  const ring = i < 6 ? 0 : 1;
  const slots = ring === 0 ? inner : count - 6;
  const angle = ((ring === 0 ? i : i - 6) / slots) * 2 * Math.PI + (ring === 0 ? -Math.PI / 2 : -Math.PI / 3) + (h % 20) * 0.01;
  const r = ring === 0 ? 31 : 44;
  return { left: `${50 + r * Math.cos(angle)}%`, top: `${50 + r * 0.82 * Math.sin(angle)}%` };
}

const STATE_LABEL: Record<Transfer['state'], string> = {
  waiting: 'Waiting…',
  accepted: 'Sent',
  declined: 'Declined',
  unanswered: 'No answer'
};

function Avatar({ name, size }: { name: string; size?: 'small' }) {
  return (
    <span className="os-airdrop-avatar" data-size={size} style={{ '--hue': hue(name) } as React.CSSProperties}>
      {name[0]?.toUpperCase()}
    </span>
  );
}

function Person({
  visitor,
  style,
  transfer,
  ready,
  onSend
}: {
  visitor: Visitor;
  style: React.CSSProperties;
  transfer?: Transfer;
  ready: boolean;
  onSend: (path?: string) => void;
}) {
  const [over, setOver] = useState(false);
  const label = labelOf(visitor);
  const where = visitor.city ? `${flag(visitor.country)} ${visitor.city}`.trim() : null;
  return (
    <button
      type="button"
      className="os-airdrop-person"
      style={style}
      data-over={over || undefined}
      data-state={transfer?.state}
      aria-disabled={!ready || undefined}
      title={ready ? `Send to ${label}` : `Drop something on ${label} to send it`}
      onClick={() => ready && onSend()}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(PATH_MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const path = e.dataTransfer.getData(PATH_MIME);
        if (path) onSend(path);
      }}
    >
      <Avatar name={label} />
      <span className="os-airdrop-name">{label}</span>
      <span className="os-airdrop-where">{transfer ? STATE_LABEL[transfer.state] : where}</span>
    </button>
  );
}

/** Signed out: what AirDrop is, and a way in. */
function SignIn({ available }: { available: boolean }) {
  return (
    <div className="os-app os-airdrop os-airdrop-gate">
      <AirDropIcon size={96} />
      <h2>AirDrop</h2>
      <p>
        {available
          ? 'Sign in to share photos, songs and projects with other people on this desktop.'
          : 'AirDrop needs the desktop’s connection, and it isn’t available right now.'}
      </p>
      {available && (
        <button type="button" className="os-button os-button-primary" onClick={() => launch('account', { props: { tab: 'sign-in', then: 'airdrop' } })}>
          Sign In…
        </button>
      )}
    </div>
  );
}

export default function AirDrop({ win }: AppProps) {
  const data = useOSData();
  const { account, available, ready: accountsReady } = useAccount();
  const visitors = useWindows((s) => s.visitors);
  const { discoverable, sent } = useAirDrop();
  // The receiver's view of the disk has every applet; so does the sender's, to share one.
  const disk = useMemo(() => buildDisk(data, (Object.keys(apps) as AppId[]).filter((id) => apps[id].applet)), [data]);
  const [dismissed, setDismissed] = useState<string | null>(null);

  if (!accountsReady) return <div className="os-app os-airdrop" />;
  if (!account) return <SignIn available={available} />;

  const path = win.props?.path && win.props.path !== dismissed ? win.props.path : null;
  const item = path ? find(disk, path) : null;
  const people = reachable(visitors);
  const offline = visitors === null;

  const send = (to: Visitor, dropped?: string) => {
    const node = dropped ? find(disk, dropped) : item;
    if (node) sendAirDrop(to, node);
  };
  /** The latest transfer to someone, of what's being shared (or of anything, after a drop). */
  const latest = (to: Visitor) => [...sent].reverse().find((t) => t.to === to.id && (!item || t.path === item.path));

  return (
    <div className="os-app os-airdrop">
      {item && (
        <div className="os-airdrop-sharing">
          {item.thumb ? <img src={item.thumb} alt="" /> : <item.Icon size={32} />}
          <p>
            Send <strong>“{item.name}”</strong> to…
          </p>
          <button type="button" className="os-button" onClick={() => setDismissed(path)}>
            Done
          </button>
        </div>
      )}

      <div className="os-airdrop-radar" aria-label="People nearby">
        <span className="os-airdrop-rings" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="os-airdrop-pulse" aria-hidden="true">
          <i />
          <i />
        </span>
        <div className="os-airdrop-me">
          <Avatar name={account.username} size="small" />
          <span>{account.username}</span>
        </div>
        {people.slice(0, 14).map((v, i, all) => (
          <Person
            key={v.id}
            visitor={v}
            style={spot(v.id, i, all.length)}
            transfer={latest(v)}
            ready={!!item}
            onSend={(dropped) => send(v, dropped)}
          />
        ))}
      </div>

      <div className="os-airdrop-footer">
        <p>
          {offline
            ? 'AirDrop can’t reach anyone right now.'
            : people.length === 0
              ? 'Looking for people nearby… Other signed-in members on the desktop appear here.'
              : item
                ? 'Click someone to send it. They’ll be asked to accept.'
                : 'Drag a file from Finder onto someone, or use Share with AirDrop… in Finder, Photos or a project.'}
        </p>
        <label>
          Allow me to be discovered by:{' '}
          <select value={discoverable} onChange={(e) => setDiscoverable(e.target.value as Discoverable)}>
            <option value="everyone">Everyone</option>
            <option value="none">No One</option>
          </select>
        </label>
      </div>
    </div>
  );
}
