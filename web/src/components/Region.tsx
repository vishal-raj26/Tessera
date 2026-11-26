// The buyer's store country. App Store and Google Play credit only works in the country of the account it's
// redeemed on, so this decides which region's cards (and prices) Tessera uses for them.
import type { Region } from '../api';

export const regionNote = 'Pick the country of your App Store or Google Play account. Codes only work there.';

/** Every region we can fulfil, as a grid of flag, name and currency. */
export function RegionList({ regions, value, onPick }: { regions: Region[]; value: string | null; onPick: (code: string) => void }) {
  if (!regions.length) return <div className="region-list loading"><span className="spin" /></div>;
  return (
    <div className="region-list" role="radiogroup" aria-label="Store country">
      {regions.map((r) => (
        <button key={r.code} type="button" role="radio" aria-checked={value === r.code} className={value === r.code ? 'on' : ''} onClick={() => onPick(r.code)}>
          <span className="rg-flag" aria-hidden="true">{r.flag}</span>
          <span className="rg-name">{r.name}</span>
          <span className="rg-cur">{r.currency}</span>
        </button>
      ))}
    </div>
  );
}

/** The sheet behind the region chip in the top bar. */
export function RegionSheet({ regions, value, onPick }: { regions: Region[]; value: string | null; onPick: (code: string) => void }) {
  return (
    <div className="st region-sheet">
      <h2>Your store country</h2>
      <p className="sub">{regionNote}</p>
      <RegionList regions={regions} value={value} onPick={onPick} />
    </div>
  );
}

/** The compact list in the top bar's popover: one row per country, a tick on the chosen one. */
export function RegionPop({ regions, value, onPick }: { regions: Region[]; value: string | null; onPick: (code: string) => void }) {
  return (
    <div className="pop-region">
      <p className="pop-title">Store country</p>
      <div className="pop-rows" role="radiogroup" aria-label="Store country">
        {regions.map((r) => (
          <button key={r.code} role="radio" aria-checked={value === r.code} className={value === r.code ? 'on' : ''} onClick={() => onPick(r.code)}>
            <span className="rg-flag" aria-hidden="true">{r.flag}</span><span className="rg-name">{r.name}</span>
            {value === r.code && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>}
          </button>
        ))}
      </div>
      <p className="pop-note">Codes only work in your App Store or Google Play account’s country.</p>
    </div>
  );
}
