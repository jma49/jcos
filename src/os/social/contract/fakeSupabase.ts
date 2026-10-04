// A stand-in for supabase-js's client, for the contract tests: the calls
// the Supabase slices make (from(), rpc(), auth, channels, functions),
// recorded, and answered with what a test primes, or else with what an
// empty database would answer. It holds no rules: the database's are
// tested against Postgres (supabase/tests/rules.sql, race.sh), so a test
// primes the answer the database gives (a row, none, or a refusal's
// code) and checks what the slice makes of it, and what it asked.

import type { Client } from '../supabase/context';

export interface Call {
  /** The table, or the function for an rpc. */
  target: string;
  op: 'select' | 'insert' | 'update' | 'delete' | 'rpc';
  /** What was inserted, updated, or passed to the function. */
  payload?: unknown;
  /** The filters, in order: ['eq', 'id', 'x'], ['lt', 'created_at', '…']. */
  filters: unknown[][];
}

export interface Answer {
  data?: unknown;
  error?: { code: string; message: string } | null;
}

interface FakeUser {
  id: string;
  email: string;
  password: string;
  user_metadata: { username: string };
}

export function fakeSupabase() {
  /** Answers primed by a test, by `table.op` or `rpc.name`, each used once. */
  const primed = new Map<string, Answer[]>();
  const calls: Call[] = [];
  const users = new Map<string, FakeUser>();
  const authListeners = new Set<(event: string, session: { user: FakeUser } | null) => void>();
  let session: { user: FakeUser } | null = null;
  /** The account the database's is_owner() says yes to. */
  let ownerName: string | null = null;
  const channels = { made: [] as string[], removed: [] as string[] };

  const take = (key: string): Answer | undefined => primed.get(key)?.shift();

  // What an empty database answers a function, unless primed.
  const functions: Record<string, (args: Record<string, unknown>) => unknown> = {
    username_available: ({ name }) => ![...users.values()].some((u) => u.user_metadata.username === name),
    is_owner: () => !!session && session.user.user_metadata.username === ownerName,
    member_limits: () => [{ notes_per_day: 3, stickies: 50, events: 5000, todos: 1000 }],
    notes_left: () => (session ? 3 : 0),
    my_reactions: () => [],
    chat_activity: () => []
  };

  const query = (target: string) => {
    const call: Call = { target, op: 'select', filters: [] };
    let one = false;
    const filter =
      (name: string) =>
      (...args: unknown[]) => {
        call.filters.push([name, ...args]);
        return builder;
      };
    const builder = {
      select: () => builder,
      insert: (payload: unknown) => ((call.op = 'insert'), (call.payload = payload), builder),
      update: (payload: unknown) => ((call.op = 'update'), (call.payload = payload), builder),
      delete: () => ((call.op = 'delete'), builder),
      eq: filter('eq'),
      lt: filter('lt'),
      gte: filter('gte'),
      lte: filter('lte'),
      in: filter('in'),
      order: () => builder,
      limit: () => builder,
      single: () => ((one = true), builder),
      maybeSingle: () => ((one = true), builder),
      then<T>(resolve: (value: { data: unknown; error: Answer['error'] }) => T, reject?: (reason: unknown) => T) {
        calls.push(call);
        const answer = take(`${target}.${call.op}`) ?? {};
        const empty = one || call.op !== 'select' ? null : [];
        return Promise.resolve({ data: answer.data === undefined ? empty : answer.data, error: answer.error ?? null }).then(resolve, reject);
      }
    };
    return builder;
  };

  const channel = (name: string) => {
    channels.made.push(name);
    const made = {
      name,
      on: () => made,
      subscribe: (status?: (s: string) => void) => (status?.('SUBSCRIBED'), made),
      presenceState: () => ({}),
      track: async () => 'ok',
      send: async () => 'ok'
    };
    return made;
  };

  const signedIn = (user: FakeUser) => {
    session = { user };
    authListeners.forEach((l) => l('SIGNED_IN', session));
    return { user, session };
  };

  const client = {
    from: query,
    rpc(name: string, args: Record<string, unknown> = {}) {
      const call: Call = { target: name, op: 'rpc', payload: args, filters: [] };
      return {
        then<T>(resolve: (value: { data: unknown; error: Answer['error'] }) => T, reject?: (reason: unknown) => T) {
          calls.push(call);
          const answer = take(`rpc.${name}`);
          const data = answer ? (answer.data ?? null) : (functions[name]?.(args) ?? null);
          return Promise.resolve({ data, error: answer?.error ?? null }).then(resolve, reject);
        }
      };
    },
    auth: {
      onAuthStateChange(listener: (event: string, session: { user: FakeUser } | null) => void) {
        authListeners.add(listener);
        return { data: { subscription: { unsubscribe: () => authListeners.delete(listener) } } };
      },
      async getSession() {
        return { data: { session } };
      },
      async signUp({ email, password, options }: { email: string; password: string; options: { data: { username: string } } }) {
        if (users.has(email)) return { data: { user: null, session: null }, error: { message: 'User already registered' } };
        const user: FakeUser = { id: crypto.randomUUID(), email, password, user_metadata: { username: options.data.username } };
        users.set(email, user);
        return { data: signedIn(user), error: null };
      },
      async signInWithPassword({ email, password }: { email: string; password: string }) {
        const user = users.get(email);
        if (!user || user.password !== password) return { data: { user: null, session: null }, error: { message: 'Invalid login credentials' } };
        return { data: signedIn(user), error: null };
      },
      async signOut() {
        session = null;
        authListeners.forEach((l) => l('SIGNED_OUT', null));
        return { error: null };
      }
    },
    functions: {
      async invoke(name: string, { body }: { body: unknown }) {
        calls.push({ target: name, op: 'rpc', payload: body, filters: [] });
        const answer = take(`functions.${name}`) ?? { data: {} };
        return { data: answer.data ?? null, error: answer.error ?? null };
      }
    },
    channel,
    removeChannel: async (made: { name: string }) => {
      channels.removed.push(made.name);
      return 'ok';
    }
  };

  return {
    client: client as unknown as Client,
    calls,
    channels,
    /** Primes the database's next answer to `key` (`table.op`, `rpc.name` or `functions.name`). */
    answer(key: string, answer: Answer) {
      primed.set(key, [...(primed.get(key) ?? []), answer]);
    },
    /** Primes a refusal: the error's code and message, as PostgREST passes Postgres's on. */
    refuse(key: string, code: string, message = 'refused') {
      this.answer(key, { error: { code, message } });
    },
    /** Makes the account called `username` the owner, as private.owners does. */
    owner(username: string) {
      ownerName = username;
    },
    /** The last call to `target`. */
    last(target: string) {
      return calls.findLast((c) => c.target === target);
    }
  };
}

export type FakeSupabase = ReturnType<typeof fakeSupabase>;
