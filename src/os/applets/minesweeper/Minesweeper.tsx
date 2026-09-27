import { useEffect, useRef, useState } from 'react';
import { play, resizeWindow, saved, type AppProps } from '../../kit';
import { blank, cleared, layMines, LEVELS, reveal, targetsOf, type Cell, type Level, type Status } from './rules';

// Minesweeper. The first click is always safe (mines are laid after it),
// right-click or long-press flags, and clicking a number whose flags are
// all placed opens its neighbours. Best times are kept in this browser.

const best = saved<Partial<Record<Level, number>>>('minesweeper', 'best');

const pad = (n: number) => String(Math.max(-99, Math.min(999, n))).padStart(3, '0');

export default function Minesweeper({ win }: AppProps) {
  const [level, setLevel] = useState<Level>('beginner');
  const { cols, rows, mines } = LEVELS[level];
  const [cells, setCells] = useState(() => blank(cols, rows));
  const [status, setStatus] = useState<Status>('ready');
  const [started, setStarted] = useState(0);
  const [now, setNow] = useState(0);
  const [pressing, setPressing] = useState(false);
  const [lastHit, setLastHit] = useState<number | null>(null);
  const [bestTimes, setBestTimes] = useState(() => best.load({}));
  const longPress = useRef<{ timer: number; fired: boolean }>({ timer: 0, fired: false });

  /** Grows or shrinks the window to fit a level's board. */
  const fitWindow = (next: Level) => {
    const { cols: c, rows: r } = LEVELS[next];
    resizeWindow(win, Math.max(400, c * 25 + 60), r * 25 + 190);
  };

  const reset = (next: Level = level) => {
    if (next !== level) fitWindow(next);
    setLevel(next);
    setCells(blank(LEVELS[next].cols, LEVELS[next].rows));
    setStatus('ready');
    setStarted(0);
    setNow(0);
    setLastHit(null);
  };

  useEffect(() => {
    if (status !== 'playing') return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [status]);

  const seconds = started ? Math.floor(((status === 'playing' ? now || Date.now() : now) - started) / 1000) : 0;
  const flags = cells.filter((c) => c.flag).length;

  const finish = (next: Cell[], exploded: number | null) => {
    if (exploded !== null) {
      next.forEach((c) => c.mine && (c.open = true));
      setLastHit(exploded);
      setStatus('lost');
      setNow(Date.now());
      play('error');
      return;
    }
    if (cleared(next)) {
      next.forEach((c) => c.mine && (c.flag = true));
      const time = Math.floor((Date.now() - (started || Date.now())) / 1000);
      setStatus('won');
      setNow(Date.now());
      play('chime');
      if (bestTimes[level] === undefined || time < bestTimes[level]!) {
        const updated = { ...bestTimes, [level]: time };
        setBestTimes(updated);
        best.save(updated);
      }
    }
  };

  const open = (i: number) => {
    if (status === 'won' || status === 'lost' || cells[i].flag) return;
    let next = cells.map((c) => ({ ...c }));
    if (status === 'ready') {
      next = layMines(next, cols, rows, mines, i);
      setStatus('playing');
      setStarted(Date.now());
      setNow(Date.now());
    }
    // Chording: an open number with all its flags placed opens the rest around it.
    const targets = targetsOf(next, i, cols, rows);
    if (!targets.length) return;
    const safe = reveal(next, targets, cols, rows);
    setCells(next);
    finish(next, safe ? null : targets.find((n) => next[n].mine) ?? i);
    if (safe) play('click');
  };

  const flag = (i: number) => {
    if (status === 'won' || status === 'lost' || cells[i].open) return;
    setCells((all) => all.map((c, j) => (j === i ? { ...c, flag: !c.flag } : c)));
  };

  const face = status === 'lost' ? '😵' : status === 'won' ? '😎' : pressing ? '😮' : '🙂';

  return (
    <div className="os-app os-mines">
      <div className="os-toolbar">
        <div className="os-segmented" role="group" aria-label="Difficulty">
          {(Object.keys(LEVELS) as Level[]).map((l) => (
            <button key={l} type="button" aria-pressed={level === l} onClick={() => reset(l)}>
              {LEVELS[l].name}
            </button>
          ))}
        </div>
        <span className="os-toolbar-meta">{bestTimes[level] !== undefined ? `Best: ${bestTimes[level]}s` : 'No best time yet'}</span>
      </div>
      <div className="os-scroll os-mines-stage">
        <div className="os-mines-board" style={{ '--cols': cols } as React.CSSProperties}>
          <div className="os-mines-head">
            <output className="os-mines-lcd" aria-label="Mines left">
              {pad(mines - flags)}
            </output>
            <button type="button" className="os-mines-face" onClick={() => reset()} aria-label="New game">
              {face}
            </button>
            <output className="os-mines-lcd" aria-label="Seconds">
              {pad(seconds)}
            </output>
          </div>
          <div
            className="os-mines-grid"
            role="grid"
            aria-label={`${LEVELS[level].name} board`}
            onContextMenu={(e) => e.preventDefault()}
            onPointerUp={() => setPressing(false)}
            onPointerLeave={() => setPressing(false)}
          >
            {cells.map((c, i) => (
              <button
                key={i}
                type="button"
                role="gridcell"
                className="os-mines-cell"
                data-open={c.open || undefined}
                data-hit={i === lastHit || undefined}
                data-wrong={status === 'lost' && c.flag && !c.mine ? true : undefined}
                data-n={c.open && !c.mine && c.count ? c.count : undefined}
                aria-label={c.open ? (c.mine ? 'mine' : String(c.count || 'empty')) : c.flag ? 'flagged' : 'hidden'}
                onPointerDown={(e) => {
                  if (e.button === 2) return flag(i);
                  if (e.button !== 0) return;
                  setPressing(true);
                  if (e.pointerType === 'touch') {
                    longPress.current.fired = false;
                    longPress.current.timer = window.setTimeout(() => {
                      longPress.current.fired = true;
                      flag(i);
                      navigator.vibrate?.(15);
                    }, 380);
                  }
                }}
                onPointerUp={() => clearTimeout(longPress.current.timer)}
                onClick={() => {
                  if (longPress.current.fired) {
                    longPress.current.fired = false;
                    return;
                  }
                  open(i);
                }}
              >
                {c.open ? (c.mine ? '💣' : c.count || '') : c.flag ? '🚩' : ''}
              </button>
            ))}
          </div>
        </div>
        <p className="os-mines-hint">
          {status === 'won'
            ? `Cleared in ${seconds}s.`
            : status === 'lost'
              ? 'Boom. Click the face to try again.'
              : 'Right-click (or long-press) to flag. Click a number to open around it.'}
        </p>
      </div>
    </div>
  );
}
