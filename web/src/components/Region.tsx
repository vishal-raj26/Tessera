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

/** The popover under the country chip: a header, one row per country (flag, name, currency), a tick on
 *  the chosen one, and why it matters. */
export function RegionPop({ regions, value, onPick }: { regions: Region[]; value: string | null; onPick: (code: string) => void }) {
  return (
    <div className="pop-region">
      <div className="pop-head">
        <b>Store country</b>
        <small>Where your App Store or Google Play account is</small>
      </div>
      <div className="pop-rows" role="radiogroup" aria-label="Store country">
        {regions.map((r) => (
          <button key={r.code} role="radio" aria-checked={value === r.code} className={value === r.code ? 'on' : ''} onClick={() => onPick(r.code)}>
            <span className="rg-dot" aria-hidden="true">{r.flag}</span>
            <span className="rg-name">{r.name}</span>
            <span className="rg-cur">{r.currency}</span>
            <span className="rg-tick" aria-hidden="true">{value === r.code && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>}</span>
          </button>
        ))}
      </div>
      <p className="pop-note">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8v.01" /></svg>
        Codes only work in this country.
      </p>
    </div>
  );
}
