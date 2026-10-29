// Keeps the Claude in-app prices we sell against in sync with the App Store.
//
// Source: the public App Store page for the Claude app in our storefront, which lists its in-app
// purchases ("Claude Pro - Monthly $20.00", "Claude Pro - Annual $214.99", …). We read it at
// startup and every few hours, sanity-check each price, and store it in settings as
// `apple:<REGION>:<key>`. An admin override (/price, stored as `price:<REGION>:<key>`) still wins.
// Anything odd (page unreadable, a plan missing, a price that jumps more than 2x) changes nothing
// and alerts the admin instead.

export const APP_ID = '6473753684'; // Claude by Anthropic

// Our price keys and the App Store's names for them.
export const IAP_NAMES = {
  pro_m: /Claude\s+Pro\s*[-–—]\s*Monthly/i,
  pro_y: /Claude\s+Pro\s*[-–—]\s*(?:Annual|Yearly)/i,
  max5_m: /Claude\s+Max\s*5\s*[x×]\s*[-–—]\s*Monthly/i,
  max20_m: /Claude\s+Max\s*20\s*[x×]\s*[-–—]\s*Monthly/i,
};

const ENTITIES = { amp: '&', nbsp: ' ', quot: '"', apos: "'", lt: '<', gt: '>', euro: '€', pound: '£', yen: '¥' };

/** Page HTML to plain text: scripts and styles dropped, tags to spaces, entities decoded. */
export function htmlToText(html) {
  return String(html)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
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
export function parsePrice(s) {
  const m = String(s).match(/\d[\d.,\s  ']*\d|\d/);
  if (!m) return null;
  let n = m[0].replace(/[\s  ']/g, '');
  const dec = n.match(/[.,](\d{1,2})$/);
  if (dec) n = n.slice(0, -dec[0].length).replace(/[.,]/g, '') + '.' + dec[1];
  else n = n.replace(/[.,]/g, '');
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** Find each plan's price in the page. Returns { pro_m: 20, pro_y: 214.99, … } for what it found. */
export function extractPrices(html) {
  const text = htmlToText(html);
  const out = {};
  for (const [key, name] of Object.entries(IAP_NAMES)) {
    const m = text.match(name);
    if (!m) continue;
    // the price follows the name: currency symbol or code, then the number (or the number, then the symbol)
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 40);
    const pm = after.match(/^\s*(?:[^\d\s]{1,4}\s?)?\d[\d.,\s  ']*\d(?:\s?[^\d\s]{1,4})?|^\s*(?:[^\d\s]{1,4}\s?)?\d/);
    const v = pm && parsePrice(pm[0]);
    if (v) out[key] = v;
  }
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
export function startApplePriceSync({ region, keys, get, save, notify = () => {}, fetchImpl = fetch, everyHours = 6, log = console, url: pageUrl }) {
  const url = pageUrl || `https://apps.apple.com/${region.toLowerCase()}/app/claude-by-anthropic/id${APP_ID}`;
  let lastProblem = '';
  async function run() {
    try {
      const res = await fetchImpl(url, { headers: { 'accept-language': 'en' }, signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`App Store page HTTP ${res.status}`);
      const fetched = extractPrices(await res.text());
      const current = Object.fromEntries(keys().map((k) => [k, get(k)]));
      const { accept, refused, missing } = reviewPrices(fetched, current);
      const changed = [];
      for (const [k, v] of Object.entries(accept)) {
        if (current[k] !== v) changed.push({ key: k, from: current[k] ?? null, to: v });
        save(k, v);
      }
      if (changed.length) {
        log.log?.(`[prices] App Store ${region}: ${changed.map((c) => `${c.key} ${c.from} → ${c.to}`).join(', ')}`);
        notify({ type: 'apple_prices_changed', region, changed });
      }
      const problem = [
        Object.keys(fetched).length === 0 ? 'no Claude prices found on the page' : '',
        missing.length ? `not found: ${missing.join(', ')}` : '',
        Object.keys(refused).length ? `refused (jump over 2x): ${Object.entries(refused).map(([k, r]) => `${k} ${r.from} → ${r.to}`).join(', ')}` : '',
      ].filter(Boolean).join('; ');
      if (problem && problem !== lastProblem) notify({ type: 'apple_prices_problem', region, problem, url });
      lastProblem = problem;
      return { fetched, changed, refused, missing };
    } catch (e) {
      const problem = `couldn't read the App Store page (${e.message})`;
      if (problem !== lastProblem) notify({ type: 'apple_prices_problem', region, problem, url });
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
