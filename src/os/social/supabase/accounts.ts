// Accounts on Supabase Auth: a username is an account whose address is
// made from it, the recovery address is the account-recovery Edge
// Function's (supabase/functions/account-recovery), and whether the member
// is the owner is the database's is_owner().

import { MEMBER_EMAIL_DOMAIN } from '../../../config/site';
import { PASSWORD_MIN, USERNAME, type AccountsSocial } from '../accounts';
import { SocialError } from '../errors';
import { accountOf, refusal, type SupabaseContext } from './context';

/**
 * Supabase Auth wants an email address; an account is a username, so it
 * gets one made from it. The database only accepts accounts made this way,
 * and existing members signed up under it: MEMBER_EMAIL_DOMAIN never changes.
 */
const addressOf = (username: string) => `${username}@${MEMBER_EMAIL_DOMAIN}`;

export function supabaseAccounts(ctx: SupabaseContext): AccountsSocial {
  const { client, listeners, member } = ctx;

  /** Calls the account-recovery Edge Function (supabase/functions/account-recovery). */
  const recovery = async (body: Record<string, string>) => {
    const { data, error } = await client.functions.invoke('account-recovery', { body });
    if (!error) return data as Record<string, unknown>;
    const response = (error as { context?: unknown }).context;
    // A body that isn't JSON (a gateway's error page) gets the general message below.
    const answer = response instanceof Response ? await response.json().catch(() => null) : null;
    const message = typeof answer?.error === 'string' ? answer.error : 'Couldn’t reach the server. Try again in a moment.';
    throw new SocialError(response instanceof Response && response.status === 410 ? 'expired' : 'failed', message);
  };

  async function usernameAvailable(username: string) {
    const { data, error } = await client.rpc('username_available', { name: username.toLowerCase() });
    if (error) throw refusal(error);
    return Boolean(data);
  }

  async function signIn(username: string, password: string) {
    const name = username.trim().toLowerCase();
    const { data, error } = await client.auth.signInWithPassword({ email: addressOf(name), password });
    if (error) throw new SocialError('credentials', 'That username and password don’t match.');
    ctx.setAccount(accountOf(data.user));
    return ctx.account()!;
  }

  return {
    account: ctx.account,

    onAccount(callback) {
      listeners.add(callback);
      ctx.ready.then(() => listeners.has(callback) && callback(ctx.account()));
      return () => listeners.delete(callback);
    },

    usernameAvailable,

    async signUp(username, password, recoveryEmail) {
      const name = username.trim().toLowerCase();
      if (!USERNAME.test(name)) throw new SocialError('invalid', 'A username is 3 to 20 letters, digits or underscores.');
      if (password.length < PASSWORD_MIN) throw new SocialError('invalid', `A password needs at least ${PASSWORD_MIN} characters.`);
      if (!(await usernameAvailable(name))) throw new SocialError('taken', 'That username is taken.');
      const { data, error } = await client.auth.signUp({
        email: addressOf(name),
        password,
        options: { data: { username: name, ...(recoveryEmail?.trim() ? { recovery_email: recoveryEmail.trim() } : {}) } }
      });
      if (error) {
        if (/registered|exists/i.test(error.message)) throw new SocialError('taken', 'That username is taken.');
        if (/password/i.test(error.message)) throw new SocialError('invalid', error.message);
        throw new SocialError('failed', 'Couldn’t make the account. Try again in a moment.');
      }
      // Without a session the project still asks for email confirmation (see the migration).
      if (!data.session) throw new SocialError('failed', 'Accounts aren’t open yet.');
      ctx.setAccount(accountOf(data.user));
      return ctx.account()!;
    },

    signIn,

    async requestReset(username) {
      await recovery({ action: 'request', username: username.trim().toLowerCase() });
    },

    async checkReset(token) {
      const { username } = (await recovery({ action: 'check', token })) as { username: string | null };
      return username;
    },

    async resetPassword(token, password) {
      const { username } = (await recovery({ action: 'reset', token, password })) as { username: string };
      return signIn(username, password);
    },

    async recoveryEmail() {
      member();
      const { data, error } = await client.rpc('my_recovery_email');
      if (error) throw refusal(error);
      return data ?? null;
    },

    async setRecoveryEmail(email) {
      member();
      const { error } = await client.rpc('set_recovery_email', { p_email: email ?? '' });
      if (error) {
        if (error.code === '23514') throw new SocialError('invalid', 'That doesn’t look like an email address.');
        throw refusal(error);
      }
    },

    async isOwner() {
      if (!ctx.account()) return false;
      const { data, error } = await client.rpc('is_owner');
      if (error) throw refusal(error);
      return data === true;
    },

    async signOut() {
      await client.auth.signOut();
      ctx.setAccount(null);
      listeners.forEach((l) => l(null));
    }
  };
}
