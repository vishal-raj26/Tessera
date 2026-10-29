import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refreshRate, rateStatus, gramUsd, _setRateForTests } from '../src/chain.js';

const src = (name, answer) => ({ name, url: `https://${name}.test/`, read: (j) => Number(j?.price) , answer });
const fakeFetch = (answers, calls) => async (url, init) => {
  calls.push({ url, ua: init?.headers?.['user-agent'] });
  const a = answers[new URL(url).hostname.split('.')[0]];
  if (a instanceof Error) throw a;
  return new Response(JSON.stringify(a.body), { status: a.status ?? 200 });
};
const quiet = { log() {}, warn() {} };

test('first source blocked: the next one supplies the live rate, with a browser-like header', async () => {
  _setRateForTests(1.5, 0); // stale fallback
  const calls = [];
  const sources = [src('blocked'), src('second')];
  const realNow = Date.now;
  Date.now = () => realNow() + 26e3; // past the 25s refresh guard
  let st;
  try { st = await refreshRate(fakeFetch({ blocked: { status: 403, body: {} }, second: { body: { price: '1.1659' } } }, calls), { sources, log: quiet }); }
  finally { Date.now = realNow; }
  assert.equal(st.usd, 1.1659);
  assert.equal(st.source, 'second');
  assert.equal(rateStatus().error, null);
  assert.ok(calls.every((c) => /Mozilla/.test(c.ua)));
});

test('every source failing keeps the last rate and reports why', async () => {
  _setRateForTests(1.2, Date.now() - 60e3);
  const calls = [];
  const realNow = Date.now;
  Date.now = () => realNow() + 26e3;
  try {
    const st = await refreshRate(fakeFetch({ a: new Error('ENOTFOUND'), b: { status: 429, body: {} } }, calls), { sources: [src('a'), src('b')], log: quiet });
    assert.equal(st.usd, 1.2);
    assert.match(rateStatus().error, /a: ENOTFOUND; b: HTTP 429/);
  } finally { Date.now = realNow; }
});

test('concurrent callers share one request', async () => {
  _setRateForTests(1, 0);
  const calls = [];
  const realNow = Date.now;
  Date.now = () => realNow() + 60e3;
  try {
    const f = fakeFetch({ only: { body: { price: 2 } } }, calls);
    const [a, b, c] = await Promise.all([1, 2, 3].map(() => refreshRate(f, { sources: [src('only')], log: quiet })));
    assert.equal(calls.length, 1);
    assert.equal(a.usd, 2); assert.equal(b.usd, 2); assert.equal(c.usd, 2);
    assert.equal(await gramUsd(), 2, 'quotes read the latest rate without waiting');
  } finally { Date.now = realNow; }
});
