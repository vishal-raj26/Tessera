// Keeps the in-app prices we sell against in sync with the App Store, for any product in the catalog.
//
// Source: the public App Store page for the Claude app in our storefront, which lists its in-app
// purchases ("Claude Pro - Monthly $20.00", "Claude Pro - Annual $214.99", …). We read it at
// startup and every few hours, sanity-check each price, and store it in settings as
// `apple:<REGION>:<key>`. An admin override (/price, stored as `price:<REGION>:<key>`) still wins.
// Anything odd (page unreadable, a plan missing, a price that jumps more than 2x) changes nothing
// and alerts the admin instead.

export const APP_ID = '6473753684'; // Claude by Anthropic (the default; products pass their own)

// Claude's price keys and the App Store's names for them (the default spec; see catalog.js PRODUCTS).
export const IAP_NAMES = {
  pro_m: /Claude\s+Pro\s*[-–—]\s*Monthly/i,
  pro_y: /Claude\s+Pro\s*[-–—]\s*(?:Annual|Yearly)/i,
  max5_m: /Claude\s+Max\s*5\s*[x×]\s*[-–—]\s*Monthly/i,
  max20_m: /Claude\s+Max\s*20\s*[x×]\s*[-–—]\s*Monthly/i,
};

const ENTITIES = { amp: '&', nbsp: ' ', quot: '"', apos: "'", lt: '<', gt: '>', euro: '€', pound: '£', yen: '¥' };

/** Page HTML to plain text: scripts and styles dropped, tags to boundaries (¦), entities decoded. */
export function htmlToText(html) {
  return String(html)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    // every tag becomes a hard boundary (¦), so a price never runs into the next element's text
    .replace(/<[^>]+>/g, ' \u00a6 ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/[\s  ]+/g, ' ');
}

/**
 * A price as the App Store writes it in any storefront: "$20.00", "£19.99", "19,99 €",
 * "¥3,000", "₹1,999.00", "R$ 129,90", "Rp 349.000", "₩33,000", "TRY 999,99".
 * A separator followed by exactly 1–2 digits at the end is the decimal point; others group thousands.
 */
// A number as stores write it: thousands groups of exactly 3 digits (1,299 · 1 299 · 3.999.000 · 1'299),
// then an optional 1–2 digit decimal part. Requiring exact groups stops a price from swallowing a number
// that merely follows it on the page ("$29.99 100 Credits" is 29.99, not 2999100).
const NUM = "\\d{1,3}(?:[.,\\s\\u00a0\\u202f']\\d{3})+(?:[.,]\\d{1,2})?(?!\\d)|\\d+(?:[.,]\\d{1,2})?";
const NUM_RE = new RegExp(NUM);

export function parsePrice(s) {
  const m = String(s).match(NUM_RE);
  if (!m) return null;
  let n = m[0].replace(/[\s  ']/g, '');
  const dec = n.match(/[.,](\d{1,2})$/);
  if (dec) n = n.slice(0, -dec[0].length).replace(/[.,]/g, '') + '.' + dec[1];
  else n = n.replace(/[.,]/g, '');
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * Find each plan's price in the page. `iap` maps our price keys to the App Store's item name: a RegExp,
 * or { name, pick: 'min' | 'max', yearlyOf } when two items share a name (e.g. a plan's monthly and
 * yearly price): 'min' takes the cheaper, 'max' the dearer, and only if both are listed. A yearly price
 * that isn't at least 6x its monthly one is dropped as a misread.
 */
export function extractPrices(html, iap = IAP_NAMES) {
  const text = htmlToText(html);
  const out = {};
  const yearly = [];
  for (const [key, spec] of Object.entries(iap)) {
    const { name, pick = 'first', yearlyOf } = spec instanceof RegExp ? { name: spec } : spec;
    const re = new RegExp(name.source, name.flags.includes('g') ? name.flags : `${name.flags}g`);
    const found = [];
    for (const m of text.matchAll(re)) {
      // the price follows the name: currency symbol or code, then the number (or the number, then the symbol)
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 60);
      // skip the boundaries between the name's element and the price's; the currency mark can't be one
      const pm = after.match(new RegExp(`^[\\s\\u00a6]*(?:[^\\d\\s\\u00a6]{1,4}\\s?)?(?:${NUM})`));
      const v = pm && parsePrice(pm[0]);
      if (v) found.push(v);
    }
    const distinct = [...new Set(found)];
    if (!distinct.length) continue;
    if (pick === 'min') out[key] = Math.min(...distinct);
    else if (pick === 'max') { if (distinct.length >= 2) out[key] = Math.max(...distinct); }
    else out[key] = found[0];
    if (yearlyOf) yearly.push([key, yearlyOf]);
  }
  for (const [key, of] of yearly) if (out[key] && out[of] && out[key] < out[of] * 6) delete out[key];
  return out;
}

/** Compare fetched prices with what we sell at now. Big jumps are refused (likely a parsing slip). */
export function reviewPrices(fetched, current) {
  const accept = {};
  const refused = {};
  for (const [key, v] of Object.entries(fetched)) {
    const cur = current[key];
    if (cur && (v > cur * 2 || v < cur / 2)) refused[key] = { from: cur, to: v };
    else accept[key] = v;
  }
  const missing = Object.keys(current).filter((k) => current[k] && fetched[k] == null);
  return { accept, refused, missing };
}

/**
 * Start syncing. `get(key)` returns the price in use now; `save(key, value)` stores a synced one;
 * `notify(event)` reaches the admin. Runs at start and every `everyHours`.
 */
export function startApplePriceSync({
  region, keys, get, save, notify = () => {}, fetchImpl = fetch, everyHours = 6, log = console, url: pageUrl,
  appId = APP_ID, slug = 'claude-by-anthropic', iap = IAP_NAMES, product = 'Claude',
}) {
  const url = pageUrl || `https://apps.apple.com/${region.toLowerCase()}/app/${slug}/id${appId}`;
  let lastProblem = '';
  async function run() {
    try {
      const res = await fetchImpl(url, { headers: { 'accept-language': 'en' }, signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`App Store page HTTP ${res.status}`);
      const fetched = extractPrices(await res.text(), iap);
      const current = Object.fromEntries(keys().map((k) => [k, get(k)]));
      const { accept, refused, missing } = reviewPrices(fetched, current);
      const changed = [];
      for (const [k, v] of Object.entries(accept)) {
        if (current[k] !== v) changed.push({ key: k, from: current[k] ?? null, to: v });
        save(k, v);
      }
      if (changed.length) {
        log.log?.(`[prices] App Store ${region}: ${changed.map((c) => `${c.key} ${c.from} → ${c.to}`).join(', ')}`);
        notify({ type: 'apple_prices_changed', region, product, changed });
      }
      const problem = [
        Object.keys(fetched).length === 0 ? 'no prices found on the page' : '',
        missing.length ? `not found: ${missing.join(', ')}` : '',
        Object.keys(refused).length ? `refused (jump over 2x): ${Object.entries(refused).map(([k, r]) => `${k} ${r.from} → ${r.to}`).join(', ')}` : '',
      ].filter(Boolean).join('; ');
      if (problem && problem !== lastProblem) notify({ type: 'apple_prices_problem', region, product, problem, url });
      lastProblem = problem;
      return { fetched, changed, refused, missing };
    } catch (e) {
      const problem = `couldn't read the App Store page (${e.message})`;
      if (problem !== lastProblem) notify({ type: 'apple_prices_problem', region, product, problem, url });
      lastProblem = problem;
      log.warn?.(`[prices] ${problem}`);
      return null;
    }
  }
  run();
  const timer = setInterval(run, everyHours * 3600e3);
  timer.unref?.();
  return { run, stop: () => clearInterval(timer) };
}
