// Each plan's look follows its rank within its product (first, second, third…), so any product gets
// the same progression. All keep the original warm charcoal card; the foil, edge and glow step up from
// the original silver, to a brighter silver, to the warm clay accent. Used by the 3D card
// (three/cardScene.ts), the CSS card (HoloCard, `.tier-N`) and the background glow.
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
  // all three keep the original warm charcoal card; they differ only in the foil, edge and glow
  {
    name: 'base', // the original card, unchanged
    body: ['#24221f', '#131211', '#0c0b0b'],
    sheen: 'rgba(255, 236, 214, 0.07)',
    foil: ['#fffaf2', '#d9d2c5', '#8f877d'],
    ink: 'rgba(214, 208, 198, 0.82)',
    edge: { color: '#1b1918', metal: 0.8, rough: 0.26 },
    rim: '#d97757',
    glow: 'rgba(255, 232, 214, 0.07)',
    tile: '#3a3734',
  },
  {
    name: 'bright', // a brighter, cooler silver foil and a lighter polished edge
    body: ['#262422', '#141312', '#0c0b0b'],
    sheen: 'rgba(240, 240, 248, 0.08)',
    foil: ['#ffffff', '#e4e2de', '#9c9894'],
    ink: 'rgba(224, 221, 216, 0.86)',
    edge: { color: '#3a3836', metal: 0.9, rough: 0.2 },
    rim: '#e0b49a',
    glow: 'rgba(240, 236, 230, 0.09)',
    tile: '#45423f',
  },
  {
    name: 'warm', // the top plan: a warm clay foil and edge, the brand accent
    body: ['#25211e', '#131110', '#0c0a0a'],
    sheen: 'rgba(255, 214, 190, 0.08)',
    foil: ['#fff1e6', '#ebc2a6', '#b0765a'],
    ink: 'rgba(232, 210, 196, 0.86)',
    edge: { color: '#4a2e22', metal: 0.85, rough: 0.22 },
    rim: '#d97757',
    glow: 'rgba(217, 119, 87, 0.12)',
    tile: '#4a3a33',
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
