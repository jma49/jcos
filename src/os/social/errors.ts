// Why the backend refused something, whichever backend it is: every
// domain's slice throws these, and the interface explains them.

/**
 * Why something was refused, for the interface to explain: `signed-out`
 * (members only), `limit` (three notes a day, too many messages), `already`
 * (one reaction per visitor), `taken` (username), `credentials` (wrong
 * username or password), `invalid` (a bad username, password or note).
 */
export type Refusal = 'signed-out' | 'limit' | 'already' | 'taken' | 'credentials' | 'invalid' | 'expired' | 'conflict' | 'failed';

export class SocialError extends Error {
  constructor(
    readonly reason: Refusal,
    message: string
  ) {
    super(message);
  }
}

/** A save refused because another one landed first, or the thing is gone. */
export const changedElsewhere = () => new SocialError('conflict', 'It was changed or thrown away somewhere else since this copy was opened.');
