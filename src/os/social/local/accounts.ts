// Accounts in this browser: passwords are stored as typed, and a reset
// link is "emailed" to the console.

import { loadJSON, saveJSON } from '../../core/storage';
import { PASSWORD_MIN, USERNAME, type AccountsSocial } from '../accounts';
import { SocialError } from '../errors';
import { DEV_OWNER, type LocalContext, type StoredUser } from './context';

const RESETS_KEY = 'os-dev-resets';

/** A password reset link; the stand-in "emails" it to the console. */
interface StoredReset {
  token: string;
  username: string;
  expires: number;
  used?: boolean;
}

export function localAccounts(ctx: LocalContext): AccountsSocial {
  const { users, saveUsers, become, listeners, member } = ctx;

  const resets = () => loadJSON<StoredReset[]>(RESETS_KEY, []);
  const liveReset = (token: string) => resets().find((r) => r.token === token && !r.used && r.expires > Date.now());

  async function usernameAvailable(username: string) {
    const name = username.toLowerCase();
    return USERNAME.test(name) && !users().some((u) => u.username === name);
  }

  async function signIn(username: string, password: string) {
    const user = users().find((u) => u.username === username.trim().toLowerCase() && u.password === password);
    if (!user) throw new SocialError('credentials', 'That username and password don’t match.');
    become({ id: user.id, username: user.username });
    return ctx.account()!;
  }

  return {
    account: ctx.account,

    onAccount(callback) {
      listeners.add(callback);
      callback(ctx.account());
      return () => listeners.delete(callback);
    },

    usernameAvailable,

    async signUp(username, password, recoveryEmail) {
      const name = username.trim().toLowerCase();
      if (!USERNAME.test(name)) throw new SocialError('invalid', 'A username is 3 to 20 letters, digits or underscores.');
      if (password.length < PASSWORD_MIN) throw new SocialError('invalid', `A password needs at least ${PASSWORD_MIN} characters.`);
      if (!(await usernameAvailable(name))) throw new SocialError('taken', 'That username is taken.');
      const user: StoredUser = { id: crypto.randomUUID(), username: name, password, recovery: recoveryEmail?.trim() || undefined };
      saveUsers([...users(), user]);
      become({ id: user.id, username: name });
      return ctx.account()!;
    },

    signIn,

    async signOut() {
      become(null);
    },

    async requestReset(username) {
      const user = users().find((u) => u.username === username.trim().toLowerCase());
      if (!user?.recovery) return;
      const token = crypto.randomUUID().replace(/-/g, '').padEnd(43, 'x');
      saveJSON(RESETS_KEY, [...resets(), { token, username: user.username, expires: Date.now() + 30 * 60_000 }]);
      console.info(`[social] A reset link for ${user.username}, "sent" to ${user.recovery}: ${location.origin}/?open=account&reset=${token}`);
    },

    async checkReset(token) {
      return liveReset(token)?.username ?? null;
    },

    async resetPassword(token, password) {
      if (password.length < PASSWORD_MIN) throw new SocialError('invalid', `A password needs at least ${PASSWORD_MIN} characters.`);
      const link = liveReset(token);
      if (!link) throw new SocialError('expired', 'This link has expired or has already been used. Ask for a new one.');
      saveJSON(RESETS_KEY, resets().map((r) => (r.username === link.username ? { ...r, used: true } : r)));
      saveUsers(users().map((u) => (u.username === link.username ? { ...u, password } : u)));
      return signIn(link.username, password);
    },

    async recoveryEmail() {
      const me = member();
      return users().find((u) => u.id === me.id)?.recovery ?? null;
    },

    async setRecoveryEmail(email) {
      const me = member();
      const address = email?.trim() || undefined;
      if (address && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) throw new SocialError('invalid', 'That doesn’t look like an email address.');
      saveUsers(users().map((u) => (u.id === me.id ? { ...u, recovery: address } : u)));
    },

    async isOwner() {
      return ctx.account()?.username === DEV_OWNER;
    }
  };
}
