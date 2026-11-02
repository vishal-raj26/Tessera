const path = require('node:path');
// Pace the testnet script's TON RPC calls for the public endpoint.
const axios = require(path.join(__dirname, '../server/node_modules/axios/dist/node/axios.cjs'));
const { pathToFileURL } = require('node:url');
let queue = Promise.resolve();
let last = 0;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
axios.interceptors.request.use(async config => {
  const turn = queue.then(async () => {
    await sleep(Math.max(0, 1800 - (Date.now() - last)));
    last = Date.now();
  });
  queue = turn.catch(() => {});
  await turn;
  return config;
});
axios.interceptors.response.use(undefined, async error => {
  const config = error.config;
  if (error.response?.status === 429 && config && (config._pacingRetries || 0) < 4) {
    config._pacingRetries = (config._pacingRetries || 0) + 1;
    await sleep(3000 * config._pacingRetries);
    return axios.request(config);
  }
  throw error;
});
process.on('unhandledRejection', error => {
  console.error('Testnet script failed:', error.message);
  process.exit(1);
});
import(pathToFileURL(path.join(__dirname, 'testnet-buy.mjs')).href)
  .catch(error => { console.error('Testnet script failed:', error.message); process.exit(1); });
