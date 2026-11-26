// The menu behind the Tessera logo: everything that isn't a plan, one tap away.
import { GramIcon } from './GramIcon';

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

interface Props {
  wallet: string;
  codesCount: number;
  canTopUp: boolean;
  onCodes: () => void;
  onTopUp: () => void;
  onHowItWorks: () => void;
  onHelp: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

export function Menu({ wallet, codesCount, canTopUp, onCodes, onTopUp, onHowItWorks, onHelp, onConnect, onDisconnect }: Props) {
  return (
    <div className="st menu">
      <h2>Tessera</h2>
      <ul className="menu-list">
        <li><button onClick={onCodes}><Ico d="M3.5 7.5A1.5 1.5 0 0 1 5 6h14a1.5 1.5 0 0 1 1.5 1.5V10a2 2 0 0 0 0 4v2.5A1.5 1.5 0 0 1 19 18H5a1.5 1.5 0 0 1-1.5-1.5V14a2 2 0 0 0 0-4Z" /><span>Your codes</span>{codesCount > 0 && <em>{codesCount} to redeem</em>}<Chev /></button></li>
        {canTopUp && <li><button onClick={onTopUp}><span className="menu-ico"><GramIcon size={18} /></span><span>Top up GRAM</span><em>from USDT, ETH, SOL…</em><Chev /></button></li>}
        <li><button onClick={onHowItWorks}><Ico d="M12 17v.01M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" /><span>How it works</span><Chev /></button></li>
        <li><button onClick={onHelp}><Ico d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4 3v-3h0.5A2.5 2.5 0 0 1 4 14.5Z" /><span>Help</span><em>Message us</em><Chev /></button></li>
      </ul>
      <div className="menu-wallet">
        {wallet ? (
          <>
            <span><small>Wallet</small><b>{short(wallet)}</b></span>
            <button className="text-btn" onClick={onDisconnect}>Disconnect</button>
          </>
        ) : (
          <button className="btn btn-pearl" onClick={onConnect}>Connect wallet</button>
        )}
      </div>
    </div>
  );
}

function Ico({ d }: { d: string }) {
  return <span className="menu-ico"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg></span>;
}
function Chev() {
  return <svg className="menu-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>;
}
