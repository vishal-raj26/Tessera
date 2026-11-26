// The coins you can add GRAM from, as a small overlapping group of their logos (as Relay publishes them;
// the coin's letters when a logo isn't available).
export function CoinStack({ coins, icons, size = 20 }: { coins: string[]; icons: Record<string, string>; size?: number }) {
  return (
    <span className="coin-stack" style={{ ['--cs' as string]: `${size}px` }} aria-label={coins.join(', ')}>
      {coins.map((c) => (
        <span key={c} className="cs-coin" title={c}>
          {icons[c] ? <img src={icons[c]} alt="" loading="lazy" /> : <span>{c.slice(0, 1)}</span>}
        </span>
      ))}
    </span>
  );
}
