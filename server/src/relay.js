// Cross-chain payments through Relay (relay.link). A buyer who doesn't hold GRAM pays with a coin they
// have (USDT, USDC, ETH, SOL or BTC) by sending it to a one-time Relay deposit address; Relay swaps it
// and delivers the order's exact GRAM amount to our merchant wallet. We never touch the other chain:
// we ask Relay for the address and the amount, then ask Relay how that deposit went.
//
// Modes
//   live  mainnet with on-chain payments: real deposit addresses, real swaps
//   test  anything else (testnet, demo): real Relay prices when it answers, but no deposit address, and
//         the app offers "Simulate payment" instead (Relay can't deliver to TON testnet)
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

/** Where a deposit stands, from Relay's request records for its address. */
export function readStatus(requests) {
  const list = Array.isArray(requests) ? requests : [];
  const ok = list.find((r) => r.status === 'success');
  if (ok) return { state: 'success', requestId: ok.id, outTx: ok.data?.outTxs?.[0]?.hash ?? null };
  const refund = list.find((r) => r.status === 'refund' || r.status === 'refunded');
  if (refund) return { state: 'refunded', requestId: refund.id, outTx: refund.data?.outTxs?.[0]?.hash ?? null };
  const failed = list.find((r) => r.status === 'failure' || r.status === 'failed');
  if (failed) return { state: 'failed', requestId: failed.id };
  // a deposit Relay has seen but not finished (pending, depositing, waiting with an in-tx)
  const seen = list.find((r) => r.status === 'pending' || r.status === 'depositing' || (r.data?.inTxs?.length ?? 0) > 0);
  if (seen) return { state: 'seen', requestId: seen.id };
  return { state: 'waiting' };
}

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

  /**
   * A deposit for one order: send `amountIn` of the coin to `address` and Relay delivers exactly
   * `gramNano` GRAM to `recipient`. In test mode there's no address (nothing must be sent).
   */
  async function createDeposit({ routeKey, gramNano, recipient }) {
    const route = offered().find((r) => r.key === routeKey);
    if (!route) throw Object.assign(new Error('This coin isn’t available right now.'), { status: 400 });
    if (mode === 'test') {
      // test mode never sends anything, so a Relay outage only costs the shown amount
      try { return await quoteDeposit(route, gramNano, recipient); } catch (e) {
        log.warn?.('[relay] test quote failed:', e.message);
        return { route: route.key, coin: route.coin, network: route.network, chainId: route.chainId, address: null, test: true, requestId: null, amount: null, amountFormatted: null, decimals: null, usd: null, feeUsd: null };
      }
    }
    return quoteDeposit(route, gramNano, recipient);
  }

  async function quoteDeposit(route, gramNano, recipient) {
    const cur = await currencyOf(route);
    if (!cur) throw Object.assign(new Error('This coin isn’t available right now.'), { status: 400 });
    const ton = (await chainList()).get(TON_CHAIN);
    const live = mode === 'live';
    const body = {
      user: live ? cur.refundTo : PLACEHOLDER_USER[cur.vm] ?? PLACEHOLDER_USER.evm,
      recipient,
      originChainId: route.chainId,
      destinationChainId: TON_CHAIN,
      originCurrency: cur.address,
      destinationCurrency: ton?.currency?.address,
      amount: String(gramNano),
      tradeType: 'EXACT_OUTPUT',
      ...(live && {
        useDepositAddress: true,
        strict: true,
        // the chain's native-coin address means "refund whoever sent it", which also works when the buyer
        // sends from an exchange (their own address there isn't theirs)
        refundTo: cur.refundTo,
      }),
    };
    const q = await call(apiKey ? '/quote/v3' : '/quote/v2', { method: 'POST', body: JSON.stringify(body) });
    const dep = (q.steps || []).find((s) => s.depositAddress || s.id === 'deposit');
    const address = typeof dep?.depositAddress === 'string' ? dep.depositAddress : dep?.depositAddress?.address ?? null;
    if (live && !address) throw Object.assign(new Error('Relay didn’t return a deposit address. Try again.'), { status: 502 });
    const inAmt = q.details?.currencyIn;
    return {
      route: route.key, coin: route.coin, network: route.network, chainId: route.chainId,
      address: live ? address : null,
      test: !live,
      requestId: q.requestId ?? dep?.requestId ?? null,
      amount: inAmt?.amount ?? null, // smallest units
      amountFormatted: inAmt?.amountFormatted ?? null,
      decimals: inAmt?.currency?.decimals ?? cur.decimals,
      usd: inAmt?.amountUsd ? Number(inAmt.amountUsd) : null,
      feeUsd: q.fees?.relayer?.amountUsd ? Number(q.fees.relayer.amountUsd) : null,
    };
  }

  /** How a live deposit is going: waiting, seen, success, refunded or failed. */
  async function status(address) {
    if (!address) return { state: 'waiting' };
    const j = await call(`/requests/v3?depositAddress=${encodeURIComponent(address)}`);
    return readStatus(j.requests);
  }

  return { mode, options, createDeposit, status, hasKey: !!apiKey, log };
}
