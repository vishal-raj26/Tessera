// What Tessera sells: subscriptions to apps, delivered as store credit (App Store or Google Play) that
// the buyer redeems and then subscribes with inside the app: Claude, ChatGPT and Grok.
// To add one: an entry in PRODUCTS (plans, App Store ids and IAP names, Play package) and its default
// App Store prices in REGIONS.
//
// Products: each has plans; a plan has a monthly price key (`key`) and, if the store sells a yearly plan,
// `yearlyKey`; `inApp` is the plan's name as the app itself shows it (what the buyer looks for).
// Price keys are unique across products. Prices per region and store live in REGIONS
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
      { id: 'pro_m', key: 'pro_m', yearlyKey: 'pro_y', name: 'Pro', inApp: 'Claude Pro', label: 'Pro', blurb: 'For everyday work and study' },
      { id: 'max5_m', key: 'max5_m', name: 'Max 5x', inApp: 'Claude Max 5x', label: 'Max 5×', blurb: '5x the usage of Pro' },
      { id: 'max20_m', key: 'max20_m', name: 'Max 20x', inApp: 'Claude Max 20x', label: 'Max 20×', blurb: '20x the usage of Pro' },
    ],
  },
  {
    // ChatGPT: only the plans the app sells to anyone. Pro isn't here: OpenAI has a Free account upgrade
    // to Pro on the web only, so App Store credit couldn't pay for it (help.openai.com, Nov 2026).
    id: 'chatgpt', name: 'ChatGPT', app: 'ChatGPT',
    appstore: {
      appId: '6448311069', slug: 'chatgpt',
      // the App Store lists "ChatGPT Plus" twice: the monthly price and the yearly one
      iap: {
        gpt_go_m: /ChatGPT\s+Go\b/i,
        gpt_plus_m: { name: /ChatGPT\s+Plus\b/i, pick: 'min' },
        gpt_plus_y: { name: /ChatGPT\s+Plus\b/i, pick: 'max', yearlyOf: 'gpt_plus_m' },
      },
    },
    play: { package: 'com.openai.chatgpt' },
    plans: [
      { id: 'gpt_go_m', key: 'gpt_go_m', name: 'Go', inApp: 'ChatGPT Go', label: 'Go', blurb: 'The lower-priced plan' },
      { id: 'gpt_plus_m', key: 'gpt_plus_m', yearlyKey: 'gpt_plus_y', name: 'Plus', inApp: 'ChatGPT Plus', label: 'Plus', blurb: 'The standard plan' },
    ],
  },
  {
    id: 'grok', name: 'Grok', app: 'Grok',
    appstore: {
      appId: '6670324846', slug: 'grok',
      // "SuperGrok" alone is the main plan (listed monthly and yearly); Lite, Plus and Heavy are their own
      iap: {
        grok_lite_m: { name: /SuperGrok\s+Lite\b/i, pick: 'min' },
        grok_m: { name: /SuperGrok(?!\s+(?:Lite|Plus|Heavy)\b)/i, pick: 'min' },
        grok_y: { name: /SuperGrok(?!\s+(?:Lite|Plus|Heavy)\b)/i, pick: 'max', yearlyOf: 'grok_m' },
        grok_plus_m: { name: /SuperGrok\s+Plus\b/i, pick: 'min' },
        grok_heavy_m: { name: /SuperGrok\s+Heavy\b/i, pick: 'min' },
      },
    },
    play: { package: 'ai.x.grok' },
    plans: [
      { id: 'grok_lite_m', key: 'grok_lite_m', name: 'SuperGrok Lite', inApp: 'SuperGrok Lite', label: 'Lite', blurb: 'The entry plan' },
      { id: 'grok_m', key: 'grok_m', yearlyKey: 'grok_y', name: 'SuperGrok', inApp: 'SuperGrok', label: 'Super', blurb: 'The main plan' },
      { id: 'grok_plus_m', key: 'grok_plus_m', name: 'SuperGrok Plus', inApp: 'SuperGrok Plus', label: 'Plus', blurb: 'More than SuperGrok' },
      { id: 'grok_heavy_m', key: 'grok_heavy_m', name: 'SuperGrok Heavy', inApp: 'SuperGrok Heavy', label: 'Heavy', blurb: 'The top plan' },
    ],
  },
];

// Extra products without a code change (and for tests): EXTRA_PRODUCTS_JSON, a JSON array of
// { id, name, app, plans: [{ id, key, yearlyKey?, name, label, blurb }] }. Their App Store prices come
// from /price (or the sync, which needs IAP names and so a catalog entry).
if (process.env.EXTRA_PRODUCTS_JSON) {
  try { PRODUCTS.push(...JSON.parse(process.env.EXTRA_PRODUCTS_JSON)); } catch (e) { console.error('EXTRA_PRODUCTS_JSON is not valid JSON:', e.message); }
}

/** Products on sale: PRODUCTS env (comma list), default all three. */
export const enabledProducts = () => {
  const want = String(process.env.PRODUCTS || 'claude,chatgpt,grok').split(',').map((s) => s.trim()).filter(Boolean);
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
// taxBuffer: the most sales tax the store can add on top of its listed price in that country (US, CA list
// prices without tax; elsewhere prices include it, so 0). We can't know the buyer's state or province, so
// we cover the highest rate: US 12% (highest combined state + local rates, e.g. Colorado 2.9% + 9.1%,
// Alabama 4% + 8%; Tax Foundation 2026), Canada 15% (HST). Credit left over stays in the buyer's balance.
// The admin can change a region's rate (settings key tax:<REGION>).
export const REGIONS = {
  US: {
    name: 'United States', flag: '🇺🇸', currency: 'USD', taxBuffer: 0.12,
    prices: {
      pro_m: 20, pro_y: 214.99, max5_m: 124.99, max20_m: 249.99,
      gpt_go_m: 8, gpt_plus_m: 19.99, gpt_plus_y: 200,
      grok_lite_m: 10, grok_m: 30, grok_y: 300, grok_plus_m: 100, grok_heavy_m: 300,
    },
  },
  GB: { name: 'United Kingdom', flag: '🇬🇧', currency: 'GBP', taxBuffer: 0, prices: { pro_m: 20, max5_m: 119.99, max20_m: 249.99 } },
  CA: { name: 'Canada', flag: '🇨🇦', currency: 'CAD', taxBuffer: 0.15, prices: { pro_m: 28, max5_m: 179.99, max20_m: 349.99 } },
  AU: { name: 'Australia', flag: '🇦🇺', currency: 'AUD', taxBuffer: 0, prices: { pro_m: 30, max5_m: 199.99, max20_m: 399.99 } },
  DE: { name: 'Germany', flag: '🇩🇪', currency: 'EUR', taxBuffer: 0, prices: { pro_m: 22, max5_m: 149.99, max20_m: 299.99, gpt_go_m: 7.99, gpt_plus_m: 22.99, gpt_plus_y: 229, grok_m: 35, grok_y: 349, grok_heavy_m: 349 } },
  FR: { name: 'France', flag: '🇫🇷', currency: 'EUR', taxBuffer: 0, prices: { pro_m: 22, max5_m: 149.99, max20_m: 299.99 } },
  JP: { name: 'Japan', flag: '🇯🇵', currency: 'JPY', taxBuffer: 0, prices: { pro_m: 3000, max5_m: 20000, max20_m: 40000, gpt_go_m: 1400, gpt_plus_m: 3000, gpt_plus_y: 30000 } },
  IN: { name: 'India', flag: '🇮🇳', currency: 'INR', taxBuffer: 0, prices: { pro_m: 1999, max5_m: 12900, max20_m: 24900, grok_m: 700, grok_heavy_m: 29900 } },
  TR: { name: 'Türkiye', flag: '🇹🇷', currency: 'TRY', taxBuffer: 0, prices: { pro_m: 999.99, max5_m: 6999.99, max20_m: 12999.99 } },
  BR: { name: 'Brazil', flag: '🇧🇷', currency: 'BRL', taxBuffer: 0, prices: { pro_m: 129.9, max5_m: 799.9, max20_m: 1499.9 } },
  MX: { name: 'Mexico', flag: '🇲🇽', currency: 'MXN', taxBuffer: 0, prices: { pro_m: 399, max5_m: 2499, max20_m: 4999 } },
  KR: { name: 'South Korea', flag: '🇰🇷', currency: 'KRW', taxBuffer: 0, prices: { pro_m: 33000, max5_m: 199000, max20_m: 449000, gpt_go_m: 13000, gpt_plus_m: 29000, gpt_plus_y: 299000 } },
  PH: { name: 'Philippines', flag: '🇵🇭', currency: 'PHP', taxBuffer: 0, prices: { pro_m: 1290, max5_m: 7990, max20_m: 14990 } },
  ID: { name: 'Indonesia', flag: '🇮🇩', currency: 'IDR', taxBuffer: 0, prices: { pro_m: 349000, max5_m: 1999000, max20_m: 3999000 } },
};

// The card picker lives in pricing.js; re-exported here for older imports.
export { pickPackages } from './pricing.js';

export const round2 = (x) => Math.round(x * 100) / 100;
