// Plans and regional App Store prices for the Claude iOS app.
// Prices are what Apple shows inside the Claude app per storefront.
// Source: App Store listings as tracked on opentherank.com/ai-pricing/claude (captured 28 Oct 2026)
// and apppricinglab.com (US). Re-check these regularly — Anthropic and Apple change regional prices.

export const PLANS = [
  { id: 'pro_m', name: 'Pro', term: 'month', blurb: 'For everyday work and study' },
  { id: 'max5_m', name: 'Max 5x', term: 'month', blurb: '5x the usage of Pro' },
  { id: 'max20_m', name: 'Max 20x', term: 'month', blurb: '20x the usage of Pro' },
];

// How long a purchase covers. Longer than a month is credit for that many monthly renewals
// (Apple renews from the balance), except Pro for a year, which is Apple's own yearly plan
// (price key pro_y; only offered where we have that storefront's yearly price).
export const TERMS = [1, 3, 6, 12];
export const termsFor = (planId, region) =>
  TERMS.filter((m) => m !== 12 || (planId === 'pro_m' && region?.prices?.pro_y));
export const termLabel = (months) => (months === 12 ? '1 year' : months === 1 ? '1 month' : `${months} months`);

// taxBuffer: storefronts whose prices exclude sales tax (US, CA) need extra credit,
// otherwise Apple charges tax at checkout and the balance falls short.
// Any credit left over stays in the user's Apple balance.
export const REGIONS = {
  US: { name: 'United States', flag: '🇺🇸', currency: 'USD', taxBuffer: 0.1, prices: { pro_m: 20, pro_y: 214.99, max5_m: 124.99, max20_m: 249.99 } },
  GB: { name: 'United Kingdom', flag: '🇬🇧', currency: 'GBP', taxBuffer: 0, prices: { pro_m: 20, max5_m: 119.99, max20_m: 249.99 } },
  CA: { name: 'Canada', flag: '🇨🇦', currency: 'CAD', taxBuffer: 0.15, prices: { pro_m: 28, max5_m: 179.99, max20_m: 349.99 } },
  AU: { name: 'Australia', flag: '🇦🇺', currency: 'AUD', taxBuffer: 0, prices: { pro_m: 30, max5_m: 199.99, max20_m: 399.99 } },
  DE: { name: 'Germany', flag: '🇩🇪', currency: 'EUR', taxBuffer: 0, prices: { pro_m: 22, max5_m: 149.99, max20_m: 299.99 } },
  FR: { name: 'France', flag: '🇫🇷', currency: 'EUR', taxBuffer: 0, prices: { pro_m: 22, max5_m: 149.99, max20_m: 299.99 } },
  JP: { name: 'Japan', flag: '🇯🇵', currency: 'JPY', taxBuffer: 0, prices: { pro_m: 3000, max5_m: 20000, max20_m: 40000 } },
  IN: { name: 'India', flag: '🇮🇳', currency: 'INR', taxBuffer: 0, prices: { pro_m: 1999, max5_m: 12900, max20_m: 24900 } },
  TR: { name: 'Türkiye', flag: '🇹🇷', currency: 'TRY', taxBuffer: 0, prices: { pro_m: 999.99, max5_m: 6999.99, max20_m: 12999.99 } },
  BR: { name: 'Brazil', flag: '🇧🇷', currency: 'BRL', taxBuffer: 0, prices: { pro_m: 129.9, max5_m: 799.9, max20_m: 1499.9 } },
  MX: { name: 'Mexico', flag: '🇲🇽', currency: 'MXN', taxBuffer: 0, prices: { pro_m: 399, max5_m: 2499, max20_m: 4999 } },
  KR: { name: 'South Korea', flag: '🇰🇷', currency: 'KRW', taxBuffer: 0, prices: { pro_m: 33000, max5_m: 199000, max20_m: 449000 } },
  PH: { name: 'Philippines', flag: '🇵🇭', currency: 'PHP', taxBuffer: 0, prices: { pro_m: 1290, max5_m: 7990, max20_m: 14990 } },
  ID: { name: 'Indonesia', flag: '🇮🇩', currency: 'IDR', taxBuffer: 0, prices: { pro_m: 349000, max5_m: 1999000, max20_m: 3999000 } },
};

/**
 * Pick the cheapest combination of available denominations whose total face value covers
 * `needed`, using as few codes as sensible. maxCodes defaults to 3, raised just enough when even
 * the biggest card can't cover it in 3 (long Max terms), up to 6.
 * packages: [{ id, value, costUsd }]
 */
export function pickPackages(packages, needed, maxCodes) {
  const sorted = [...packages].sort((a, b) => a.value - b.value);
  if (!sorted.length) return null;
  const biggest = sorted.at(-1).value;
  const limit = maxCodes ?? Math.min(6, Math.max(3, Math.ceil(needed / biggest)));
  let best = null;
  const combo = [];
  // combos in non-decreasing order; stop extending once the face value covers the need,
  // because adding another code only adds cost
  (function walk(from, face, cost) {
    if (face + 1e-9 >= needed) {
      // One code is much easier to redeem: treat each extra code as 4% more expensive.
      const score = cost * (1 + 0.04 * (combo.length - 1));
      if (!best || score < best.score - 1e-9) best = { combo: [...combo], face, cost, score };
      return;
    }
    if (combo.length === limit) return;
    for (let i = from; i < sorted.length; i++) {
      combo.push(sorted[i]);
      walk(i, face + sorted[i].value, cost + sorted[i].costUsd);
      combo.pop();
    }
  })(0, 0, 0);
  return best && { packages: best.combo, faceValue: round2(best.face), costUsd: round2(best.cost) };
}

export const round2 = (x) => Math.round(x * 100) / 100;
