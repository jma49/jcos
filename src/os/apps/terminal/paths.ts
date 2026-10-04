import type { FileNode } from '../../core/files';

// What the Terminal makes of a command line and the paths in it, kept
// apart from the window so it can be tested.

/**
 * A command line's words, as zsh splits them: on spaces, but not inside
 * quotes or after a backslash. Single quotes keep everything as typed;
 * inside double quotes a backslash escapes only \ " $ and `. A quote left
 * open runs to the end of the line.
 */
export function words(line: string): string[] {
  const out: string[] = [];
  let word = '';
  let started = false;
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote === "'") {
      if (c === "'") quote = null;
      else word += c;
    } else if (quote === '"') {
      if (c === '"') quote = null;
      else if (c === '\\' && i + 1 < line.length && '\\"$`'.includes(line[i + 1])) word += line[++i];
      else word += c;
    } else if (c === "'" || c === '"') {
      quote = c;
      started = true;
    } else if (c === '\\') {
      if (i + 1 < line.length) word += line[++i];
      started = true;
    } else if (/\s/.test(c)) {
      if (started) out.push(word);
      word = '';
      started = false;
    } else {
      word += c;
      started = true;
    }
  }
  if (started) out.push(word);
  return out;
}

/** A path typed in the Terminal, made absolute against the working folder, as its parts. */
function absolute(cwd: string, typed: string): string[] {
  const parts = typed.startsWith('/') || typed.startsWith('~') ? [] : cwd.split('/').filter(Boolean);
  for (const part of typed.replace(/^~\/?/, '').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts;
}

/** What a typed path leads to: a node, a locked folder in the way (or at the end), or nothing. */
export type Found = { node: FileNode } | { denied: FileNode } | null;

/** The node at a typed path, matching names without regard to case. A locked folder can't be entered or listed. */
export function resolve(disk: FileNode, cwd: string, typed: string): Found {
  let node: FileNode = disk;
  for (const part of absolute(cwd, typed)) {
    if (node.locked) return { denied: node };
    const want = part.toLowerCase();
    const next = node.children?.find((c) => c.name.toLowerCase() === want || c.path.split('/').pop()?.toLowerCase() === want);
    if (!next) return null;
    node = next;
  }
  return node.locked ? { denied: node } : { node };
}
