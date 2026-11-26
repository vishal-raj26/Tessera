import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, animate, motion, useMotionValue, useTransform, type MotionValue } from 'framer-motion';
import { CHAIN, useTonAddress, useTonConnectUI } from '@tonconnect/ui-react';
import { api, fmtGram, fmtStars, fmtMoney, termLabel, planName, type AppConfig, type Order, type Region, type PayMethod, type CoinRoute, type Plan, type Quote, type Referral, type StoreId } from './api';
import { tg } from './tg';
import { PLAN_LABEL } from './components/HoloCard';
import { PlanCarousel } from './components/PlanCarousel';
import { Sheet } from './components/Sheet';
import { Guide } from './components/Guide';
import { GramIcon } from './components/GramIcon';
import { Header } from './components/Header';
import { Showcase } from './components/Showcase';
import { Onboarding } from './components/Onboarding';
import { Wallet } from './components/Wallet';
import { RedeemCodes } from './components/RedeemCodes';
import { rememberTiers } from './tiers';
import { CountUp } from './components/CountUp';
import { latestCoverage } from './coverage';
import { pricesShown, renewStep, type RenewTarget } from './renew';
import { shownBalance } from './balance';
import { createMarkQueue } from './markQueue';
import { Amount } from './components/Amount';
import { StarIcon } from './components/StarIcon';
import { TermPicker } from './components/TermPicker';
import { Segmented } from './components/Segmented';
import { Aurora, type AuroraInputs } from './components/Aurora';
import { Tally } from './components/Tally';
import { PULL } from './components/PlanCarousel';
import { TopUp } from './components/TopUp';
import { CoinStack } from './components/CoinStack';
import { RegionPop, RegionSheet } from './components/Region';
import { WalletSheet } from './components/WalletSheet';
import { Profile } from './components/Profile';

type View = 'home' | 'paying' | 'done' | 'wallet' | 'me';
type SheetName = null | 'review' | 'guide' | 'topup' | 'region';

const rise = (delay = 0) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { type: 'spring' as const, stiffness: 200, damping: 24, delay },
});

/** Ticks on its own, so the rest of the app doesn't re-render every second. */
function Countdown({ until }: { until: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const left = Math.max(0, Math.floor((until - now) / 1000));
  return <>{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</>;
}

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [allPlans, setPlans] = useState<Plan[] | null>(null); // every product's plans, for one store
  // which app's plans are shown (products on sale come from the server), and which store the credit is for:
  // the buyer's phone decides by default (Android -> Google Play), and Play is only offered once priced
  const [productPick, setProductPick] = useState<string | null>(null);
  const [storePick, setStorePick] = useState<StoreId>(() => {
    try { const s = localStorage.getItem('store'); if (s === 'play' || s === 'appstore') return s; } catch { /* ignore */ }
    return tg.platform === 'android' ? 'play' : 'appstore';
  });
  const [storesPriced, setStoresPriced] = useState<Partial<Record<StoreId, boolean>>>({ appstore: true });
  const [pricesUpdating, setPricesUpdating] = useState(false);
  const [index, setIndex] = useState(0);
  const [view, setView] = useState<View>('home');
  // on the home view: the showcase of every app (true) or one app's plans and purchase (false)
  const [browsing, setBrowsing] = useState(true);
  const [sheet, setSheet] = useState<SheetName>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [history, setHistory] = useState<Order[] | null>(null);
  const [historyErr, setHistoryErr] = useState<string | null>(null);
  const [guideFor, setGuideFor] = useState<Order | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [lost, setLost] = useState(0); // consecutive failed polls while paying
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [walletSent, setWalletSent] = useState(false);
  const [held, setHeld] = useState<Quote | null>(null); // price locked while the review sheet is open
  const [settled, setSettled] = useState(false);
  // how far the front card is pulled down; the price, terms and hint below make way as it comes
  const pull = useMotionValue(0);
  // the first time someone sees a plan, the card shows the gesture itself: it dips down twice and
  // springs back (once per Telegram account)
  const hinted = useRef(false);
  const hold = useMotionValue(0); // pressing the card already dims what's below, so the rays stand out
  const belowOpacity = useTransform([pull, hold] as MotionValue<number>[], ([p, h]: number[]) => Math.min(1 - Math.min(1, p / 60), 1 - h * 0.6));
  const belowY = useTransform(pull, [0, 140], [0, 48]);
  // the aurora (components/Aurora.tsx): light resting at the bottom edge, flowing down into it. Pulling
  // the card raises a path of light up to it (reach, glow); letting go draws it back down into the
  // bottom (flood); then a glowing edge and an orb while paying (rim, orb)
  const scene = useMotionValue(0);      // how lit the current screen is at rest
  const [flash, setFlash] = useState(0); // counts issued codes: each one floods the whole screen once
  const flood = useMotionValue(0);      // after letting go: rises to meet the card (→1), then sinks (→0)
  const auroraRim = useMotionValue(0);
  const auroraOrb = useMotionValue(0);
  const auroraBeam = useMotionValue(0);     // the beam around the edge once the code is issued: its head
  const auroraBeamGlow = useMotionValue(0); // and its brightness
  const beamFor = useRef<string | null>(null); // the order it last ran for: once per purchase
  const pullShare = useTransform(pull, (p) => Math.min(1.15, Math.max(0, p) / PULL));
  const auroraSweep = useMotionValue(0);
  const auroraSweepGlow = useMotionValue(0);
  const auroraReach = useTransform([pullShare, flood] as MotionValue<number>[], ([q, f]: number[]) => Math.max(0.14 + q * 0.48, f * 0.72));
  const auroraGlow = useTransform([pullShare, hold, flood, scene] as MotionValue<number>[], ([q, h, f, b]: number[]) =>
    Math.min(1, b + h * 0.15 + q * 0.4 + Math.sin(Math.min(1, f) * Math.PI) * 0.5));
  const aurora = useMemo<AuroraInputs>(() => ({ reach: auroraReach, glow: auroraGlow, sweep: auroraSweep, sweepGlow: auroraSweepGlow, rim: auroraRim, orb: auroraOrb, beam: auroraBeam, beamGlow: auroraBeamGlow }), [auroraReach, auroraGlow, auroraSweep, auroraSweepGlow, auroraRim, auroraOrb, auroraBeam, auroraBeamGlow]);
  const [intro, setIntro] = useState<boolean | null>(null); // null while we check
  // the opening logo (index.html) has gone once round (~1.9 s) and the app knows its first screen: fade it out
  useEffect(() => {
    if (intro === null) return;
    const el = document.getElementById('splash');
    if (!el) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const wait = Math.max(0, (reduce ? 300 : 1950) - performance.now());
    const t = setTimeout(() => { el.classList.add('gone'); setTimeout(() => el.remove(), 500); }, wait);
    return () => clearTimeout(t);
  }, [intro]);
  const [canHome, setCanHome] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(location.search).has('intro')) { setIntro(true); return; }
    tg.getFlag('onboarded').then((seen) => setIntro(!seen));
  }, []);
  const finishIntro = useCallback(() => { tg.setFlag('onboarded'); setIntro(false); }, []);

  const [tonConnectUI] = useTonConnectUI();
  // dev server only (stripped from builds): ?devwallet=<address> stands in for a connected wallet in tests
  const devWallet = import.meta.env.DEV ? new URLSearchParams(location.search).get('devwallet') ?? '' : '';
  const wallet = useTonAddress() || devWallet;

  // the buyer's store country: which region's cards and prices are theirs. Chosen in onboarding (or the
  // region sheet), kept in their Telegram cloud storage; until then the server's default region prices.
  const [region, setRegionState] = useState<string | null>(() => { try { return localStorage.getItem('region'); } catch { return null; } });
  const regionRef = useRef(region);
  regionRef.current = region;
  useEffect(() => { tg.getValue('region').then((v) => { if (v && v !== regionRef.current) setRegionState(v); }); }, []);
  const [regions, setRegions] = useState<Region[]>([]);
  const [joinedAt, setJoinedAt] = useState<number | null>(null);
  const [referral, setReferral] = useState<Referral | null>(null);
  // fresh numbers each time the dashboard opens
  useEffect(() => { if (view === 'me') api.referral().then(setReferral).catch(() => {}); }, [view]);

  const [bootErr, setBootErr] = useState(false);
  const store: StoreId = storesPriced[storePick] ? storePick : 'appstore';
  // which store's prices are loaded (Renew waits for the right one)
  const [catalogStore, setCatalogStore] = useState<StoreId | null>(null);
  const applyCatalog = useCallback((c: Awaited<ReturnType<typeof api.catalog>>) => {
    rememberTiers(c.plans); setPlans(c.plans); setPricesUpdating(!!c.pricesUpdating); setCatalogStore(c.store ?? 'appstore');
    if (c.storesPriced) setStoresPriced(c.storesPriced);
  }, []);
  const load = useCallback(() => {
    setBootErr(false);
    api.config()
      .then(async (c) => {
        setConfig(c);
        api.regions().then(setRegions).catch(() => {});
        // me() first: opening through a friend's link is recorded there, before the referral card loads
        api.me().then((m) => setJoinedAt(m.joinedAt)).catch(() => {}).finally(() => api.referral().then(setReferral).catch(() => {}));
        const rc = regionRef.current ?? c.region;
        let cat = await api.catalog(rc, storePick);
        // the preferred store has nothing priced (e.g. Google Play not set up yet): use the App Store
        if (storePick !== 'appstore' && cat.storesPriced && !cat.storesPriced[storePick]) cat = await api.catalog(rc, 'appstore');
        applyCatalog(cat);
      })
      .catch(() => setBootErr(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { tg.boot(); load(); }, [load]);
  const R = region ?? config?.region ?? 'US';
  // a new store country: its prices
  const firstRegion = useRef(true);
  useEffect(() => {
    if (firstRegion.current) { firstRegion.current = false; return; }
    if (config) api.catalog(R, store).then(applyCatalog).catch(() => {});
  }, [R]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (intro === false && config && !region && regions.length && view === 'home') setSheet((x) => x ?? 'region');
  }, [intro, config, region, regions.length, view]);
  // the small popovers dropping from the top bar
  const [pop, setPop] = useState<null | 'region' | 'wallet'>(null);
  const pickRegion = useCallback((code: string) => {
    setRegionState(code);
    tg.setValue('region', code);
    tg.notify('success');
  }, []);
  // the buyer's orders, for the personal header (also what Your codes shows first)
  useEffect(() => { if (config && history === null) api.orders().then(setHistory).catch(() => {}); }, [config]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live prices: refresh every 30s on the home screen and whenever the app comes back to the
  // front; the price rolls to its new value. Paused while the review sheet holds a price.
  useEffect(() => {
    if (!config || view !== 'home' || sheet) return;
    const refresh = () => {
      if (document.hidden) return;
      api.catalog(R, store).then(applyCatalog).catch(() => {});
    };
    const id = setInterval(refresh, 30_000);
    const onShow = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onShow);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onShow); };
  }, [config, view, sheet, store, applyCatalog, R]);

  // connection state: show a quiet bar when offline, reload what failed when it comes back
  useEffect(() => {
    const up = () => { setOnline(true); setLost(0); if (!allPlans) load(); };
    const down = () => setOnline(false);
    addEventListener('online', up);
    addEventListener('offline', down);
    return () => { removeEventListener('online', up); removeEventListener('offline', down); };
  }, [allPlans, load]);

  const products = config?.products ?? [];
  const productId = productPick ?? products[0]?.id ?? 'claude';
  const product = products.find((p) => p.id === productId);
  // this app's plans that can be bought in this store (all of them while prices are updating, so the
  // carousel never empties)
  const plans = useMemo(() => {
    if (!allPlans) return null;
    const mine = allPlans.filter((p) => (p.product?.id ?? 'claude') === productId);
    const sellable = mine.filter((p) => p.available);
    return sellable.length ? sellable : mine;
  }, [allPlans, productId]);
  // labels follow the prices actually loaded (renew.ts): another store's prices never get this store's name
  const prices = pricesShown(store, catalogStore);
  const storeLabel = config?.stores?.find((s) => s.id === prices.store)?.label ?? 'App Store';
  const storeOwner = prices.store === 'play' ? 'Google' : 'Apple';
  function pickProduct(id: string) {
    tg.select();
    if (id !== productId) { setProductPick(id); setIndex(0); }
    setErr(null); setBrowsing(false);
  }
  function pickStore(s: StoreId) {
    if (s === store || !config) return;
    tg.select(); setStorePick(s); setIndex(0); setErr(null);
    try { localStorage.setItem('store', s); } catch { /* ignore */ }
    api.catalog(R, s).then(applyCatalog).catch(() => {});
  }
  const plan = plans?.[index];
  // testnet charges a fraction of the real price (TEST_PRICE_SCALE); the app says so next to the price
  const testScale = config?.network === 'testnet' ? (config.testScale ?? 1) : 1;
  // how long: kept across plan swipes; a plan without that term (Max has no yearly plan) shows its closest one
  const [months, setMonths] = useState(1);
  const term = plan?.terms?.find((t) => t.months === months)
    ?? [...(plan?.terms ?? [])].reverse().find((t) => t.months < months) ?? plan?.terms?.[0];
  // in the review sheet, the held quote once it has arrived
  // the held quote, only if it's for exactly what the review shows (plan, store, term)
  const heldOk = !!held && held.planId === plan?.id && held.store === store && held.months === term?.months ? held : null;
  const shown = sheet === 'review' && heldOk ? heldOk : term;
  const pickTerm = (m: number) => { if (m !== term?.months) { tg.select(); setMonths(m); setErr(null); } };

  // a purchase just delivered: refresh the buyer's orders so the header and the codes badge include it
  useEffect(() => {
    if (order?.status === 'delivered') {
      api.orders().then(setHistory).catch(() => {});
      api.referral().then(setReferral).catch(() => {}); // credit this order used is gone now
    }
  }, [order?.id, order?.status]);


  // codes bought but not redeemed yet: the badge on the top bar's codes button
  const codesLeft = (history ?? []).reduce((n, o) => n + (o.status === 'delivered' ? (o.codes ?? []).filter((c) => !c.redeemedAt).length : 0), 0);

  // the connected wallet's GRAM balance for the top bar: on connect, every 30 s while the app is open,
  // and when the app comes back to the front. Unknown (null) shows the short address instead.
  // Kept with the address it belongs to: after switching wallets, the old wallet's balance is never
  // shown for the new one (the pill shows the short address until the new balance arrives).
  const [walletBal, setWalletBal] = useState<{ address: string; gram: number | null } | null>(null);
  const balance = shownBalance(walletBal, wallet);
  useEffect(() => {
    if (!wallet || !config) { setWalletBal(null); return; }
    let alive = true;
    const address = wallet;
    const get = () => { if (!document.hidden) api.balance(address).then((b) => { if (alive) setWalletBal({ address, gram: b.gram }); }).catch(() => {}); };
    get();
    const id = setInterval(get, 30_000);
    document.addEventListener('visibilitychange', get);
    return () => { alive = false; clearInterval(id); document.removeEventListener('visibilitychange', get); };
  }, [wallet, config, view]);

  // returning buyers: the plan they bought last and how long its credit still lasts
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setClock(Date.now()), 60_000); return () => clearInterval(id); }, []);
  const cover = useMemo(() => latestCoverage(history, clock), [history, clock]);
  // Renew: open the review for exactly the last purchase (same app, store, plan and term), or say it
  // can't be renewed. The decisions are in renew.ts.
  const [renewing, setRenewing] = useState<RenewTarget | null>(null);
  const cantRenew = () => {
    setRenewing(null);
    setErr("That plan can't be renewed here right now.");
    tg.notify('error');
  };
  function renew() {
    if (!cover || !config) return;
    setBrowsing(false);
    const o = cover.order;
    const target: RenewTarget = { product: o.product?.id || productId, store: o.store?.id ?? 'appstore', planId: o.plan.id, months: o.months ?? 1 };
    tg.tap('light');
    setErr(null);
    // where the screen was, to go back to if that store's prices can't be loaded
    const before = { storePick, productPick };
    if (target.product !== productId) setProductPick(target.product);
    if (target.store !== store) {
      // load that store's own prices first; until they arrive the screen keeps the loaded store's name
      // and can't buy (pricesShown), and Renew waits for them (renewStep)
      setStorePick(target.store as StoreId);
      api.catalog(R, target.store as StoreId).then(applyCatalog).catch(() => {
        setStorePick(before.storePick);
        setProductPick(before.productPick);
        cantRenew();
      });
    }
    setRenewing(target);
  }
  useEffect(() => {
    if (!renewing) return;
    const step = renewStep(renewing, { catalogStore, store, productId, plans, index, months: term?.months ?? months });
    if (step.do === 'fail') cantRenew();
    else if (step.do === 'index') setIndex(step.index);
    else if (step.do === 'months') setMonths(step.months);
    else if (step.do === 'open') { setRenewing(null); reviewRef.current(); }
  }, [renewing, catalogStore, store, productId, plans, index, months, term?.months]); // eslint-disable-line react-hooks/exhaustive-deps

  // the screen's store has no prices loaded (a store that stopped being priced, or a Renew that ended):
  // load them. Renew loads its own and is waited for.
  useEffect(() => {
    if (!config || renewing || prices.ready) return;
    api.catalog(R, store).then(applyCatalog).catch(() => {});
  }, [config, renewing, prices.ready, store, applyCatalog]);

  // how to pay: the buyer's last choice, but only offer what this plan can be paid with right now
  const [method, setMethod] = useState<PayMethod>(() => { try { return localStorage.getItem('pay') === 'stars' ? 'stars' : 'gram'; } catch { return 'gram'; } });
  const payWith: PayMethod = !config?.stars || !term?.stars ? 'gram' : term?.gram == null ? 'stars' : method;
  // referral credit comes off GRAM prices: what's left to send from the wallet
  const refOff = payWith === 'gram' && heldOk?.refCredit ? heldOk.refCredit : 0;
  const payGram = refOff && heldOk?.payGram != null ? heldOk.payGram : shown?.gram ?? null;
  const bothMethods = !!config?.stars && term?.gram != null && term?.stars != null;
  function chooseMethod(m: PayMethod) {
    if (m === method) return;
    tg.select(); setMethod(m); setErr(null);
    try { localStorage.setItem('pay', m); } catch { /* ignore */ }
  }
  const needsWallet = config?.paymentMode === 'chain' && !wallet && payWith === 'gram';
  // topping up GRAM from another chain (through Relay, into the buyer's own wallet): the coins on offer
  const [coins, setCoins] = useState<CoinRoute[]>([]);
  const [coinIcons, setCoinIcons] = useState<Record<string, string>>({});
  const [chainIcons, setChainIcons] = useState<Record<string, string>>({});
  const coinList = useMemo(() => [...new Set(coins.map((c) => c.coin))], [coins]);
  const [topUpNeed, setTopUpNeed] = useState(0);
  const [topUpFrom, setTopUpFrom] = useState<'checkout' | 'bar'>('checkout');
  const canTopUp = coins.length > 0 && config?.relay !== 'off';
  const openTopUp = () => { tg.select(); setTopUpNeed(0); setTopUpFrom('bar'); setSheet('topup'); };
  useEffect(() => {
    if (!config?.relay || config.relay === 'off') return;
    api.relayOptions().then((r) => { setCoins(r.options); setCoinIcons(r.icons ?? {}); setChainIcons(r.chainIcons ?? {}); }).catch(() => {});
  }, [config]);
  // closing any sheet also abandons a quote still on its way, and drops the one shown
  const quoteSeq = useRef(0);
  const closeSheet = useCallback(() => { quoteSeq.current++; setHeld(null); setSheet(null); }, []);

  const home = useCallback(() => {
    setView('home'); setOrder(null); setErr(null); setSheet(null);
  }, []);
  const toHome = useCallback(() => { setView('home'); setSheet(null); }, []);
  useEffect(() => (view === 'done' && !sheet ? tg.back(home) : undefined), [view, sheet, home]);
  useEffect(() => (view === 'me' && !sheet ? tg.back(toHome) : undefined), [view, sheet, toHome]);
  // in one app's plans, Back returns to the showcase of every app
  useEffect(() => (view === 'home' && !browsing && !sheet ? tg.back(() => setBrowsing(true)) : undefined), [view, browsing, sheet]);


  // don't let a stray swipe close the app while money is moving
  const plansReady = !!plans?.length;
  useEffect(() => {
    if (hinted.current || view !== 'home' || browsing || !plansReady || sheet) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let stop: (() => void) | undefined;
    const t = setTimeout(() => {
      tg.getFlag('pullhint').then((seen) => {
        if (seen || hinted.current) return;
        hinted.current = true;
        tg.setFlag('pullhint');
        const a = animate(pull, [0, 64, 0, 0, 64, 0], { duration: 2.6, times: [0, 0.22, 0.45, 0.55, 0.77, 1], ease: 'easeInOut' });
        stop = () => { a.stop(); pull.set(0); };
      });
    }, 1700);
    return () => { clearTimeout(t); stop?.(); };
  }, [view, browsing, plansReady, sheet, pull]);
  useEffect(() => { tg.guardClose(view === 'paying'); return () => tg.guardClose(false); }, [view]);
  // after the first delivery, offer a home-screen shortcut (Mini Apps 2.0)
  useEffect(() => { if (view === 'done') tg.canAddToHome().then(setCanHome); }, [view]);

  // poll while paying
  useEffect(() => {
    if (view !== 'paying' || !order) return;
    const id = setInterval(async () => {
      try {
        const o = await api.order(order.id);
        setOrder(o);
        setLost(0);
        if (o.status === 'delivered') setView('done');
        else if (o.status === 'failed' || o.status === 'expired' || o.status === 'refunded' || o.status === 'underpaid') tg.notify('error');
      } catch { setLost((n) => n + 1); /* keep polling */ }
    }, 1500);
    return () => clearInterval(id);
  }, [view, order?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // done: the check draws and the credit counts up while the edge glows, then the codes arrive
  useEffect(() => {
    if (view !== 'done') return;
    setSettled(false);
    tg.notify('success');
    const t = setTimeout(() => setSettled(true), 2100);
    return () => clearTimeout(t);
  }, [view]);

  // how lit each screen is, and the edge and orb while paying and when it's done
  useEffect(() => {
    const failedNow = order?.status === 'failed' || order?.status === 'expired' || order?.status === 'refunded';
    const to = (mv: MotionValue<number>, v: number, d = 0.8) => animate(mv, v, { duration: d, ease: 'easeInOut' });
    if (view === 'home') { to(scene, sheet ? 0.18 : 0.42); to(auroraRim, 0); to(auroraOrb, 0); }
    else if (view === 'paying') {
      // warming up: the light at the bottom grows a step at a time (approve → seen → confirmed); the
      // screen's edge stays dark until the credit is being issued
      const st = order?.status;
      const stage = failedNow ? -1 : st === 'paid' || st === 'fulfilling' || st === 'delivered' ? 3 : order?.paymentSeen || st === 'underpaid' ? 2 : walletSent ? 1 : 0;
      to(scene, [0.14, 0.22, 0.32, 0.4][stage] ?? 0.08, 1.6);
      to(auroraOrb, [0.15, 0.32, 0.52, 0.75][stage] ?? 0, 1.6);
      to(auroraRim, stage === 3 ? 0.3 : 0, stage === 3 ? 2.2 : 0.8);
      auroraBeamGlow.set(0);
    }
    else if (view === 'done') {
      // issued: a beam of light runs once around the edge, then the whole screen floods and settles
      to(scene, 0.18); to(auroraOrb, 0, 1.2); to(auroraRim, 0.12, 1.2);
      if (matchMedia('(prefers-reduced-motion: reduce)').matches || beamFor.current === (order?.id ?? '')) return;
      beamFor.current = order?.id ?? '';
      // one lap of the beam around the edge; as it closes the loop, the light floods the whole screen once
      auroraBeam.set(0);
      animate(auroraBeamGlow, [0, 1, 1, 0], { duration: 1.75, times: [0, 0.08, 0.8, 1] });
      animate(auroraBeam, 1, { duration: 1.6, ease: [0.4, 0.05, 0.3, 1] });
      // not cancelled by later updates to this screen: the beam is already running, so the flood must follow
      setTimeout(() => {
        animate(auroraRim, [auroraRim.get(), 1, 1, 0.2], { duration: 2.6, times: [0, 0.12, 0.5, 1] });
        animate(flood, [0, 1, 0], { duration: 1.8, times: [0, 0.3, 1], ease: 'easeInOut' });
        setFlash((n) => n + 1);
      }, 1500);
    } else { to(scene, 0.25); to(auroraRim, 0); to(auroraOrb, 0); }
  }, [view, sheet, order?.status, order?.paymentSeen, walletSent, scene, auroraRim, auroraOrb, auroraBeam, auroraBeamGlow, flood]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1600);
    return () => clearTimeout(t);
  }, [toast]);

  // stable handle for the memoised carousel, always calling the latest openReview
  const reviewRef = useRef<() => void>(() => {});
  const onPull = useCallback(() => {
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // the path flares up to the card, then sinks back down into the bottom behind it
      flood.set(0.85);
      animate(flood, [0.85, 1, 0], { duration: 1.2, times: [0, 0.25, 1], ease: [[0.4, 0, 0.2, 1], [0.55, 0, 0.75, 0.2]] });
    }
    reviewRef.current();
  }, [flood]);
  function openReview() {
    if (!plan?.available || !term || !prices.ready) return;
    if (needsWallet && !bothMethods) { tonConnectUI.openModal(); return; }
    setAgree(false);
    setErr(null);
    setHeld(null);
    setSheet('review');
    // lock this price for 20 minutes; the sheet shows it and the order uses it. Only the answer to this
    // request counts: one for a review that was closed or reopened since is ignored.
    const seq = ++quoteSeq.current;
    api.quote(R, store, plan.id, term.months)
      .then((q) => { if (seq === quoteSeq.current) setHeld(q); })
      .catch((e) => { if (seq === quoteSeq.current) setErr(e instanceof Error ? e.message : String(e)); });
  }
  reviewRef.current = openReview;


  async function pay() {
    if (!plan || !term || !config) return;
    setBusy(true);
    setErr(null);
    try {
      const o = await api.createOrder(R, store, plan.id, term.months, payWith, wallet || undefined, heldOk?.id);
      setOrder(o);
      setWalletSent(false);
      if (payWith === 'stars' && o.invoiceLink) {
        // Telegram's own checkout sheet; the code is issued once Telegram confirms the charge
        const st = await tg.openInvoice(o.invoiceLink);
        if (st !== 'paid' && st !== 'pending') throw new Error(st === 'cancelled' ? 'cancelled' : 'Telegram could not complete the payment. Nothing was charged.');
        tg.notify('success');
        setWalletSent(true);
        setSheet(null);
        setView('paying');
      } else if (payWith === 'stars') {
        // Demo mode: no bot, so pretend Telegram approved it
        setSheet(null);
        setView('paying');
        await new Promise((r) => setTimeout(r, 1100));
        setWalletSent(true);
        tg.tap('medium');
        await api.mockPay(o.id);
      } else if (o.amountNano === '0') {
        // invite credit covered the whole price: nothing to send, the order is already paid
        tg.notify('success');
        setWalletSent(true);
        setSheet(null);
        setView('paying');
      } else if (config.paymentMode === 'chain' && o.merchant) {
        await tonConnectUI.sendTransaction({
          validUntil: Math.floor(o.expiresAt / 1000),
          network: o.network === 'testnet' ? CHAIN.TESTNET : CHAIN.MAINNET,
          messages: [{ address: o.merchant, amount: o.amountNano, payload: o.payload }],
        });
        setWalletSent(true);
        setSheet(null);
        setView('paying');
      } else {
        // Demo mode: simulate wallet approval and on-chain confirmation.
        setSheet(null);
        setView('paying');
        await new Promise((r) => setTimeout(r, 1400));
        setWalletSent(true);
        tg.tap('medium');
        await api.mockPay(o.id);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(/reject|cancel|declin/i.test(msg) ? (payWith === 'stars' ? 'Payment cancelled. Nothing was charged.' : 'Payment cancelled in your wallet. Nothing was charged.') : msg);
      tg.notify('error');
    } finally {
      setBusy(false);
    }
  }

  function copy(code: string) {
    navigator.clipboard?.writeText(code)
      .then(() => { setCopied(code); setToast('Code copied'); tg.notify('success'); setTimeout(() => setCopied(null), 1600); })
      .catch(() => setToast('Press and hold to copy'));
  }

  // tick a code as redeemed (or take the tick off): shown at once; saves go one at a time per code and the
  // screen always ends on what the server has (see markQueue.ts)
  const showMark = useCallback((orderId: string, index: number, value: number | null) => {
    const set = (x: Order) => (x.id !== orderId || !x.codes ? x : { ...x, codes: x.codes.map((c, k) => (k === index ? { ...c, redeemedAt: value } : c)) });
    setOrder((cur) => (cur ? set(cur) : cur));
    setHistory((h) => (h ? h.map(set) : h));
  }, []);
  const marks = useMemo(() => createMarkQueue({
    send: (orderId, index, redeemed) => api.markCode(orderId, index, redeemed).then((o) => o.codes?.[index]?.redeemedAt ?? null),
    show: showMark,
    failed: (_o, index, redeemed) => {
      setToast(redeemed ? `Couldn't save the tick on code ${index + 1}. Tap Redeem again.` : "Couldn't remove the tick. Try again.");
      tg.notify('error');
    },
  }), [showMark]);
  const markCode = useCallback((o: Order, index: number, redeemed: boolean) => {
    marks.mark(o.id, index, o.codes?.[index]?.redeemedAt ?? null, redeemed);
  }, [marks]);

  const loadHistory = useCallback(() => {
    setHistoryErr(null);
    api.orders().then(setHistory).catch((e) => setHistoryErr(e.message));
  }, []);
  function openOrders() {
    if (view === 'wallet') { toHome(); return; }
    if (view === 'paying') return; // stay on the payment until it settles
    tg.tap('light');
    setSheet(null);
    setView('wallet');
    loadHistory();
  }
  function openMe() {
    if (view === 'me') { toHome(); return; }
    if (view === 'paying') return;
    tg.tap('light');
    setSheet(null); setPop(null);
    setView('me');
    loadHistory();
  }
  function openGuide(o: Order) { setGuideFor(o); setSheet('guide'); }

  const status = order?.status;
  const failed = status === 'failed' || status === 'expired' || status === 'refunded';
  const steps = useMemo(() => {
    const paid = status === 'paid' || status === 'fulfilling' || status === 'delivered';
    const stars = order?.method === 'stars';
    return [
      { label: stars ? (walletSent ? 'Paid with Stars' : 'Confirm in Telegram') : walletSent ? 'Approved in wallet' : 'Approve in your wallet', done: walletSent || status === 'underpaid', on: !walletSent && status !== 'underpaid' },
      { label: status === 'underpaid' ? 'Waiting for the rest of the payment' : paid ? 'Payment confirmed' : stars ? 'Confirming with Telegram' : order?.paymentSeen ? 'Payment seen, confirming' : 'Waiting for payment', done: paid, on: (walletSent || status === 'underpaid') && !paid },
      { label: 'Issuing your credit', done: status === 'delivered', on: paid && status !== 'delivered' },
    ];
  }, [status, walletSent, order?.paymentSeen, order?.method]);

  const backLine = failed ? (status === 'expired' ? 'Price expired' : status === 'refunded' ? 'Refunded' : 'Needs attention') : status === 'underpaid' ? 'Partly paid' : !walletSent ? (order?.method === 'stars' ? 'Waiting for Telegram' : 'Waiting for wallet') : status === 'paid' || status === 'fulfilling' ? 'Issuing credit' : 'Confirming payment';

  // the plan you have, only once it needs you: two weeks before it runs out, or after
  const renewNotice = cover && cover.daysLeft <= 14 ? (
    <button className="notice" onClick={renew}>
      <span>
        {cover.order.plan.label ?? cover.order.plan.name}
        {cover.daysLeft > 1 ? ` runs out in ${cover.daysLeft} days`
          : cover.daysLeft === 1 ? ' runs out tomorrow'
          : cover.daysLeft === 0 ? ' runs out today'
          : ` ran out ${-cover.daysLeft} day${cover.daysLeft === -1 ? '' : 's'} ago`}
      </span>
      <b>Renew</b>
    </button>
  ) : null;

  // returning buyers: the plan they have, as one quiet line at the top of the home screen
  const planCard = cover ? (() => {
    const state = cover.daysLeft < 0 ? 'over' : cover.daysLeft <= 7 ? 'soon' : 'ok';
    return (
      <motion.button className={`plan-line ${state}`} onClick={renew} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
        <i className="pl-dot" aria-hidden="true" />
        <span className="pl-name">{planName(cover.order.product?.name, { ...cover.order.plan, label: cover.order.plan.label ?? PLAN_LABEL[cover.order.plan.id] })}</span>
        <span className="pl-days">{cover.daysLeft > 1 ? `${cover.daysLeft} days left` : cover.daysLeft === 1 ? 'ends tomorrow' : cover.daysLeft === 0 ? 'ends today' : `ended ${-cover.daysLeft}d ago`}</span>
        <span className="pl-renew">Renew</span>
      </motion.button>
    );
  })() : null;

  return (
    <>
      <div className="atmos" aria-hidden="true">
        <Aurora inputs={aurora} product={product?.id ?? 'claude'} />
        {/* the code is issued and the beam has closed its loop: one flood of the app's colour across the screen */}
        {flash > 0 && <motion.div key={flash} className="flash" aria-hidden="true" style={{ '--flash': ({ chatgpt: '#7a9dff', grok: '#e5e7eb' } as Record<string, string>)[product?.id ?? ''] ?? '#e8875f' } as CSSProperties} initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0] }} transition={{ duration: 1.7, times: [0, 0.22, 1], ease: 'easeOut' }} />}
      </div>

      {/* the same mark as the page's first frame (index.html), until we know which screen comes first */}
      <AnimatePresence>{intro && <Onboarding key="ob" onDone={finishIntro} regions={regions} region={region} onRegion={pickRegion} />}</AnimatePresence>

      {/* data-product: the accent colour follows the app being bought (ui.css) */}
      {intro === false && <div className={`app ${view === 'wallet' || view === 'me' ? 'fit' : ''}`} data-product={productId}>
        <Header
          wallet={wallet}
          balance={balance}
          onHome={view === 'done' ? home : view === 'wallet' || view === 'me' ? toHome : view === 'home' && !browsing ? () => setBrowsing(true) : () => {}}
          onConnect={() => tonConnectUI.openModal()}
          onWallet={() => { tg.select(); setPop((x) => (x === 'wallet' ? null : 'wallet')); }}
          region={region ? { code: region, flag: regions.find((r) => r.code === region)?.flag ?? '' } : null}
          onRegion={() => { tg.select(); setPop((x) => (x === 'region' ? null : 'region')); }}
          onPopClose={() => setPop(null)}
          popFrom={pop}
          pop={pop === 'region' ? { key: 'region', content: <RegionPop regions={regions} value={region} onPick={(c) => { pickRegion(c); setPop(null); }} /> }
            : pop === 'wallet' && wallet ? { key: 'wallet', content: <WalletSheet address={wallet} balance={balance} network={config?.network} canTopUp={canTopUp} coins={coinList} icons={coinIcons}
                onTopUp={() => { setPop(null); openTopUp(); }}
                onCopy={() => navigator.clipboard?.writeText(wallet).then(() => setToast('Address copied')).catch(() => {})}
                onDisconnect={() => { setPop(null); tonConnectUI.disconnect(); }} /> }
            : null}
        />

        <AnimatePresence mode="wait">
          {view === 'home' && browsing && (
            <motion.main key="store" className="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              <Showcase products={products.length ? products : [{ id: 'claude', name: 'Claude' }]} plans={allPlans} payWith={payWith} onPick={pickProduct} notice={planCard} onHowItWorks={() => setIntro(true)} codesCount={codesLeft} onCodes={openOrders} onMe={openMe} onHelp={config?.bot ? () => tg.openTelegramLink(`https://t.me/${config.bot}`) : undefined} />
            </motion.main>
          )}
          {view === 'home' && !browsing && (
            <motion.main key="home" className="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div className="intro" {...rise(0.2)}>
                {/* which app this is; tap to see every app again */}
                <button className="app-title" onClick={() => { tg.select(); setBrowsing(true); }} aria-label={`${product?.name ?? 'Claude'}: back to all apps`}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
                  <span>{product?.name ?? 'Claude'}</span>
                </button>
                {renewNotice}
                {storesPriced.play && (
                  <Segmented id="store" label="Your phone" value={store} onChange={pickStore}
                    options={[{ value: 'appstore', label: 'iPhone' }, { value: 'play', label: 'Android' }]} />
                )}
              </motion.div>

              {plans ? (
                <PlanCarousel key={`${productId}:${store}`} plans={plans} index={index} onIndex={setIndex} storeLabel={storeLabel} onPull={onPull} disabled={!plan?.available} months={term?.months ?? months} pull={pull} hold={hold} />
              ) : bootErr ? (
                <motion.div className="carousel boot-err" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <div className="card-ghost still" />
                  <div className="boot-msg">
                    <b>{online ? "Couldn't load plans" : "You're offline"}</b>
                    <span>{online ? 'Check your connection and try again.' : 'Plans load as soon as you reconnect.'}</span>
                    {online && <button className="btn btn-quiet" onClick={load}>Try again</button>}
                  </div>
                </motion.div>
              ) : (
                <div className="carousel"><div className="card-ghost" /></div>
              )}

              <motion.div className="below" style={{ opacity: belowOpacity, y: belowY }}>
              {plans && plans.length > 0 && (
                <motion.div className="plan-info" {...rise(0.6)}>
                  {plans.length > 1 && (
                    <div className="plan-dots" role="tablist" aria-label="Plans">
                      {plans.map((x, n) => (
                        <button key={x.id} role="tab" aria-selected={n === index} aria-label={x.label ?? x.name} onClick={() => { tg.select(); setIndex(n); }}>
                          <motion.i animate={{ width: n === index ? 16 : 5, opacity: n === index ? 1 : 0.3 }} transition={{ type: 'spring', stiffness: 400, damping: 32 }} />
                        </button>
                      ))}
                    </div>
                  )}
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.p key={plan?.id} className="plan-blurb" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
                      {plan?.blurb}
                    </motion.p>
                  </AnimatePresence>
                </motion.div>
              )}
              <motion.div className="price" aria-live="polite" {...rise(0.75)}>
                {plan?.available && term && (plan.terms?.length ?? 0) > 1 && (
                  <TermPicker terms={plan.terms!} months={term.months} onChange={pickTerm} />
                )}
                {plan?.available && term ? (
                  <>
                    <div className="gram">
                      {payWith === 'stars'
                        ? <CountUp value={term.stars!} format={fmtStars} />
                        : <CountUp value={term.gram!} format={fmtGram} />}
                      {payWith === 'stars' ? <StarIcon size={28} /> : <GramIcon size={28} />}
                    </div>
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div key={plan.id + payWith + term.months} className="meta" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}>
                        {testScale < 1
                          ? <>Test price {Math.round(testScale * 100)}% · ≈ ${(term.usd * testScale).toFixed(2)}</>
                          : <>≈ ${term.usd.toFixed(2)}</>}
                        {term.annual && term.monthly > 0 && <span className="save"> · {Math.round((1 - term.appPrice / (term.monthly * 12)) * 100)}% less than monthly</span>}
                        {bothMethods && (
                          <button className="alt-price" onClick={() => chooseMethod(payWith === 'stars' ? 'gram' : 'stars')} aria-label="Switch currency">
                            or <span className="amt"><Amount method={payWith === 'stars' ? 'gram' : 'stars'} gram={term.gram} stars={term.stars} size={13} /></span>
                          </button>
                        )}
                      </motion.div>
                    </AnimatePresence>
                  </>
                ) : plan ? (
                  <div className="meta" style={{ paddingTop: 12 }}>{pricesUpdating ? 'Prices are updating. Try again in a minute.' : "This plan isn't available right now"}</div>
                ) : null}
              </motion.div>
              {err && <p className="error" style={{ textAlign: 'center' }}>{err}</p>}

              {plans && <motion.div className="pullhint" {...rise(0.95)}>
                <button onClick={openReview} disabled={!plan?.available || !term}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6" /></svg>
                  {needsWallet ? 'Pull down to connect your wallet' : 'Pull down to buy'}
                </button>
              </motion.div>}
              </motion.div>
            </motion.main>
          )}

          {view === 'paying' && order && (
            <motion.main key="paying" className="center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div className="pay-hero" initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.25 }}>
                <span className="pay-amount"><Amount method={order.method} gram={order.gram} stars={order.stars} size={30} /></span>
                <span className="pay-sub">{failed ? backLine : `${planName(order.product?.name, { ...order.plan, label: order.plan.label ?? PLAN_LABEL[order.plan.id] })} · ${termLabel(order.months ?? 1)}`}</span>
              </motion.div>
              {failed ? (
                <>
                  <motion.p className="done-title" style={{ color: 'var(--mute)', maxWidth: 320, fontSize: 14.5 }} {...rise(0.1)}>
                    {order.error ?? 'No payment arrived in time. If you already paid, it is still picked up within 2 hours and shows in your codes.'}
                  </motion.p>
                  <motion.div className="actions" {...rise(0.2)}><button className="btn btn-quiet" onClick={home}>Back to plans</button></motion.div>
                </>
              ) : (
                <>
                  <ul className="status" aria-live="polite">
                    {steps.map((s, i) => (
                      <motion.li key={i} className={s.done ? 'done' : s.on ? 'on' : ''} {...rise(0.3 + i * 0.1)}>
                        <span className="ic">
                          <AnimatePresence mode="wait" initial={false}>
                            {s.done ? (
                              <motion.span key="ok" className="ok" initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }} />
                            ) : s.on ? (
                              <motion.span key="ring" className="ring" exit={{ scale: 0 }} />
                            ) : (
                              <span key="wait" className="wait" />
                            )}
                          </AnimatePresence>
                        </span>
                        {s.label}
                      </motion.li>
                    ))}
                  </ul>
                  {order.method !== 'stars' && <motion.div className="memo" {...rise(0.65)}>
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span key={lost >= 3 ? 'r' : 'm'} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        {lost >= 3 ? 'Reconnecting… your payment is safe' : `memo ${order.comment}`}
                      </motion.span>
                    </AnimatePresence>
                  </motion.div>}
                  {order.method === 'stars' && lost >= 3 && <motion.div className="memo" {...rise(0)}>Reconnecting… your payment is safe</motion.div>}
                  {status === 'underpaid' && order.error && <p className="memo" style={{ color: 'var(--danger)', fontFamily: 'var(--font)', maxWidth: 300, textAlign: 'center' }}>{order.error}</p>}
                </>
              )}
            </motion.main>
          )}

          {view === 'done' && order?.codes && (
            <motion.main key="done" className="center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="success">
                <svg className="check" viewBox="0 0 52 52" aria-hidden="true">
                  <motion.path d="M14 27.5 22.5 36 39 17" fill="none" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"
                    initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 0.55, ease: [0.65, 0, 0.35, 1], delay: 0.35 }} />
                </svg>
                <motion.div className="success-amount" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, delay: 0.2 }}>
                  <Tally value={order.credit} format={(n) => fmtMoney(Number.isInteger(order.credit) ? Math.round(n) : n, order.currency)} delay={0.3} duration={1.6} />
                </motion.div>
                <motion.p className="success-sub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}>
                  {order.store?.label ?? 'App Store'} credit · {planName(order.product?.name, { ...order.plan, label: order.plan.label ?? PLAN_LABEL[order.plan.id] })}
                </motion.p>
              </div>
              {settled && (
                <div style={{ width: '100%' }}>
                  <div className="actions">
                    <RedeemCodes order={order} copied={copied} onCopy={copy} onMark={markCode} delay={0.1} />
                    <motion.button className="text-btn" onClick={() => openGuide(order)} {...rise(0.38)}>
                      How to activate {order.plan.label ?? PLAN_LABEL[order.plan.id]}
                    </motion.button>
                    {canHome && (
                      <button className="link-btn add-home" onClick={() => { tg.addToHome(); setCanHome(false); }}>
                        Add Tessera to your home screen
                      </button>
                    )}
                  </div>
                </div>
              )}
            </motion.main>
          )}

          {view === 'me' && (
            <motion.main key="me" className="me-view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Profile history={history} joinedAt={joinedAt} referral={referral} onCopied={setToast} />
            </motion.main>
          )}

          {view === 'wallet' && (
            <motion.main key="wallet" className="wallet-view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div className="intro" {...rise(0.05)}><h1>Your codes</h1></motion.div>
              <Wallet
                orders={history}
                error={historyErr}
                copied={copied}
                onCopy={copy}
                onMark={markCode}
                onRetry={loadHistory}
                onShop={toHome}
                onGuide={openGuide}
                onBack={toHome}
              />
            </motion.main>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {!online && (
            <motion.div className="netbar" role="status" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <i /> No connection
            </motion.div>
          )}
        </AnimatePresence>
      </div>}

      <Sheet open={sheet === 'review'} onClose={closeSheet} label="Review payment">
        {plan?.available && term && shown && (
          <div className="st">
            {/* what you're buying, then what it costs: the one number that matters, large */}
            <div className="sheet-head">
              <p className="eyebrow">{planName(plan.product?.name, plan)} · {termLabel(shown.months)}</p>
              <div className="total amt"><Amount method={payWith} gram={payGram} stars={shown.stars} size={28} /></div>
            </div>
            {shown.months > 1 && (
              <p className="term-note">
                {shown.annual
                  ? `${storeOwner}'s yearly ${plan.product?.name ?? ''} ${plan.label ?? plan.name} plan. It renews once a year.`
                  : `${plan.product?.name ?? 'The plan'} renews monthly. ${storeOwner} takes each month from this credit, so it covers ${shown.months} months.`}
              </p>
            )}
            {bothMethods && (
              <div className="paywith" role="radiogroup" aria-label="Pay with">
                {(['gram', 'stars'] as const).map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={payWith === m} className={payWith === m ? 'on' : ''} onClick={() => chooseMethod(m)}>
                    {payWith === m && <motion.i layoutId="pw" className="pw-bg" transition={{ type: 'spring', stiffness: 520, damping: 38 }} />}
                    <span className="pw-amt">{m === 'gram' ? <GramIcon size={15} /> : <StarIcon size={15} />}{m === 'gram' ? 'GRAM' : 'Stars'}</span>
                  </button>
                ))}
              </div>
            )}
            {payWith === 'gram' && coins.length > 0 && config?.relay !== 'off' && (
              <button className="topup-link" onClick={() => {
                tg.select();
                setTopUpNeed(payGram ? Math.max(0, payGram - (balance ?? 0)) : 0);
                quoteSeq.current++; setTopUpFrom('checkout'); setSheet('topup');
              }}>
                <span>{balance != null && payGram != null && balance < payGram ? 'Not enough GRAM?' : 'No GRAM?'} <b>Add GRAM</b></span>
                <CoinStack coins={coinList} icons={coinIcons} size={18} />
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
              </button>
            )}
            <dl className="rows">
              <div className="row"><dt>{storeLabel} credit</dt><dd>{fmtMoney(shown.credit, shown.currency)}{shown.codes > 1 ? ` in ${shown.codes} codes` : ''}</dd></div>
              <div className="row">
                <dt>{shown.annual ? 'Yearly plan in the app' : 'Plan price in the app'}</dt>
                <dd>{shown.months > 1 && !shown.annual ? `${shown.months} × ${fmtMoney(shown.monthly, shown.currency)}` : fmtMoney(shown.appPrice, shown.currency)}</dd>
              </div>
              {refOff > 0 && (
                <div className="row row-ref"><dt>Invite credit</dt><dd>−{fmtGram(refOff)}<GramIcon size={13} /></dd></div>
              )}
            </dl>
            <label className="agree">
              <input type="checkbox" checked={agree} onChange={(e) => { tg.select(); setAgree(e.target.checked); }} />
              <span>I understand {storeLabel} credit can't be refunded once issued.</span>
            </label>
            {err && <p className="error" role="alert">{err}</p>}
            {needsWallet ? (
              <motion.button className="btn btn-pearl" onClick={() => tonConnectUI.openModal()} whileTap={{ scale: 0.97 }}>Connect wallet</motion.button>
            ) : (
              <motion.button className="btn btn-pearl" disabled={!agree || busy || !heldOk} onClick={pay} whileTap={!agree || busy || !heldOk ? undefined : { scale: 0.97 }}>
                {busy ? <span className="spin" /> : 'Pay'}
              </motion.button>
            )}
            <p className="fine">
              {heldOk ? <>Price held for <Countdown until={heldOk.expiresAt} /></> : 'Holding your price…'}
              {config?.paymentMode === 'mock' ? ` · Demo mode, ${payWith === 'stars' ? 'no Stars are charged' : 'nothing leaves your wallet'}` : ''}
              {testScale < 1 ? ` · Testnet: you pay ${Math.round(testScale * 100)}% of the real price` : ''}
            </p>
          </div>
        )}
      </Sheet>

      <Sheet open={sheet === 'region'} onClose={closeSheet} label="Store country">
        <RegionSheet regions={regions} value={region} onPick={(c) => { pickRegion(c); closeSheet(); }} />
      </Sheet>


      <Sheet open={sheet === 'topup'} onClose={closeSheet} label="Add GRAM">
        <TopUp coins={coins} icons={coinIcons} chainIcons={chainIcons} wallet={wallet} needGram={topUpNeed} onConnect={() => tonConnectUI.openModal()}
          onBack={topUpFrom === 'checkout' && view === 'home' && plan?.available ? () => openReview() : closeSheet} onToast={setToast} />
      </Sheet>

      <Sheet open={sheet === 'guide'} onClose={closeSheet} label="How to activate">
        <div className="st">
          <h2>Activate {guideFor ? planName(guideFor.product?.name, { ...guideFor.plan, label: guideFor.plan.label ?? PLAN_LABEL[guideFor.plan.id] }) : ''}</h2>
          <p className="sub">Four steps, about two minutes.</p>
          {guideFor && <Guide order={guideFor} />}
          <button className="btn btn-quiet" onClick={view === 'wallet' ? closeSheet : home}>Done</button>
        </div>
      </Sheet>

      <AnimatePresence>
        {toast && (
          <motion.div className="toast" initial={{ opacity: 0, y: -16, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10 }} transition={{ type: 'spring', stiffness: 400, damping: 24 }}>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
