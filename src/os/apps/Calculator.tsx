import { useEffect, useRef, useState } from 'react';
import type { AppProps } from '../core/registry';
import { play } from '../core/sound';

// A four-function calculator in the style of Mac OS X's: an LCD, Aqua keys,
// and the keyboard works too (digits, + − × ÷, Enter, Esc, %, Backspace).

type Op = '+' | '−' | '×' | '÷';

interface State {
  /** What the display shows. */
  entry: string;
  /** The left-hand side waiting for an operator's right-hand side. */
  stored: number | null;
  op: Op | null;
  /** The next digit starts a new number. */
  fresh: boolean;
  /** For repeated "=": the last operator and right-hand side. */
  repeat: { op: Op; value: number } | null;
}

const START: State = { entry: '0', stored: null, op: null, fresh: true, repeat: null };

function apply(a: number, op: Op, b: number) {
  switch (op) {
    case '+':
      return a + b;
    case '−':
      return a - b;
    case '×':
      return a * b;
    case '÷':
      return b === 0 ? NaN : a / b;
  }
}

/** Up to 12 significant digits, no float noise ("0.1 + 0.2" shows 0.3). */
function show(n: number) {
  if (!Number.isFinite(n)) return 'Error';
  const rounded = Number.parseFloat(n.toPrecision(12));
  const text = String(rounded);
  return text.length > 14 ? rounded.toExponential(6) : text;
}

function reduce(s: State, key: string): State {
  if (s.entry === 'Error' && key !== 'C') return s;
  const value = Number.parseFloat(s.entry);
  if (/^\d$/.test(key)) {
    if (s.fresh) return { ...s, entry: key, fresh: false };
    if (s.entry.replace(/[-.]/g, '').length >= 12) return s;
    return { ...s, entry: s.entry === '0' ? key : s.entry + key };
  }
  switch (key) {
    case '.':
      if (s.fresh) return { ...s, entry: '0.', fresh: false };
      return s.entry.includes('.') ? s : { ...s, entry: `${s.entry}.` };
    case 'C':
      return START;
    case '±':
      return { ...s, entry: s.entry.startsWith('-') ? s.entry.slice(1) : s.entry === '0' ? '0' : `-${s.entry}` };
    case '%':
      return { ...s, entry: show(s.stored !== null && (s.op === '+' || s.op === '−') ? (s.stored * value) / 100 : value / 100), fresh: true };
    case '⌫':
      if (s.fresh) return s;
      return { ...s, entry: s.entry.length > 1 && s.entry !== '-0' ? s.entry.slice(0, -1).replace(/^-$/, '0') : '0' };
    case '=': {
      if (s.op && s.stored !== null) {
        const result = apply(s.stored, s.op, value);
        return { entry: show(result), stored: null, op: null, fresh: true, repeat: { op: s.op, value } };
      }
      if (s.repeat) return { ...s, entry: show(apply(value, s.repeat.op, s.repeat.value)), fresh: true };
      return { ...s, fresh: true };
    }
    default: {
      const op = key as Op;
      // Chain: 2 + 3 × shows 5, then waits for the next number.
      if (s.op && s.stored !== null && !s.fresh) {
        const result = apply(s.stored, s.op, value);
        return { entry: show(result), stored: result, op, fresh: true, repeat: null };
      }
      return { ...s, stored: value, op, fresh: true, repeat: null };
    }
  }
}

const KEYS: { key: string; label?: string; kind?: 'op' | 'fn' | 'eq'; wide?: boolean }[] = [
  { key: 'C', kind: 'fn' },
  { key: '±', kind: 'fn' },
  { key: '%', kind: 'fn' },
  { key: '÷', kind: 'op' },
  { key: '7' },
  { key: '8' },
  { key: '9' },
  { key: '×', kind: 'op' },
  { key: '4' },
  { key: '5' },
  { key: '6' },
  { key: '−', kind: 'op' },
  { key: '1' },
  { key: '2' },
  { key: '3' },
  { key: '+', kind: 'op' },
  { key: '0', wide: true },
  { key: '.' },
  { key: '=', kind: 'eq' }
];

const KEYBOARD: Record<string, string> = {
  '+': '+',
  '-': '−',
  '*': '×',
  x: '×',
  '/': '÷',
  Enter: '=',
  '=': '=',
  Escape: 'C',
  c: 'C',
  Backspace: '⌫',
  '%': '%',
  '.': '.',
  ',': '.'
};

export default function Calculator(_: AppProps) {
  const [state, setState] = useState(START);
  const [pressed, setPressed] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  const press = (key: string) => {
    setState((s) => reduce(s, key));
    play('click');
  };

  useEffect(() => root.current?.focus(), []);

  return (
    <div
      ref={root}
      className="os-app os-calc"
      tabIndex={-1}
      onKeyDown={(e) => {
        const key = /^\d$/.test(e.key) ? e.key : KEYBOARD[e.key];
        if (!key || e.metaKey || e.ctrlKey || e.altKey) return;
        e.preventDefault();
        setPressed(key);
        press(key);
      }}
      onKeyUp={() => setPressed(null)}
    >
      <output className="os-calc-lcd" aria-live="polite">
        <small>{state.op && state.stored !== null ? `${show(state.stored)} ${state.op}` : ' '}</small>
        {state.entry}
      </output>
      <div className="os-calc-keys">
        {KEYS.map(({ key, kind, wide }) => (
          <button
            key={key}
            type="button"
            data-kind={kind}
            data-wide={wide || undefined}
            data-active={(kind === 'op' && state.op === key && state.fresh) || pressed === key || undefined}
            onClick={() => press(key)}
            aria-label={key === '−' ? 'minus' : key === '×' ? 'times' : key === '÷' ? 'divided by' : undefined}
          >
            {key}
          </button>
        ))}
      </div>
    </div>
  );
}
