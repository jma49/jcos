// Accounts: a username and a password, an optional recovery address, and
// whether the member is Jincheng. The Supabase side is supabase/accounts.ts,
// the stand-in's local/accounts.ts.

/** A member: someone who signed up with a username and a password. */
export interface Account {
  id: string;
  username: string;
}

/** 3–20 lower-case letters, digits or underscores; the database checks the same. */
export const USERNAME = /^[a-z0-9_]{3,20}$/;
export const PASSWORD_MIN = 6;

export interface AccountsSocial {
  /** The signed-in member, or null. Known once the session has been read. */
  account: () => Account | null;
  /** Calls back with the member whenever someone signs in or out (and once, now). */
  onAccount: (callback: (account: Account | null) => void) => () => void;
  usernameAvailable: (username: string) => Promise<boolean>;
  signUp: (username: string, password: string, recoveryEmail?: string) => Promise<Account>;
  signIn: (username: string, password: string) => Promise<Account>;
  signOut: () => Promise<void>;

  /**
   * Emails a link to choose a new password, if the account has a recovery
   * address. Answers the same whether or not it has one.
   */
  requestReset: (username: string) => Promise<void>;
  /** Whose a reset link is, or null once it has expired or been used. */
  checkReset: (token: string) => Promise<string | null>;
  /** Sets a new password with a reset link, then signs in with it. */
  resetPassword: (token: string, password: string) => Promise<Account>;
  /** The signed-in member's recovery address, or null. */
  recoveryEmail: () => Promise<string | null>;
  /** Sets the signed-in member's recovery address, or removes it with null. */
  setRecoveryEmail: (email: string | null) => Promise<void>;
  /**
   * Whether the signed-in member is Jincheng, the owner (false signed out).
   * Only to decide what to show: the database keeps the owner's rooms shut.
   */
  isOwner: () => Promise<boolean>;
}
