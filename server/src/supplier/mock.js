// Mock supplier. Mirrors the shape of the real Bitrefill adapter so swapping is one env var.
import crypto from 'node:crypto';
import { REGIONS } from '../catalog.js';

// Rough FX to USD for pricing in mock mode only (real mode uses the supplier's USD prices).
const USD_PER_UNIT = {
  USD: 1, GBP: 1.27, CAD: 0.72, AUD: 0.65, EUR: 1.08, JPY: 0.0066, INR: 0.0119,
  TRY: 0.029, BRL: 0.18, MXN: 0.054, KRW: 0.00072, PHP: 0.0172, IDR: 0.000061,
};

// Typical App Store card denominations per currency.
const DENOMS = {
  USD: [2, 5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 150, 200, 250, 300, 500],
  GBP: [2, 5, 10, 15, 25, 50, 100, 200],
  CAD: [15, 25, 50, 100, 200, 300, 500],
  AUD: [20, 30, 50, 100, 200, 300, 500],
  EUR: [2, 5, 10, 15, 20, 25, 40, 50, 100, 150, 200],
  JPY: [1500, 3000, 5000, 10000, 20000, 30000, 50000],
  INR: [500, 1000, 2000, 3000, 5000, 10000, 15000],
  TRY: [100, 250, 500, 1000, 2500, 5000],
  BRL: [50, 100, 150, 200, 300, 500, 1000],
  MXN: [200, 300, 400, 500, 1000, 1500, 2000],
  KRW: [10000, 30000, 50000, 100000, 200000, 300000, 500000],
  PHP: [500, 1000, 2000, 5000, 10000],
  IDR: [100000, 200000, 300000, 500000, 1000000, 2000000],
};

const FEE = 1.02; // assumed supplier spread over face value

export const mockSupplier = {
  name: 'mock',
  async listPackages(regionCode) {
    const r = REGIONS[regionCode];
    if (!r) return [];
    return (DENOMS[r.currency] || []).map((value) => ({
      id: `mock-${regionCode}<&>${value}`,
      value,
      costUsd: value * USD_PER_UNIT[r.currency] * FEE,
    }));
  },
  async purchase({ regionCode, packages, reference }) {
    await new Promise((r) => setTimeout(r, 1200));
    return packages.map((p) => ({
      packageId: p.id,
      value: p.value,
      code: 'X' + crypto.randomBytes(12).toString('base64').replace(/[^A-Z0-9]/gi, '').toUpperCase().padEnd(15, 'Q').slice(0, 15),
      supplierRef: `mock_${reference}_${p.value}`,
    }));
  },
};
