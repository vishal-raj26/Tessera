import { REGIONS } from '../catalog.js';

const BASE = 'https://api.cryptorefills.com';
const BRANDS = {
  appstore: ['Everything Apple', 'App Store & iTunes', 'Apple Gift Card'],
  play: ['Google Play'],
};

class CatalogUnavailable extends Error {
  authoritative = true;
}

function fixedCards(product, currency) {
  const packages = [];
  for (const item of product.products || []) {
    const face = item.face_value;
    const value = Number(face?.amount?.price);
    const costUsd = Number(item.coin_amount);
    if (face?.currency_code !== currency || face.amount?.type !== 'fixed' ||
        item.coin !== 'USDC' || item.is_out_of_stock === true || !item.product_id ||
        !Number.isFinite(value) || value < 0.01 || !Number.isFinite(costUsd) || costUsd <= 0) continue;
    packages.push({ id: item.product_id, productId: product.brand_id, value, costUsd });
  }
  return packages;
}

// Catalog coin amounts are indicative. USDC is used as a USD estimate for preview pricing.
export function createCryptoRefillsCatalog({ fetchImpl = fetch, now = Date.now } = {}) {
  async function read(path, query) {
    const url = new URL(path, BASE);
    url.search = new URLSearchParams(query);
    const response = await fetchImpl(url, {
      method: 'GET', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`CryptoRefills catalog returned HTTP ${response.status}`);
    return response.json();
  }

  return {
    name: 'cryptorefills',
    live: true,
    async fetchSnapshot(region, store) {
      const currency = REGIONS[region]?.currency;
      if (!currency || !Object.hasOwn(BRANDS, store)) throw new CatalogUnavailable('Unknown store or region');
      const catalog = await read('/v2/brands', { country_code: region });
      if (catalog?.country_code !== region || !Array.isArray(catalog.all_brands)) {
        throw new CatalogUnavailable('Unexpected CryptoRefills regional catalog');
      }
      for (const brand of BRANDS[store]) {
        const listing = catalog.all_brands.find((entry) => entry.brand === brand && entry.kind === 'giftcard'
          && entry.country_code === region && entry.is_out_of_stock === false && entry.brand_id && entry.family);
        if (!listing) continue;
        const products = await read(`/v5/products/country/${region}`, { family_name: listing.family, coin: 'USDC', lang: 'en' });
        const product = Array.isArray(products) && products.find((entry) => entry.brand_id === listing.brand_id
          && entry.brand === brand && entry.kind === 'giftcard' && entry.country_code === region
          && entry.is_out_of_stock === false && Array.isArray(entry.products));
        if (!product) continue;
        const packages = fixedCards(product, currency);
        if (packages.length) return {
          region, store, currency, productId: product.brand_id, packages, fetchedAt: now(),
          source: `cryptorefills:${product.brand_id}`, live: true,
        };
      }
      throw new CatalogUnavailable(`No CryptoRefills cards in stock for ${store} ${region}`);
    },
    async purchase() {
      throw new Error('CryptoRefills is in catalog preview mode');
    },
  };
}
