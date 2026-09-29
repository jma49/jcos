// Whether the signed-in member is Jincheng, for the secret base's rooms.
// Asked once per account, and only to decide what to show: the database
// is what keeps the doors shut (public.is_owner() in its policies).
// Only the apps that have rooms import this, so it isn't in the first load.

import { useEffect, useState } from 'react';
import { useAccount } from './account';
import { getSocial } from './social';

let asked: { id: string; answer: Promise<boolean> } | null = null;

/** Whether the account signed in as `id` is the owner's; a failure answers no and is asked again next time. */
export function ownerAnswer(id: string): Promise<boolean> {
  if (asked?.id !== id) {
    const answer: Promise<boolean> = getSocial()
      // Someone else may have signed in since; their own question follows.
      .then((social) => (social && social.account()?.id === id ? social.isOwner() : false))
      .catch(() => {
        if (asked?.answer === answer) asked = null;
        return false;
      });
    asked = { id, answer };
  }
  return asked.answer;
}

/**
 * Whether Jincheng is signed in, and whether that's known yet: once the
 * session has been read and, for a member, the database has answered.
 * A view that says "that's not yours" waits for `known`, so the owner
 * never sees it for a moment.
 */
export function useOwnerAnswer(): { owner: boolean; known: boolean } {
  const id = useAccount((s) => s.account?.id ?? null);
  const ready = useAccount((s) => s.ready);
  const [answer, setAnswer] = useState<{ id: string; owner: boolean } | null>(null);
  useEffect(() => {
    if (!id) return;
    let live = true;
    ownerAnswer(id).then((owner) => live && setAnswer({ id, owner }));
    return () => {
      live = false;
    };
  }, [id]);
  if (!id) return { owner: false, known: ready };
  return answer?.id === id ? { owner: answer.owner, known: true } : { owner: false, known: false };
}

/** True while Jincheng is signed in; false for everyone else, and until it's known. */
export const useIsOwner = () => useOwnerAnswer().owner;
