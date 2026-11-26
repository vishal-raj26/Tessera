// Top-ups from other chains through Relay (relay.link). Telegram lets bots accept only Stars or GRAM for
// digital services, so Tessera never takes other coins. Instead a buyer gets their own Relay deposit
// address for a coin they hold (USDT, USDC, ETH, SOL or BTC): whatever they send there is swapped and
// arrives as GRAM in *their* TON wallet, and they pay for the plan in GRAM as usual. The address is open
// (reusable, any amount) and its refunds go back to whoever sent the coin.
//
// Modes
//   live  mainnet with on-chain payments: real addresses, real swaps
//   test  anything else (testnet, demo): real Relay prices when it answers, but no address; the app
//         simulates a deposit instead (Relay can't deliver to TON testnet)
//   off   RELAY=off
//
// Relay's /quote/v3 and Solana or Bitcoin deposit addresses need an API key (RELAY_API_KEY, sent as
// x-api-key). Without one, only the EVM routes are offered, through /quote/v2 (retired Feb 2027).

export const TON_CHAIN = 224235520; // Relay's id for TON; its native coin there is GRAM

// what a buyer can pay with: coin, network, Relay chain id, and whether the coin is the chain's own
export const ROUTES = [
  { key: 'usdt-ethereum', coin: 'USDT', network: 'Ethereum', chainId: 1 },
  { key: 'usdt-arbitrum', coin: 'USDT', network: 'Arbitrum', chainId: 42161 },
  { key: 'usdt-bsc', coin: 'USDT', network: 'BNB Chain', chainId: 56 },
  { key: 'usdt-solana', coin: 'USDT', network: 'Solana', chainId: 792703809, needsKey: true },
  { key: 'usdc-base', coin: 'USDC', network: 'Base', chainId: 8453 },
  { key: 'usdc-ethereum', coin: 'USDC', network: 'Ethereum', chainId: 1 },
  { key: 'usdc-arbitrum', coin: 'USDC', network: 'Arbitrum', chainId: 42161 },
  { key: 'usdc-bsc', coin: 'USDC', network: 'BNB Chain', chainId: 56 },
  { key: 'usdc-solana', coin: 'USDC', network: 'Solana', chainId: 792703809, needsKey: true },
  { key: 'eth-base', coin: 'ETH', network: 'Base', chainId: 8453, native: true },
  { key: 'eth-ethereum', coin: 'ETH', network: 'Ethereum', chainId: 1, native: true },
  { key: 'eth-arbitrum', coin: 'ETH', network: 'Arbitrum', chainId: 42161, native: true },
  { key: 'sol-solana', coin: 'SOL', network: 'Solana', chainId: 792703809, native: true, needsKey: true },
  { key: 'btc-bitcoin', coin: 'BTC', network: 'Bitcoin', chainId: 8253038, native: true, needsKey: true },
];

// a valid sender on each kind of chain, for price-only quotes in test mode
const PLACEHOLDER_USER = { evm: '0x0000000000000000000000000000000000000000', svm: '11111111111111111111111111111111', bvm: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq' };

/**
 * How the latest deposit to a top-up address went, ignoring any made before `since` (ms): the address is
 * reused, so an old success mustn't look like this one.
 */
export function readStatus(requests, since = 0) {
  const t = (r) => Date.parse(r.createdAt ?? r.updatedAt ?? 0) || 0;
  const list = (Array.isArray(requests) ? requests : []).filter((r) => t(r) >= since).sort((a, b) => t(b) - t(a));
  const r = list[0];
  if (!r) return { state: 'waiting' };
  const outTx = r.data?.outTxs?.[0]?.hash ?? null;
  if (r.status === 'success') return { state: 'success', requestId: r.id, outTx };
  if (r.status === 'refund' || r.status === 'refunded') return { state: 'refunded', requestId: r.id, outTx };
  if (r.status === 'failure' || r.status === 'failed') return { state: 'failed', requestId: r.id };
  return { state: 'seen', requestId: r.id };
}

// a typical first deposit, in each coin's smallest units: an open address is quoted once with this, then
// accepts any amount
const NOMINAL = { USDT: 20, USDC: 20, ETH: 0.01, SOL: 0.1, BTC: 0.0003 };
const nominal = (coin, decimals) => (BigInt(Math.round((NOMINAL[coin] ?? 1) * 1e8)) * 10n ** BigInt(decimals) / 10n ** 8n).toString();

export function createRelay({
  mode = 'off', apiKey = '', base = 'https://api.relay.link', fetchImpl = globalThis.fetch, now = () => Date.now(), log = console,
} = {}) {
  const headers = { 'content-type': 'application/json', ...(apiKey && { 'x-api-key': apiKey }) };
  const call = async (path, init = {}) => {
    const res = await fetchImpl(`${base}${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(j.message || `Relay ${res.status}`);
      err.status = res.status; err.code = j.errorCode;
      throw err;
    }
    return j;
  };

  // Relay's chain list (token addresses, the native coin's address, vm type), kept for an hour
  let chainsAt = 0; let chains = null;
  async function chainList() {
    if (chains && now() - chainsAt < 3600e3) return chains;
    const j = await call('/chains');
    chains = new Map((j.chains || []).map((c) => [c.id, c]));
    chainsAt = now();
    return chains;
  }
  async function currencyOf(route) {
    const c = (await chainList()).get(route.chainId);
    if (!c || c.disabled || c.depositEnabled === false) return null;
    if (route.native) return { address: c.currency?.address, decimals: c.currency?.decimals, refundTo: c.currency?.address, vm: c.vmType };
    const t = [...(c.erc20Currencies || []), ...(c.solverCurrencies || [])].find((x) => x.symbol === route.coin);
    return t ? { address: t.address, decimals: t.decimals, refundTo: c.currency?.address, vm: c.vmType } : null;
  }

  const offered = () => (mode === 'off' ? [] : ROUTES.filter((r) => !r.needsKey || apiKey || mode === 'test'));

  /** The coins and networks a buyer can pick from right now. */
  async function options() {
    const out = [];
    for (const r of offered()) {
      try { if (await currencyOf(r)) out.push({ key: r.key, coin: r.coin, network: r.network }); } catch { /* Relay unreachable: skip */ }
    }
    // if Relay can't be reached at all, still show the list in test mode (prices just come back empty)
    return out.length || mode !== 'test' ? out : offered().map((r) => ({ key: r.key, coin: r.coin, network: r.network }));
  }

  const routeOf = (routeKey) => {
    const route = offered().find((r) => r.key === routeKey);
    if (!route) throw Object.assign(new Error('This coin isn’t available right now.'), { status: 400 });
    return route;
  };

  /**
   * The buyer's top-up address for one coin: an open Relay deposit address whose deposits arrive as GRAM
   * in `recipient` (the buyer's own TON wallet). In test mode there's no address.
   */
  async function topUpAddress({ routeKey, recipient }) {
    const route = routeOf(routeKey);
    const base = { route: route.key, coin: route.coin, network: route.network, test: mode !== 'live', address: null };
    if (mode !== 'live') return base;
    const cur = await currencyOf(route);
    if (!cur) throw Object.assign(new Error('This coin isn’t available right now.'), { status: 400 });
    const ton = (await chainList()).get(TON_CHAIN);
    const q = await call(apiKey ? '/quote/v3' : '/quote/v2', {
      method: 'POST',
      body: JSON.stringify({
        user: cur.refundTo, recipient,
        originChainId: route.chainId, destinationChainId: TON_CHAIN,
        originCurrency: cur.address, destinationCurrency: ton?.currency?.address,
        amount: nominal(route.coin, cur.decimals), tradeType: 'EXACT_INPUT',
        // open (reusable, any amount); refunds go to whoever sent the coin, which also covers exchanges
        useDepositAddress: true, strict: false, refundTo: cur.refundTo,
      }),
    });
    const dep = (q.steps || []).find((st) => st.depositAddress || st.id === 'deposit');
    const address = typeof dep?.depositAddress === 'string' ? dep.depositAddress : dep?.depositAddress?.address ?? null;
    if (!address) throw Object.assign(new Error('Relay didn’t return an address. Try again.'), { status: 502 });
    return { ...base, address };
  }

  /** About how much of a coin buys `gramNano` GRAM right now (a price only; nothing is created). */
  async function estimate({ routeKey, gramNano, recipient }) {
    const route = routeOf(routeKey);
    const cur = await currencyOf(route);
    if (!cur) return null;
    const ton = (await chainList()).get(TON_CHAIN);
    const q = await call(apiKey ? '/quote/v3' : '/quote/v2', {
      method: 'POST',
      body: JSON.stringify({
        user: PLACEHOLDER_USER[cur.vm] ?? PLACEHOLDER_USER.evm, recipient,
        originChainId: route.chainId, destinationChainId: TON_CHAIN,
        originCurrency: cur.address, destinationCurrency: ton?.currency?.address,
        amount: String(gramNano), tradeType: 'EXACT_OUTPUT',
      }),
    });
    const inAmt = q.details?.currencyIn;
    return inAmt?.amountFormatted ? { amount: inAmt.amountFormatted, usd: inAmt.amountUsd ? Number(inAmt.amountUsd) : null } : null;
  }

  /** How the latest deposit (since `since`) to a live top-up address is going. */
  async function status(address, since = 0) {
    if (!address) return { state: 'waiting' };
    const j = await call(`/requests/v3?depositAddress=${encodeURIComponent(address)}`);
    return readStatus(j.requests, since);
  }

  return { mode, options, topUpAddress, estimate, status, hasKey: !!apiKey };
}
