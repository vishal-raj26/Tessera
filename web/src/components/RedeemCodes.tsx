// Codes redeemed one at a time. The next code to redeem is highlighted; the main button copies it and
// opens the store's redeem screen, and the code gets a tick. Ticks can be taken off (tap the tick) if a
// code didn't go through. Tapping any code just copies it.
import { motion } from 'framer-motion';
import { fmtMoney, groupCode, redeemUrl, type Order } from '../api';
import { tg } from '../tg';

interface Props {
  order: Order;
  copied: string | null;
  onCopy: (code: string) => void;
  onMark: (order: Order, index: number, redeemed: boolean) => void;
  delay?: number; // entrance delay for the done screen
}

export function RedeemCodes({ order, copied, onCopy, onMark, delay = 0 }: Props) {
  const codes = order.codes ?? [];
  const multi = codes.length > 1;
  const next = codes.findIndex((c) => !c.redeemedAt);
  const done = codes.filter((c) => c.redeemedAt).length;
  const store = order.store?.label ?? 'App Store';

  function redeemNext() {
    if (next < 0) return;
    const c = codes[next];
    tg.tap('medium');
    onCopy(c.code);
    onMark(order, next, true);
    tg.openLink(redeemUrl(order.store?.id, c.code));
  }

  return (
    <>
      {multi && (
        <div className="redeem-progress" aria-live="polite">
          {next < 0 ? `All ${codes.length} codes redeemed` : `Redeem one at a time · ${done} of ${codes.length} done`}
        </div>
      )}
      <ol className="codes">
        {codes.map((c, i) => {
          const used = !!c.redeemedAt;
          const state = used ? 'is-used' : i === next ? 'is-next' : 'is-later';
          return (
            <motion.li key={c.code} className={`code-row ${state}`}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: delay + i * 0.07 }}>
              <button
                className="code-mark"
                onClick={() => { tg.select(); onMark(order, i, !used); }}
                aria-label={used ? `Code ${i + 1} redeemed. Tap to unmark` : `Mark code ${i + 1} as redeemed`}
                aria-pressed={used}
              >
                {used ? (
                  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                ) : (
                  <span>{i + 1}</span>
                )}
              </button>
              <motion.button className={`code ${copied === c.code ? 'is-copied' : ''}`} onClick={() => onCopy(c.code)} aria-label={`Copy code ${c.code}`} whileTap={{ scale: 0.98 }}>
                <span className="code-text">{groupCode(c.code)}</span>
                {multi && <span className="amt-sm">{fmtMoney(c.value, order.currency)}</span>}
                <span className="copy">{copied === c.code ? 'Copied' : used ? 'Redeemed' : 'Copy'}</span>
              </motion.button>
            </motion.li>
          );
        })}
      </ol>
      <motion.button className="btn btn-pearl" onClick={redeemNext} disabled={next < 0} whileTap={next < 0 ? undefined : { scale: 0.97 }}
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: delay + 0.2 }}>
        {next < 0 ? 'All redeemed' : multi ? `Redeem code ${next + 1} in ${store}` : `Redeem in ${store}`}
      </motion.button>
    </>
  );
}
