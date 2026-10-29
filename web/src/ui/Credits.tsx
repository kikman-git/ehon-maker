import { useState } from 'react';
import { cloud } from '../cloud/config';
import { credits, LOW_CREDITS, MIN_TURN_CREDITS, openBillingPortal, PACK_CREDITS, PLUS_CREDITS, startCheckout, type Product } from '../cloud/credits';
import { useStore } from '../cloud/store';
import { Icon } from './Icon';

export const planName = (plan: 'free' | 'plus') => (plan === 'plus' ? 'ぺたぺた プラス' : 'フリー');

/** The balance in the header; a tap opens the account, where the plans are. */
export function CreditChip({ onClick }: { onClick: () => void }) {
  const state = useStore(credits);
  if (!cloud || !state.ready) return null;
  const low = state.balance < LOW_CREDITS;
  return <button className="credit-chip" data-plan={state.plan} data-low={low || undefined} title={`AI クレジット · ${planName(state.plan)}`} aria-label={`AI クレジット ${state.balance}`} onClick={onClick}>
    <Icon name="sparkles" size={14} /><span>{state.balance}</span>{state.plan === 'plus' && <small>PLUS</small>}
  </button>;
}

/** The two ways to get more credits, for the account and wherever the balance runs out. */
export function Offers({ compact }: { compact?: boolean }) {
  const state = useStore(credits);
  const [busy, setBusy] = useState<Product | 'portal' | null>(null);
  const [error, setError] = useState('');
  const buy = (product: Product) => {
    setBusy(product); setError('');
    startCheckout(product).catch(() => { setBusy(null); setError('お支払いページを ひらけませんでした。'); });
  };
  return <div className="offers" data-compact={compact || undefined}>
    {state.plan !== 'plus' && <button className="offer primary" disabled={busy !== null} onClick={() => buy('plus')}>
      <strong><Icon name="sparkles" size={15} />ぺたぺた プラス</strong>
      <span>毎月 {PLUS_CREDITS.toLocaleString()} クレジット · AIで えと えほんを つくりほうだい</span>
    </button>}
    <button className="offer" disabled={busy !== null} onClick={() => buy('pack')}>
      <strong><Icon name="plus" size={15} />{PACK_CREDITS} クレジットを 買う</strong>
      <span>いちどだけ · つかわなければ のこります</span>
    </button>
    {state.plan === 'plus' && <button className="ghost" disabled={busy !== null} onClick={() => { setBusy('portal'); openBillingPortal().catch(() => { setBusy(null); setError('お支払いの かんりページを ひらけませんでした。'); }); }}>お支払いの かんり</button>}
    {error && <p role="alert" className="error">{error}</p>}
  </div>;
}

/** What free users see on the AI entry points: the credits are a gift to spend, and the balance is always in view. */
export function CreditNudge() {
  const state = useStore(credits);
  if (!cloud || !state.ready || state.plan === 'plus') return null;
  if (state.balance < MIN_TURN_CREDITS) return <span className="credit-nudge" data-out="">クレジットが なくなりました · プラスで つづけられます</span>;
  if (state.balance < LOW_CREDITS) return <span className="credit-nudge" data-low="">のこり {state.balance} クレジット · おおきな おねがいは とちゅうで とまるかも</span>;
  return null;
}

/** Shown in place of the AI controls when a turn cannot start. */
export function OutOfCredits() {
  return <div className="out-of-credits" role="status">
    <h3><Icon name="sparkles" size={18} />無料クレジットを つかいきりました</h3>
    <p>ここまでの えは そのまま つかえます。つづけて AI と つくるには プラスか クレジットを えらんでください。</p>
    <Offers compact />
  </div>;
}
