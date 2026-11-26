// The popover under the wallet in the top bar: a small balance card (which wallet, which network, how much
// GRAM, the address: tap it to copy), then the actions: add GRAM (from other coins), disconnect.
import { useTonWallet } from '@tonconnect/ui-react';
import { GramIcon } from './GramIcon';
import { CoinStack } from './CoinStack';

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-6)}`;
const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function WalletSheet({ address, balance, network, canTopUp, coins = [], icons = {}, onTopUp, onCopy, onDisconnect }: {
  address: string; balance: number | null; network?: 'mainnet' | 'testnet'; canTopUp: boolean; coins?: string[]; icons?: Record<string, string>; onTopUp: () => void; onCopy: () => void; onDisconnect: () => void;
}) {
  const w = useTonWallet() as (ReturnType<typeof useTonWallet> & { name?: string; imageUrl?: string }) | null;
  const name = w?.name ?? w?.device?.appName ?? 'TON wallet';
  return (
    <div className="pop-wallet">
      <div className="wcard">
        <div className="wcard-top">
          {w?.imageUrl ? <img className="wcard-icon" src={w.imageUrl} alt="" /> : <span className="wcard-icon blank"><GramIcon size={13} /></span>}
          <span className="wcard-name">{name}</span>
          {network === 'testnet' && <span className="wcard-net testnet">Testnet</span>}
        </div>
        <b className="wcard-bal" aria-label="Balance">{balance != null ? fmt(balance) : '—'}<GramIcon size={17} /></b>
        <button className="wcard-addr" onClick={onCopy} aria-label="Copy address">
          <span>{short(address)}</span><Ico d="M8 8h12v12H8zM16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" size={13} />
        </button>
      </div>
      <div className="pop-actions">
        {canTopUp && <button onClick={onTopUp}><Ico d="M12 5v14M5 12h14" /><span>Add GRAM</span>{coins.length > 0 && <CoinStack coins={coins} icons={icons} size={20} />}</button>}
        <button className="danger" onClick={onDisconnect}><Ico d="M12 3v8M6.3 7.2a8 8 0 1 0 11.4 0" /><span>Disconnect</span></button>
      </div>
    </div>
  );
}

function Ico({ d, size = 17 }: { d: string; size?: number }) {
  return <svg className="pi" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}
