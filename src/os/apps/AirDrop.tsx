import { useMemo, useState } from 'react';
import { useOSData } from '../core/context';
import type { AppProps } from '../core/registry';
import { apps } from '../core/registry';
import { buildDisk, find } from '../core/files';
import { useWindows } from '../core/store';
import type { AppId } from '../core/types';
import { flag } from '../social/Presence';
import { hue } from '../social/chatState';
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

// AirDrop, as Lion's window: everyone else on the desktop appears around a
// radar, and a file from Macintosh HD (dropped on someone, or chosen with
// "Share with AirDrop…") goes to whoever's clicked. They get to accept or
// decline. Below, whether others can find this visitor.

/** Where a person sits on the radar: a steady angle from their id, rings filling outwards. */
function spot(id: string, i: number) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  const ring = i < 6 ? 0 : 1;
  const angle = ((h + i * 60) % 360) * (Math.PI / 180);
  const r = ring === 0 ? 30 : 42;
  return { left: `${50 + r * Math.cos(angle)}%`, top: `${48 + r * 0.8 * Math.sin(angle)}%` };
}

const STATE_LABEL: Record<Transfer['state'], string> = {
  waiting: 'Waiting…',
  accepted: 'Sent',
  declined: 'Declined',
  unanswered: 'No answer'
};

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
  const initial = visitor.username?.[0]?.toUpperCase() ?? (flag(visitor.country) || '?');
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
      <span
        className="os-airdrop-avatar"
        style={{ '--hue': hue(visitor.username ?? visitor.city ?? visitor.id) } as React.CSSProperties}
        data-flag={!visitor.username || undefined}
      >
        {initial}
      </span>
      <span className="os-airdrop-name">{label}</span>
      {visitor.username && visitor.city && <span className="os-airdrop-where">{`${flag(visitor.country)} ${visitor.city}`.trim()}</span>}
      {transfer && <span className="os-airdrop-state">{STATE_LABEL[transfer.state]}</span>}
    </button>
  );
}

export default function AirDrop({ win }: AppProps) {
  const data = useOSData();
  const visitors = useWindows((s) => s.visitors);
  const { discoverable, sent } = useAirDrop();
  // The receiver's view of the disk has every applet; so does the sender's, to share one.
  const disk = useMemo(() => buildDisk(data, (Object.keys(apps) as AppId[]).filter((id) => apps[id].applet)), [data]);
  const [dismissed, setDismissed] = useState<string | null>(null);
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
          {item.thumb ? <img src={item.thumb} alt="" /> : <item.Icon size={36} />}
          <p>
            Choose who to send <strong>“{item.name}”</strong> to.
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
        {offline && <p className="os-airdrop-empty">AirDrop needs the desktop’s connection, and it isn’t available right now.</p>}
        {!offline && people.length === 0 && (
          <p className="os-airdrop-empty">
            Nobody else is on the desktop right now.
            <br />
            When someone is, they’ll appear here.
          </p>
        )}
        {people.slice(0, 12).map((v, i) => (
          <Person key={v.id} visitor={v} style={spot(v.id, i)} transfer={latest(v)} ready={!!item} onSend={(dropped) => send(v, dropped)} />
        ))}
      </div>

      <div className="os-airdrop-footer">
        <p>
          {item
            ? 'They’ll be asked to accept it.'
            : 'Drag a file from Finder onto someone, or choose Share with AirDrop… in Finder, Photos or a project.'}
          {' '}AirDrop only sends things from Macintosh HD, and anyone on the desktop could see what was offered.
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
