// Renew: open the review for exactly what the buyer bought last (same app, store, plan and term), or say
// it can't be renewed. Never anything else: no other store's prices, no nearby term. One step per render;
// the app applies the step and calls again with the new state (App.tsx). No imports, so it's tested on its
// own (web/test/renew.test.ts).

export interface RenewTarget { product: string; store: string; planId: string; months: number }

export interface RenewState {
  /** the store whose catalog is loaded (from the catalog response) */
  catalogStore: string | null;
  /** the store and app the screen is set to */
  store: string;
  productId: string;
  /** the plans on screen (this app, this store) */
  plans: { id: string; available: boolean; terms?: { months: number }[] }[] | null;
  index: number;
  months: number;
}

export type RenewStep =
  | { do: 'wait' }                       // the target store's catalog isn't loaded yet
  | { do: 'fail' }                       // not renewable right now: say so, open nothing
  | { do: 'index'; index: number }       // show that plan
  | { do: 'months'; months: number }     // pick that term
  | { do: 'open' };                      // everything matches: open the review

export function renewStep(t: RenewTarget, s: RenewState): RenewStep {
  if (!s.plans || s.catalogStore !== t.store) return { do: 'wait' };
  // the target store's catalog is loaded, but the screen isn't on that store (it isn't priced) or app
  if (s.store !== t.store || s.productId !== t.product) return { do: 'fail' };
  const i = s.plans.findIndex((p) => p.id === t.planId);
  if (i < 0 || !s.plans[i].available || !s.plans[i].terms?.some((x) => x.months === t.months)) return { do: 'fail' };
  if (s.index !== i) return { do: 'index', index: i };
  if (s.months !== t.months) return { do: 'months', months: t.months };
  return { do: 'open' };
}
