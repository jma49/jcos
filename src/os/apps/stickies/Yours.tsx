import { launch } from '../../core/registry';
import { isPhone } from '../../core/store';
import { useMineRefresh, useMyStickies } from '../../stickies/mine';
import { StickyNote } from '../../stickies/StickyNote';

/**
 * Stickies › Yours: the member's own stickies, which only they see, as
 * cards (on a phone, where there's no desktop to put them on, the only
 * place they are). Signed out, it says how to have some.
 */
export function Yours({ account, newest }: { account: string | null; newest: string | null }) {
  useMineRefresh(account);
  const stickies = useMyStickies();

  if (!account) {
    return (
      <div className="os-stickies-yours-empty">
        <p>Stickies of your own are for your eyes only, on your own desktop.</p>
        <button type="button" className="os-button" onClick={() => launch('account', { props: { then: 'stickies' } })}>
          Sign In to Keep Some…
        </button>
      </div>
    );
  }

  return (
    <div className="os-scroll os-stickies-wall os-stickies-yours">
      {stickies.map((sticky) => (
        <StickyNote key={sticky.id} sticky={sticky} autoFocus={sticky.id === newest} />
      ))}
      {stickies.length === 0 && (
        <p className="os-stickies-empty">
          No stickies of your own yet. New Sticky puts one up{isPhone() ? '' : ', here and on your desktop'}.
        </p>
      )}
    </div>
  );
}
