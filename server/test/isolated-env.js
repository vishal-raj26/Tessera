// Environment for test servers: never reads the developer's server/.env (DOTENV_CONFIG_PATH points
// nowhere) and pins every setting that changes prices, so tests behave the same on every machine.
import path from 'node:path';
import os from 'node:os';

export function isolatedEnv(overrides = {}) {
  return {
    PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT, HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE,
    TMP: process.env.TMP, TEMP: process.env.TEMP, TMPDIR: process.env.TMPDIR,
    NODE_EXTRA_CA_CERTS: process.env.NODE_EXTRA_CA_CERTS, SSL_CERT_FILE: process.env.SSL_CERT_FILE,
    HTTPS_PROXY: process.env.HTTPS_PROXY, HTTP_PROXY: process.env.HTTP_PROXY, NO_PROXY: process.env.NO_PROXY,
    DOTENV_CONFIG_PATH: path.join(os.tmpdir(), 'tessera-test-no-such.env'),
    DB_PATH: ':memory:',
    PAYMENT_MODE: 'mock', TON_NETWORK: 'mainnet', TEST_PRICE_SCALE: '1',
    SUPPLIER: 'mock', STORE_REGION: 'US', PRODUCTS: 'claude', EXTRA_PRODUCTS_JSON: '',
    BOT_TOKEN: '', ADMIN_CHAT_IDS: '', MERCHANT_WALLET: '', TONCENTER_API_KEY: '',
    MARGIN: '0.08', STARS: 'on', STAR_USD: '0.013', STAR_BUYER_USD: '0.02', STARS_MIN_MARGIN: '0.03',
    GRAM_USD_FALLBACK: '1.5', APPLE_PRICE_SYNC: 'off', TON_STREAM: 'off',
    ...overrides,
  };
}
