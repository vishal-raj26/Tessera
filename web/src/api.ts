import { tg } from './tg';

/** A plan id from the server's catalog, e.g. 'pro_m' (Claude Pro). */
export type PlanId = string;
export type StoreId = 'appstore' | 'play';
export interface Store { id: StoreId; label: string; device: string }
export interface Product { id: string; name: string; app: string }

export interface Region { code: string; name: string; flag: string; currency: string }
export interface Term {
  months: number; label: string; annual: boolean; monthly: number; appPrice: number; currency: string;
  credit: number; codes: number; gram: number | null; stars: number | null; usd: number;
}
/** A price held for 20 minutes while the buyer reviews it. */
export interface Quote extends Term { id: string; expiresAt: number }
export interface Plan {
  id: PlanId; name: string; label: string; product: Product; term: string; blurb: string; available: boolean;
  terms?: Term[];
  appPrice?: number; currency?: string; credit?: number; codes?: number; gram?: number | null; stars?: number | null; usd?: number;
}
export interface Code { code: string; value: number }
export type PayMethod = 'gram' | 'stars';
export type OrderStatus = 'awaiting_payment' | 'paid' | 'fulfilling' | 'delivered' | 'expired' | 'failed' | 'underpaid' | 'refunded';
export interface Order {
  id: string; region: string; regionName: string; flag: string;
  plan: { id: PlanId; name: string; label: string; term: string };
  product: Product; store: Store;
  months: number; annual: boolean;
  credit: number; currency: string; method: PayMethod; stars: number | null; invoiceLink?: string | null; gram: number; amountNano: string; comment: string;
  merchant: string | null; network: 'mainnet' | 'testnet'; receivedNano: string; paymentSeen: boolean; payload: string; status: OrderStatus; error: string | null;
  txHash: string | null; codes: Code[] | null; createdAt: number; expiresAt: number;
}
export interface AppConfig { paymentMode: 'mock' | 'chain'; network: 'mainnet' | 'testnet'; merchant: string | null; supplier: string; region: string; stars: boolean; testScale?: number; products: Product[]; stores: Store[] }

const BASE = import.meta.env.VITE_API_URL ?? '';

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-telegram-init-data': tg.initData, ...(init.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body as T;
}

export const api = {
  config: () => req<AppConfig>('/api/config'),
  regions: () => req<{ regions: Region[] }>('/api/regions').then((r) => r.regions),
  catalog: (region: string, store: StoreId = 'appstore') =>
    req<{ plans: Plan[]; pricesUpdating?: boolean; storesPriced?: Record<StoreId, boolean> }>(`/api/catalog?region=${region}&store=${store}`),
  quote: (region: string, store: StoreId, planId: PlanId, months: number) =>
    req<Quote>('/api/quotes', { method: 'POST', body: JSON.stringify({ region, store, planId, months }) }),
  createOrder: (region: string, store: StoreId, planId: PlanId, months: number, method: PayMethod, wallet?: string, quoteId?: string) =>
    req<Order>('/api/orders', { method: 'POST', body: JSON.stringify({ region, store, planId, months, method, wallet, quoteId }) }),
  order: (id: string) => req<Order>(`/api/orders/${id}`),
  orders: () => req<{ orders: Order[] }>('/api/orders').then((r) => r.orders),
  mockPay: (id: string) => req<Order>(`/api/orders/${id}/mock-pay`, { method: 'POST' }),
};

export const fmtMoney = (v: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: v % 1 ? 2 : 0 }).format(v);

export const fmtGram = (g: number) => g.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtStars = (n: number) => Math.round(n).toLocaleString();

export const termLabel = (m: number) => (m === 12 ? '1 year' : m === 1 ? '1 month' : `${m} months`);

/** Where a buyer redeems a code: the store's own redeem page. */
export const redeemUrl = (store: StoreId | undefined, code: string) =>
  store === 'play' ? `https://play.google.com/redeem?code=${encodeURIComponent(code)}` : `https://apps.apple.com/redeem?code=${encodeURIComponent(code)}`;

export const groupCode = (c: string) => c.replace(/(.{4})(?=.)/g, '$1 ');

