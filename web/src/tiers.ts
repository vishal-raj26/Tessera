// Each plan's look follows its rank within its product (first, second, third…), so any product gets
// the same progression: a warm clay card, then brushed silver, then black with gold. Used by the 3D
// card (three/cardScene.ts), the CSS card (HoloCard, `.tier-N`) and the background glow.
import type { Plan } from './api';

export interface Tier {
  name: string;
  body: [string, string, string];          // card body gradient, light to dark
  sheen: string;                           // soft light on the body
  foil: [string, string, string];          // the plan name, top to bottom
  ink: string;                             // small text and emblem
  edge: { color: string; metal: number; rough: number };
  rim: string;                             // warm/cool edge light on the 3D card
  glow: string;                            // background glow behind the front card
  tile: string;                            // mosaic tile colour (opening moment)
}

export const TIERS: Tier[] = [
  {
    name: 'clay',
    body: ['#3b241b', '#21140f', '#120b08'],
    sheen: 'rgba(255, 200, 170, 0.10)',
    foil: ['#fff1e8', '#e8b49a', '#9c5a40'],
    ink: 'rgba(240, 214, 198, 0.86)',
    edge: { color: '#3a2016', metal: 0.75, rough: 0.3 },
    rim: '#d97757',
    glow: 'rgba(217, 119, 87, 0.30)',
    tile: '#7a4632',
  },
  {
    name: 'silver',
    body: ['#34373b', '#1c1e21', '#0f1012'],
    sheen: 'rgba(225, 235, 255, 0.10)',
    foil: ['#ffffff', '#d3d8de', '#7c828b'],
    ink: 'rgba(222, 227, 234, 0.86)',
    edge: { color: '#8a9099', metal: 0.95, rough: 0.22 },
    rim: '#a9b8cf',
    glow: 'rgba(170, 188, 214, 0.26)',
    tile: '#6b727c',
  },
  {
    name: 'gold',
    body: ['#1a1712', '#0c0b09', '#050504'],
    sheen: 'rgba(255, 220, 150, 0.07)',
    foil: ['#fff6d6', '#e6c36a', '#8a6420'],
    ink: 'rgba(232, 214, 168, 0.88)',
    edge: { color: '#b48a36', metal: 1, rough: 0.2 },
    rim: '#e3b45a',
    glow: 'rgba(222, 176, 82, 0.26)',
    tile: '#8d6a28',
  },
];

// planId -> rank within its product, learnt from the catalog
const ranks = new Map<string, number>();

/** Remember each plan's rank within its product (call with the whole catalog). */
export function rememberTiers(plans: Plan[]) {
  const seen = new Map<string, number>();
  for (const p of plans) {
    const product = p.product?.id ?? 'claude';
    const n = seen.get(product) ?? 0;
    ranks.set(p.id, n);
    seen.set(product, n + 1);
  }
}

/** A plan's tier index (0, 1, 2…, capped at the last tier). Unknown plans get the first. */
export function tierOf(planId: string): number {
  return Math.min(ranks.get(planId) ?? 0, TIERS.length - 1);
}
