import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useOSData } from '../core/context';
import { launch, openableApps } from '../core/registry';
import { useWindows } from '../core/store';
import type { AppProps } from '../core/registry';
import type { AppId, OSData } from '../core/types';
import { plain } from '../core/inline';
import { openProject } from './Projects';
import { HOME, placeLabel, searchPlaces, type Place } from '../ambient/place';
import { describe, getWeather } from '../ambient/weather';
import { getSocial } from '../social/social';
import { play } from '../core/sound';
import { useInstalledApplets } from '../core/applets';
import { buildDisk, type FileNode } from '../core/files';

interface Line {
  id: number;
  kind: 'input' | 'output' | 'error';
  content: ReactNode;
  /** The prompt an input line was typed at. */
  prompt?: string;
}

/** The prompt, with the working folder's name as zsh shows it ("~" for the disk). */
const promptFor = (cwd: string) => `jincheng@os ${cwd === '/' ? '~' : cwd.split('/').pop()} %`;

/** A path typed in the Terminal, made absolute against the working folder. */
function absolute(cwd: string, typed: string) {
  const parts = typed.startsWith('/') || typed.startsWith('~') ? [] : cwd.split('/').filter(Boolean);
  for (const part of typed.replace(/^~\/?/, '').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts;
}

/** The node at a typed path, matching names without regard to case. */
function resolve(disk: FileNode, cwd: string, typed: string): FileNode | null {
  let node: FileNode | undefined = disk;
  for (const part of absolute(cwd, typed)) {
    const want = part.toLowerCase();
    node = node?.children?.find((c) => c.name.toLowerCase() === want || c.path.split('/').pop()?.toLowerCase() === want);
    if (!node) return null;
  }
  return node ?? null;
}

/** How `ls` shows a name: folders with a slash, names with spaces quoted. */
const listed = (n: FileNode) => {
  const name = /\s/.test(n.name) ? `'${n.name}'` : n.name;
  return n.children ? `${name}/` : name;
};

const FORTUNES = [
  'There are two hard things in computer science: cache invalidation, naming things, and off-by-one errors.',
  'It works on my machine. Ship the machine.',
  'A flaky test is a test that is telling you something you don’t want to hear.',
  'The best time to write the test was before the bug. The second best time is now.',
  'Think different. Then write it down, because you’ll forget why.',
  'Premature optimization is the root of all evil. Late optimization is the root of all pager alerts.',
  'Every V6 was once a V0 you kept falling off.',
  'Aqua was never about the buttons. (It was a little about the buttons.)',
  'If it hurts, do it more often: deploys, reviews, and climbing.',
  'Weeks of coding can save you hours of planning.',
  'The quickest way to find a bug is to demo the feature.',
  'Real artists ship. — Steve Jobs'
];

/** A cow, saying something, as cowsay drew it. */
function cowsay(text: string) {
  const words = (text || 'Moo.').split(/\s+/);
  const lines: string[] = [];
  for (const w of words) {
    const last = lines[lines.length - 1];
    if (last !== undefined && (last + ' ' + w).length <= 36) lines[lines.length - 1] = `${last} ${w}`;
    else lines.push(w);
  }
  const width = Math.max(...lines.map((l) => l.length));
  const bubble =
    lines.length === 1
      ? [`< ${lines[0]} >`]
      : lines.map((l, i) => {
          const [a, b] = i === 0 ? ['/', '\\'] : i === lines.length - 1 ? ['\\', '/'] : ['|', '|'];
          return `${a} ${l.padEnd(width)} ${b}`;
        });
  return [
    ` ${'_'.repeat(width + 2)}`,
    ...bubble,
    ` ${'-'.repeat(width + 2)}`,
    '        \\   ^__^',
    '         \\  (oo)\\_______',
    '            (__)\\       )\\/\\',
    '                ||----w |',
    '                ||     ||'
  ].join('\n');
}

/** How long something's been going, the way `uptime` says it. */
function since(ms: number) {
  const m = Math.floor(ms / 60_000);
  if (m < 1) return `${Math.max(1, Math.floor(ms / 1000))} secs`;
  if (m < 60) return `${m} min${m === 1 ? '' : 's'}`;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

const COMMANDS: Record<string, string> = {
  help: 'list commands',
  whoami: 'who this is',
  about: 'the short bio',
  ls: 'list a folder on Macintosh HD: `ls Music`',
  cd: 'change folder: `cd Pictures`, `cd ..`',
  pwd: 'where you are',
  cat: 'print a document',
  open: 'open an app, project, file or URL',
  projects: 'list projects',
  contact: 'ways to reach me',
  theme: 'switch appearance: `theme light|dark`',
  neofetch: 'system summary',
  history: 'commands you have run',
  clear: 'clear the screen',
  date: 'current date and time',
  weather: 'weather where you are, or `weather <city>`',
  soapbox: 'what Jincheng posted lately',
  echo: 'print text',
  say: 'say something out loud (sound on)',
  cowsay: 'a cow says it',
  fortune: 'a fortune',
  uptime: 'how long this desktop has been up',
  exit: 'close this window'
};

/** What `open` knows by name. */
const APP_TARGETS: readonly string[] = openableApps;

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
  const [cwd, setCwd] = useState('/');
  const applets = useInstalledApplets();
  const disk = useMemo(() => buildDisk(data, applets), [data, applets]);
  const prompt = promptFor(cwd);
  const field = useRef<HTMLInputElement>(null);
  const screen = useRef<HTMLDivElement>(null);

  useEffect(() => {
    screen.current?.scrollTo({ top: screen.current.scrollHeight });
  }, [lines]);

  const slugs = data.projects.map((p) => p.slug);

  const print = (...items: { kind?: Line['kind']; content: ReactNode; prompt?: string }[]) =>
    setLines((ls) => [...ls, ...items.map((it) => ({ id: nextId.current++, kind: it.kind ?? 'output', content: it.content, prompt: it.prompt }))]);

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
      case 'ls': {
        const long = args[0] === '-l';
        const target = (long ? args.slice(1) : args).join(' ');
        const node = resolve(disk, cwd, target);
        if (!node) return print({ kind: 'error', content: `ls: ${target}: No such file or directory` });
        const items = node.children ?? [node];
        if (!items.length) return;
        if (!long) return print({ content: items.map(listed).join('   ') });
        return print(
          ...items.map((n) => ({
            content: `${n.children ? 'drwxr-xr-x' : '-rw-r--r--'}  jincheng  ${(n.date ? new Date(n.date).toDateString().slice(4) : '            ').padEnd(12)}  ${listed(n)}`
          }))
        );
      }
      case 'cd': {
        const node = resolve(disk, cwd, arg || '/');
        if (!node) return print({ kind: 'error', content: `cd: no such file or directory: ${arg}` });
        if (!node.children) return print({ kind: 'error', content: `cd: not a directory: ${arg}` });
        return setCwd(node.path);
      }
      case 'pwd':
        return print({ content: cwd === '/' ? '/Volumes/Macintosh HD' : `/Volumes/Macintosh HD${cwd}` });
      case 'cat': {
        const node = resolve(disk, cwd, arg);
        if (!arg) return print({ kind: 'error', content: 'usage: cat <file>' });
        if (!node) return print({ kind: 'error', content: `cat: ${arg}: No such file or directory` });
        if (node.children) return print({ kind: 'error', content: `cat: ${arg}: Is a directory` });
        if (node.path === '/Documents/About Me') return print(...data.bio.short.map((p) => ({ content: plain(p) })));
        const lines = node.look?.lines?.filter(Boolean);
        if (lines?.length) return print(...lines.map((l) => ({ content: l })));
        return print({ kind: 'error', content: `cat: ${node.name}: ${node.kind}; try \`open ${arg}\`` });
      }
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
        if (APP_TARGETS.includes(target)) {
          launch(target as AppId, target === 'terminal' ? { key: `terminal-${Date.now()}` } : {});
          return print({ content: `Opening ${target}…` });
        }
        const project = data.projects.find((p) => p.slug === target || p.title.toLowerCase() === target);
        if (project) {
          openProject(project);
          return print({ content: `Opening ${project.title}…` });
        }
        const file = resolve(disk, cwd, arg);
        if (file && file.path !== '/') {
          if (file.children) launch('finder', { props: { path: file.path } });
          else file.open?.(null);
          return print({ content: `Opening ${file.name}…` });
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
      case 'soapbox':
        getSocial()
          .then((social) => social?.listPosts())
          .then((posts) => {
            if (!posts) return print({ kind: 'error', content: 'soapbox: offline' });
            if (!posts.length) return print({ content: 'Nothing on the Soapbox yet.' });
            print(
              ...posts.slice(0, 3).flatMap((p) => [
                { content: `${p.kind === 'rant' ? '🔥' : '📝'} ${new Date(p.created_at).toDateString()}${p.place ? ` · ${p.place}` : ''}` },
                { content: `   ${p.body.split('\n')[0]}` }
              ]),
              { content: 'Type `open soapbox` for the rest.' }
            );
          })
          .catch(() => print({ kind: 'error', content: 'soapbox: offline' }));
        return;
      case 'echo':
        return print({ content: arg });
      case 'cowsay':
        return print({ content: <pre className="os-term-pre">{cowsay(arg)}</pre> });
      case 'fortune':
        return print({ content: FORTUNES[Math.floor(Math.random() * FORTUNES.length)] });
      case 'uptime': {
        const { visitors } = useWindows.getState();
        const users = visitors?.length ?? 1;
        const time = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        return print({ content: `${time}  up ${since(performance.now())}, ${users} user${users === 1 ? '' : 's'}, load averages: 0.42 0.37 0.31` });
      }
      case 'say': {
        if (!arg) return print({ kind: 'error', content: 'usage: say <text>' });
        const { soundOn, volume } = useWindows.getState();
        if (!soundOn) return print({ kind: 'error', content: 'say: sound is off (turn it on with the speaker in the menu bar)' });
        if (!('speechSynthesis' in window)) return print({ kind: 'error', content: 'say: this browser can’t speak' });
        const speech = new SpeechSynthesisUtterance(arg.slice(0, 300));
        speech.volume = volume;
        // Mac OS X's voice was Victoria, then Alex; take something English.
        speech.voice = speechSynthesis.getVoices().find((v) => /Alex|Samantha|Daniel/.test(v.name)) ?? null;
        speechSynthesis.cancel();
        speechSynthesis.speak(speech);
        return;
      }
      case 'sudo':
        return print({ kind: 'error', content: 'Nice try. This incident will be reported.' });
      case 'exit':
        return useWindows.getState().close(win.id);
      default:
        play('error');
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
    // Paths: complete the last part against the folder it's in.
    const typed = parts.slice(1).join(' ');
    const slash = typed.lastIndexOf('/');
    const [dir, stem] = slash >= 0 ? [typed.slice(0, slash + 1), typed.slice(slash + 1)] : ['', typed];
    const folder = resolve(disk, cwd, dir || '.');
    const names = (folder?.children ?? [])
      .filter((c) => (parts[0] === 'cd' ? c.children : true))
      .map((c) => `${c.name}${c.children ? '/' : ''}`);
    const pool = parts[0] === 'open' && !dir ? [...APP_TARGETS, ...slugs, ...names] : names;
    const matches = [...new Set(pool)].filter((t) => t.toLowerCase().startsWith(stem.toLowerCase()));
    if (matches.length === 1) setInput(`${parts[0]} ${dir}${matches[0]}`);
    else if (matches.length > 1) print({ content: matches.join('   ') });
  };

  return (
    <div className="os-app os-terminal" onClick={() => field.current?.focus()}>
      <div ref={screen} className="os-scroll os-term-screen">
        {lines.map((l) => (
          <div key={l.id} className={`os-term-line os-term-${l.kind}`}>
            {l.kind === 'input' && <span className="os-term-prompt">{l.prompt}</span>}
            {l.content}
          </div>
        ))}
        <form
          className="os-term-line"
          onSubmit={(e) => {
            e.preventDefault();
            print({ kind: 'input', content: input, prompt });
            if (input.trim()) setHistory((h) => [...h, input.trim()]);
            setCursor(null);
            run(input);
            setInput('');
          }}
        >
          <label className="os-term-prompt" htmlFor={`${win.id}-input`}>
            {prompt}
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
