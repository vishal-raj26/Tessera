// What Tessera sells: subscriptions to apps, delivered as store credit (App Store or Google Play) that
// the buyer redeems and then subscribes with inside the app. Claude is the first product; more follow.
//
// Products: each has plans; a plan has a monthly price key (`key`) and, if the store sells a yearly plan,
// `yearlyKey`. Price keys are unique across products. Prices per region and store live in REGIONS
// (built-in defaults), are synced from the App Store page where possible (applePrices.js), and can be
// set by the admin (/price). Google Play doesn't publish in-app prices, so Play is offered for a plan
// only once its price has been set.
// App Store prices: storefront listings (opentherank.com/ai-pricing, apppricinglab.com, apps.apple.com).

export const STORES = {
  appstore: { id: 'appstore', label: 'App Store', device: 'iPhone' },
  play: { id: 'play', label: 'Google Play', device: 'Android' },
};

export const PRODUCTS = [
  {
    id: 'claude', name: 'Claude', app: 'Claude by Anthropic',
    appstore: {
      appId: '6473753684', slug: 'claude-by-anthropic',
      // how the App Store names each plan's in-app purchase
      iap: {
        pro_m: /Claude\s+Pro\s*[-–—]\s*Monthly/i,
        pro_y: /Claude\s+Pro\s*[-–—]\s*(?:Annual|Yearly)/i,
        max5_m: /Claude\s+Max\s*5\s*[x×]\s*[-–—]\s*Monthly/i,
        max20_m: /Claude\s+Max\s*20\s*[x×]\s*[-–—]\s*Monthly/i,
      },
    },
    play: { package: 'com.anthropic.claude' },
    plans: [
      { id: 'pro_m', key: 'pro_m', yearlyKey: 'pro_y', name: 'Pro', label: 'Pro', blurb: 'For everyday work and study' },
      { id: 'max5_m', key: 'max5_m', name: 'Max 5x', label: 'Max 5×', blurb: '5x the usage of Pro' },
      { id: 'max20_m', key: 'max20_m', name: 'Max 20x', label: 'Max 20×', blurb: '20x the usage of Pro' },
    ],
  },
  {
    id: 'chatgpt', name: 'ChatGPT', app: 'ChatGPT',
    appstore: {
      appId: '6448311069', slug: 'chatgpt',
      // Plus monthly and yearly share a name on the App Store: the cheaper is monthly, the dearer yearly
      iap: {
        chatgpt_go: /ChatGPT\s+Go\b/i,
        chatgpt_plus: { name: /ChatGPT\s+Plus\b/i, pick: 'min' },
        chatgpt_plus_y: { name: /ChatGPT\s+Plus\b/i, pick: 'max', yearlyOf: 'chatgpt_plus' },
        chatgpt_pro: /ChatGPT\s+Pro\s+200\b/i,
      },
    },
    play: { package: 'com.openai.chatgpt' },
    plans: [
      { id: 'chatgpt_go', key: 'chatgpt_go', name: 'Go', label: 'Go', blurb: 'More of ChatGPT, for less' },
      { id: 'chatgpt_plus', key: 'chatgpt_plus', yearlyKey: 'chatgpt_plus_y', name: 'Plus', label: 'Plus', blurb: 'The most popular plan' },
      { id: 'chatgpt_pro', key: 'chatgpt_pro', name: 'Pro', label: 'Pro', blurb: 'The highest limits' },
    ],
  },
];

/** Products on sale: PRODUCTS env (comma list), default Claude only. */
export const enabledProducts = () => {
  const want = String(process.env.PRODUCTS || 'claude').split(',').map((s) => s.trim()).filter(Boolean);
  return PRODUCTS.filter((p) => want.includes(p.id));
};
export const findPlan = (planId) => {
  for (const product of PRODUCTS) {
    const plan = product.plans.find((p) => p.id === planId);
    if (plan) return { product, plan };
  }
  return null;
};
/** All price keys of a product (monthly and yearly). */
export const priceKeys = (product) => product.plans.flatMap((p) => [p.key, ...(p.yearlyKey ? [p.yearlyKey] : [])]);

// Back-compat for older code and tests: Claude's plans.
export const PLANS = PRODUCTS[0].plans.map(({ id, name, blurb }) => ({ id, name, term: 'month', blurb }));

// How long a purchase covers. Longer than a month is credit for that many monthly renewals (the store
// renews from the balance), except 12 months on a plan with a yearly price: the store's own yearly plan.
export const TERMS = [1, 3, 6, 12];
export const termsFor = (planId, region) => {
  const plan = findPlan(planId)?.plan;
  return TERMS.filter((m) => m !== 12 || !!(plan?.yearlyKey && region?.prices?.[plan.yearlyKey]));
};
export const termLabel = (months) => (months === 12 ? '1 year' : months === 1 ? '1 month' : `${months} months`);

// `prices` are App Store prices. Google Play prices have no defaults (Play doesn't publish them): set them
// with /price play <key> <amount>.
// taxBuffer: storefronts whose prices exclude sales tax (US, CA) need extra credit,
// otherwise the store charges tax at checkout and the balance falls short.
// Any credit left over stays in the user's Apple balance.
export const REGIONS = {
  US: {
    name: 'United States', flag: '🇺🇸', currency: 'USD', taxBuffer: 0.1,
    prices: { pro_m: 20, pro_y: 214.99, max5_m: 124.99, max20_m: 249.99, chatgpt_go: 8, chatgpt_plus: 19.99, chatgpt_plus_y: 200, chatgpt_pro: 200 },
  },
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
