// The small popover under the wallet in the top bar: which wallet it is, its address and balance, top up and
// disconnect.
import { useTonWallet } from '@tonconnect/ui-react';
import { GramIcon } from './GramIcon';

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-6)}`;
const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function WalletSheet({ address, balance, canTopUp, onTopUp, onCopy, onDisconnect }: {
  address: string; balance: number | null; canTopUp: boolean; onTopUp: () => void; onCopy: () => void; onDisconnect: () => void;
}) {
  const w = useTonWallet() as (ReturnType<typeof useTonWallet> & { name?: string; imageUrl?: string }) | null;
  const name = w?.name ?? w?.device?.appName ?? 'TON wallet';
  return (
    <div className="pop-wallet">
      <div className="ws-head">
        {w?.imageUrl ? <img className="ws-icon" src={w.imageUrl} alt="" /> : <span className="ws-icon ws-icon-blank"><GramIcon size={22} /></span>}
        <div>
          <h2>{name}</h2>
          <button className="ws-addr" onClick={onCopy} aria-label="Copy address">{short(address)}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" /></svg>
          </button>
        </div>
      </div>
      <div className="ws-bal">
        <small>Balance</small>
        <b>{balance != null ? fmt(balance) : '…'}<GramIcon size={18} /></b>
      </div>
      <div className="ws-actions">
        {canTopUp && <button className="ws-btn" onClick={onTopUp}>Top up GRAM</button>}
        <button className="ws-btn ws-off" onClick={onDisconnect}>Disconnect</button>
      </div>
    </div>
  );
}
