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

/** True while Jincheng is signed in; false for everyone else, and until it's known. */
export function useIsOwner(): boolean {
  const id = useAccount((s) => s.account?.id ?? null);
  const [known, setKnown] = useState<{ id: string; owner: boolean } | null>(null);
  useEffect(() => {
    if (!id) return;
    let live = true;
    ownerAnswer(id).then((owner) => live && setKnown({ id, owner }));
    return () => {
      live = false;
    };
  }, [id]);
  return known?.id === id && known.owner;
}
