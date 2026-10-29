import { tg } from './tg';

export type PlanId = 'pro_m' | 'max5_m' | 'max20_m';

export interface Region { code: string; name: string; flag: string; currency: string }
export interface Plan {
  id: PlanId; name: string; term: string; blurb: string; available: boolean;
  appPrice?: number; currency?: string; credit?: number; codes?: number; gram?: number | null; stars?: number | null; usd?: number;
}
export interface Code { code: string; value: number }
export type PayMethod = 'gram' | 'stars';
export type OrderStatus = 'awaiting_payment' | 'paid' | 'fulfilling' | 'delivered' | 'expired' | 'failed' | 'underpaid' | 'refunded';
export interface Order {
  id: string; region: string; regionName: string; flag: string;
  plan: { id: PlanId; name: string; term: string };
  credit: number; currency: string; method: PayMethod; stars: number | null; invoiceLink?: string | null; gram: number; amountNano: string; comment: string;
  merchant: string | null; network: 'mainnet' | 'testnet'; receivedNano: string; paymentSeen: boolean; payload: string; status: OrderStatus; error: string | null;
  txHash: string | null; codes: Code[] | null; createdAt: number; expiresAt: number;
}
export interface AppConfig { paymentMode: 'mock' | 'chain'; network: 'mainnet' | 'testnet'; merchant: string | null; supplier: string; region: string; stars: boolean }

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
  catalog: (region: string) => req<{ plans: Plan[]; pricesUpdating?: boolean }>(`/api/catalog?region=${region}`),
  createOrder: (region: string, planId: PlanId, method: PayMethod, wallet?: string) =>
    req<Order>('/api/orders', { method: 'POST', body: JSON.stringify({ region, planId, method, wallet }) }),
  order: (id: string) => req<Order>(`/api/orders/${id}`),
  orders: () => req<{ orders: Order[] }>('/api/orders').then((r) => r.orders),
  mockPay: (id: string) => req<Order>(`/api/orders/${id}/mock-pay`, { method: 'POST' }),
};

export const fmtMoney = (v: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: v % 1 ? 2 : 0 }).format(v);

export const fmtGram = (g: number) => g.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtStars = (n: number) => Math.round(n).toLocaleString();

export const groupCode = (c: string) => c.replace(/(.{4})(?=.)/g, '$1 ');

