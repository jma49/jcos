import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useOSData } from '../context';
import { launch } from '../registry';
import { useWindows } from '../store';
import type { AppProps } from '../registry';
import type { OSData } from '../types';
import { plain } from './inline';
import { openProject } from './Projects';
import { HOME, placeLabel, searchPlaces, type Place } from '../place';
import { describe, getWeather } from '../weather';

interface Line {
  id: number;
  kind: 'input' | 'output' | 'error';
  content: ReactNode;
}

const PROMPT = 'jincheng@os ~ %';

const COMMANDS: Record<string, string> = {
  help: 'list commands',
  whoami: 'who this is',
  about: 'the short bio',
  ls: 'list the desktop, or `ls projects`',
  open: 'open an app, project or URL',
  projects: 'list projects',
  contact: 'ways to reach me',
  theme: 'switch appearance: `theme light|dark`',
  neofetch: 'system summary',
  history: 'commands you have run',
  clear: 'clear the screen',
  date: 'current date and time',
  weather: 'weather where you are, or `weather <city>`',
  echo: 'print text',
  exit: 'close this window'
};

const APP_TARGETS = ['about', 'resume', 'projects', 'photos', 'stickies', 'terminal', 'browser'] as const;

function neofetch(data: OSData): ReactNode {
  const art = [
    '     ██╗███╗   ███╗',
    '     ██║████╗ ████║',
    '     ██║██╔████╔██║',
    '██   ██║██║╚██╔╝██║',
    '╚█████╔╝██║ ╚═╝ ██║',
    ' ╚════╝ ╚═╝     ╚═╝'
  ];
  const info: [string, string][] = [
    ['OS', 'JM/OS 0.1 (prototype)'],
    ['Host', data.name],
    ['Role', data.role],
    ['Location', data.location],
    ['Shell', 'Astro + React + Zustand'],
    ['Projects', String(data.projects.length)],
    ['Uptime', `${Math.round(performance.now() / 1000)}s`]
  ];
  return (
    <div className="os-neofetch">
      <pre>{art.join('\n')}</pre>
      <div>
        {info.map(([k, v]) => (
          <div key={k}>
            <b>{k}</b>: {v}
          </div>
        ))}
        <div className="os-swatches" aria-hidden="true">
          {['#2b2a28', '#e2532d', '#3f7cb8', '#7c9a7e', '#e9d8b4', '#fbfaf7'].map((c) => (
            <span key={c} style={{ background: c }} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Terminal({ win }: AppProps) {
  const data = useOSData();
  const [lines, setLines] = useState<Line[]>(() => [
    { id: 0, kind: 'output', content: `Last login: ${new Date().toDateString()} on ttys000` },
    { id: 1, kind: 'output', content: 'Type `help` to see what you can do here.' }
  ]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const nextId = useRef(2);
  const field = useRef<HTMLInputElement>(null);
  const screen = useRef<HTMLDivElement>(null);

  useEffect(() => {
    screen.current?.scrollTo({ top: screen.current.scrollHeight });
  }, [lines]);

  const slugs = data.projects.map((p) => p.slug);

  const print = (...items: { kind?: Line['kind']; content: ReactNode }[]) =>
    setLines((ls) => [...ls, ...items.map((it) => ({ id: nextId.current++, kind: it.kind ?? 'output', content: it.content }))]);

  const run = (raw: string) => {
    const [cmd = '', ...args] = raw.trim().split(/\s+/);
    const arg = args.join(' ');
    switch (cmd) {
      case '':
        return;
      case 'help':
        return print({
          content: (
            <div className="os-term-table">
              {Object.entries(COMMANDS).map(([c, d]) => (
                <div key={c}>
                  <b>{c}</b>
                  <span>{d}</span>
                </div>
              ))}
            </div>
          )
        });
      case 'whoami':
        return print({ content: `${data.name} — ${data.role}, ${data.location}` });
      case 'about':
        return print(...data.bio.short.map((p) => ({ content: plain(p) })));
      case 'ls':
        if (arg === 'projects' || arg === 'projects/')
          return print({ content: data.projects.map((p) => `${p.slug}/`).join('   ') });
        return print({ content: 'About.txt   Résumé   Projects/   Photos/   Stickies.app   Terminal.app' });
      case 'projects':
        return print(
          ...data.projects.map((p) => ({
            content: (
              <span>
                <b>{p.slug.padEnd(16)}</b>
                {(p.status === 'wip' ? 'in progress' : p.when).padEnd(12)}{p.description}
              </span>
            )
          }))
        );
      case 'open': {
        const target = arg.toLowerCase();
        if (!target) return print({ kind: 'error', content: 'usage: open <app|project|url>' });
        if ((APP_TARGETS as readonly string[]).includes(target)) {
          launch(target as (typeof APP_TARGETS)[number], target === 'terminal' ? { key: `terminal-${Date.now()}` } : {});
          return print({ content: `Opening ${target}…` });
        }
        const project = data.projects.find((p) => p.slug === target || p.title.toLowerCase() === target);
        if (project) {
          openProject(project);
          return print({ content: `Opening ${project.title}…` });
        }
        if (/^(https?:\/\/)?[\w-]+(\.[\w-]+)+/.test(target)) {
          launch('browser', { props: { url: /^https?:/.test(arg) ? arg : `https://${arg}` } });
          return print({ content: `Opening ${arg} in Browser…` });
        }
        return print({ kind: 'error', content: `open: no such app or project: ${arg}` });
      }
      case 'contact':
        return print(
          { content: `email     ${data.email}` },
          { content: `github    ${data.links.github}` },
          { content: `linkedin  ${data.links.linkedin}` },
          { content: `photos    ${data.links.photography}` }
        );
      case 'theme': {
        const next = arg === 'dark' || arg === 'light' ? arg : useWindows.getState().theme === 'dark' ? 'light' : 'dark';
        useWindows.getState().setTheme(next);
        return print({ content: `Appearance set to ${next}.` });
      }
      case 'neofetch':
        return print({ content: neofetch(data) });
      case 'history':
        return print(...history.map((h, i) => ({ content: `${String(i + 1).padStart(4)}  ${h}` })));
      case 'clear':
        return setLines([]);
      case 'date':
        return print({ content: new Date().toString() });
      case 'weather': {
        const here = useWindows.getState().place ?? HOME;
        const find: Promise<Place | undefined> = arg ? searchPlaces(arg).then((found) => found[0]) : Promise.resolve(here);
        find
          .then((place) => {
            if (!place) return print({ kind: 'error', content: `weather: no such place: ${arg}` });
            return getWeather(place).then((w) => {
              const { icon, label } = describe(w.condition);
              print(
                { content: `${placeLabel(place)}` },
                { content: `${icon}  ${w.temp}°${w.unit}, ${label.toLowerCase()} · high ${w.high}° low ${w.low}°` }
              );
            });
          })
          .catch(() => print({ kind: 'error', content: 'weather: the forecast service is unreachable' }));
        return;
      }
      case 'echo':
        return print({ content: arg });
      case 'sudo':
        return print({ kind: 'error', content: 'Nice try. This incident will be reported.' });
      case 'exit':
        return useWindows.getState().close(win.id);
      default:
        return print({ kind: 'error', content: `zsh: command not found: ${cmd}` });
    }
  };

  const complete = () => {
    const parts = input.split(' ');
    if (parts.length === 1) {
      const matches = Object.keys(COMMANDS).filter((c) => c.startsWith(parts[0]));
      if (matches.length === 1) setInput(`${matches[0]} `);
      else if (matches.length > 1) print({ content: matches.join('   ') });
      return;
    }
    if (parts[0] === 'open') {
      const pool = [...APP_TARGETS, ...slugs];
      const matches = pool.filter((t) => t.startsWith(parts[1]));
      if (matches.length === 1) setInput(`open ${matches[0]}`);
      else if (matches.length > 1) print({ content: matches.join('   ') });
    }
  };

  return (
    <div className="os-app os-terminal" onClick={() => field.current?.focus()}>
      <div ref={screen} className="os-scroll os-term-screen">
        {lines.map((l) => (
          <div key={l.id} className={`os-term-line os-term-${l.kind}`}>
            {l.kind === 'input' && <span className="os-term-prompt">{PROMPT}</span>}
            {l.content}
          </div>
        ))}
        <form
          className="os-term-line"
          onSubmit={(e) => {
            e.preventDefault();
            print({ kind: 'input', content: input });
            if (input.trim()) setHistory((h) => [...h, input.trim()]);
            setCursor(null);
            run(input);
            setInput('');
          }}
        >
          <label className="os-term-prompt" htmlFor={`${win.id}-input`}>
            {PROMPT}
          </label>
          <input
            id={`${win.id}-input`}
            ref={field}
            value={input}
            autoFocus
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Tab') {
                e.preventDefault();
                complete();
              } else if (e.key === 'ArrowUp' && history.length) {
                e.preventDefault();
                const i = cursor === null ? history.length - 1 : Math.max(0, cursor - 1);
                setCursor(i);
                setInput(history[i]);
              } else if (e.key === 'ArrowDown' && cursor !== null) {
                e.preventDefault();
                const i = cursor + 1;
                setCursor(i < history.length ? i : null);
                setInput(i < history.length ? history[i] : '');
              } else if (e.key === 'l' && e.ctrlKey) {
                e.preventDefault();
                setLines([]);
              }
            }}
          />
        </form>
      </div>
    </div>
  );
}
