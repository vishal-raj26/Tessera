import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

/** Open (or create) a store. Pass ':memory:' for tests. */
export function openStore(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);

  db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    tg_user_id TEXT,
    wallet TEXT,
    region TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    packages TEXT NOT NULL,
    face_value REAL NOT NULL,
    currency TEXT NOT NULL,
    cost_usd REAL NOT NULL,
    amount_nano TEXT NOT NULL,
    comment TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL,
    tx_hash TEXT UNIQUE,
    codes TEXT,
    error TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS orders_status ON orders(status);
  CREATE INDEX IF NOT EXISTS orders_user ON orders(tg_user_id);

  -- every incoming transfer we have seen, recorded exactly once
  CREATE TABLE IF NOT EXISTS payments (
    hash TEXT PRIMARY KEY,
    order_id TEXT,
    memo TEXT,
    value_nano TEXT NOT NULL,
    source TEXT,
    seen_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS payments_order ON payments(order_id);

  -- small key/value store for admin overrides (e.g. in-app prices)
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
  `);

  // migrations for stores created by earlier versions
  const cols = db.prepare('PRAGMA table_info(orders)').all().map((c) => c.name);
  if (!cols.includes('received_nano')) db.exec("ALTER TABLE orders ADD COLUMN received_nano TEXT NOT NULL DEFAULT '0'");
  if (!cols.includes('admin_note')) db.exec('ALTER TABLE orders ADD COLUMN admin_note TEXT');
  if (!cols.includes('seen_at')) db.exec('ALTER TABLE orders ADD COLUMN seen_at INTEGER');
  if (!cols.includes('delivered_at')) db.exec('ALTER TABLE orders ADD COLUMN delivered_at INTEGER');
  if (!cols.includes('reminded_at')) db.exec('ALTER TABLE orders ADD COLUMN reminded_at INTEGER');

  const parse = (row) => row && {
    ...row,
    packages: JSON.parse(row.packages),
    codes: row.codes ? JSON.parse(row.codes) : null,
  };

  const orders = {
    insert(o) {
      db.prepare(`INSERT INTO orders (id, tg_user_id, wallet, region, plan_id, packages, face_value, currency, cost_usd,
        amount_nano, comment, status, created_at, expires_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        o.id, o.tgUserId ?? null, o.wallet ?? null, o.region, o.planId, JSON.stringify(o.packages), o.faceValue, o.currency,
        o.costUsd, o.amountNano, o.comment, 'awaiting_payment', o.createdAt, o.expiresAt, o.createdAt);
    },
    get: (id) => parse(db.prepare('SELECT * FROM orders WHERE id = ?').get(id)),
    byMemo: (memo) => parse(db.prepare('SELECT * FROM orders WHERE comment = ?').get(memo)),
    byUser: (uid) => db.prepare('SELECT * FROM orders WHERE tg_user_id = ? ORDER BY created_at DESC LIMIT 50').all(uid).map(parse),
    byStatus: (...s) => db.prepare(`SELECT * FROM orders WHERE status IN (${s.map(() => '?').join(',')}) ORDER BY created_at`).all(...s).map(parse),
    update(id, fields) {
      const keys = Object.keys(fields);
      const sql = `UPDATE orders SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`;
      db.prepare(sql).run(...keys.map((k) => (typeof fields[k] === 'object' && fields[k] !== null ? JSON.stringify(fields[k]) : fields[k])), Date.now(), id);
    },
    /** Atomic status change: only one caller can win, so an order is never fulfilled twice. */
    transition(id, from, to) {
      const list = Array.isArray(from) ? from : [from];
      return db.prepare(`UPDATE orders SET status = ?, updated_at = ? WHERE id = ? AND status IN (${list.map(() => '?').join(',')})`)
        .run(to, Date.now(), id, ...list).changes === 1;
    },
  };

  const payments = {
    /** Returns true only the first time a transaction hash is recorded. */
    record(p) {
      return db.prepare('INSERT OR IGNORE INTO payments (hash, order_id, memo, value_nano, source, seen_at) VALUES (?,?,?,?,?,?)')
        .run(p.hash, p.orderId ?? null, p.memo ?? null, String(p.valueNano), p.source ?? null, Date.now()).changes === 1;
    },
    forOrder: (orderId) => db.prepare('SELECT * FROM payments WHERE order_id = ? ORDER BY seen_at').all(orderId),
  };

  orders.dueForReminder = (before) =>
    db.prepare("SELECT * FROM orders WHERE status = 'delivered' AND reminded_at IS NULL AND delivered_at IS NOT NULL AND delivered_at < ?").all(before).map(parse);

  const settings = {
    get: (k) => db.prepare('SELECT value FROM settings WHERE key = ?').get(k)?.value ?? null,
    set: (k, v) => db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').run(k, String(v), Date.now()),
    all: (prefix) => db.prepare('SELECT key, value FROM settings WHERE key LIKE ?').all(`${prefix}%`),
  };

  return { db, orders, payments, settings };
}

const store = openStore(process.env.DB_PATH || path.resolve('data/tessera.db'));
export const orders = store.orders;
export const payments = store.payments;
export const settings = store.settings;
