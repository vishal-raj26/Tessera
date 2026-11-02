// Mock supplier for demo mode and testnet. Its cards are a recorded observation of Bitrefill's public
// storefront (recorded/bitrefill-storefront-*.json): real denominations and retail prices, but NOT the
// Business API and not a Business account's cost. Only the recorded stores and countries exist here;
// anything else has no cards (so it gets no price), never made-up ones. Codes it "issues" are fake.
// index.js refuses to run it with real money on mainnet.
import crypto from 'node:crypto';
import fs from 'node:fs';

export const RECORDED_FILE = new URL('./recorded/bitrefill-storefront-2026-11-02.json', import.meta.url);

export function createMockSupplier({ recorded = JSON.parse(fs.readFileSync(RECORDED_FILE, 'utf8')), now = Date.now } = {}) {
  return {
    name: 'mock',
    live: false,
    source: `fixture:${recorded.source}`,
    async fetchSnapshot(region, store = 'appstore') {
      const product = recorded.products.find((p) => p.country === region && p.store === store);
      if (!product) throw new Error(`no recorded cards for ${store} ${region} (mock knows: ${recorded.products.map((p) => `${p.store} ${p.country}`).join(', ')})`);
      const productId = `mock:${product.slug}`;
      return {
        region, store, currency: product.currency, productId,
        packages: product.packages.map((p) => ({ id: `${productId}<&>${p.value}`, productId, value: p.value, costUsd: p.priceUsd })),
        fetchedAt: now(),
        source: `fixture:${recorded.source}`,
        live: false,
      };
    },
    async purchase({ packages, reference }) {
      await new Promise((r) => setTimeout(r, 1200));
      return packages.map((p) => ({
        packageId: p.id,
        value: p.value,
        code: 'X' + crypto.randomBytes(12).toString('base64').replace(/[^A-Z0-9]/gi, '').toUpperCase().padEnd(15, 'Q').slice(0, 15),
        supplierRef: `mock_${reference}_${p.value}`,
      }));
    },
  };
}

export const mockSupplier = createMockSupplier();
