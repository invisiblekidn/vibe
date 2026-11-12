// Заказ со стола по QR: счета, вызовы официанта, объединение «Весь стол». Работа с базой.
import { BILL_STALE_MS, checkBillAction, tableOrderStatus, tableTitle, type BillAction } from './lib/tables';
import { localizeItems } from './db';

export interface DiningTable {
  id: string;
  location_id: string;
  code: string;
  zone: string;
  sort: number;
  active: number;
}

const iso = () => new Date().toISOString();

export async function tableByCode(db: D1Database, code: string): Promise<DiningTable | null> {
  return db.prepare('SELECT * FROM dining_tables WHERE code = ? AND active = 1').bind(code).first<DiningTable>();
}

export async function listTables(db: D1Database, locationId: string): Promise<DiningTable[]> {
  return (await db.prepare('SELECT * FROM dining_tables WHERE location_id = ? AND active = 1 ORDER BY sort').bind(locationId).all<DiningTable>()).results;
}

/** Счёт этого телефона за столом, без создания нового. Если счёт объединили — счёт, в который он вошёл. */
export async function findBill(db: D1Database, table: DiningTable, device: string): Promise<any | null> {
  const fresh = new Date(Date.now() - BILL_STALE_MS).toISOString();
  const own = await db
    .prepare(`SELECT * FROM bills WHERE table_id = ? AND device_key = ? AND created_at > ? ORDER BY id DESC LIMIT 1`)
    .bind(table.id, device, fresh)
    .first<any>();
  if (!own) return null;
  if (own.status === 'merged' && own.merged_into) {
    const target = await db.prepare('SELECT * FROM bills WHERE id = ?').bind(own.merged_into).first<any>();
    if (target) return { ...target, viaMerge: true };
  }
  return own;
}

/** Открытый счёт для нового заказа: свой, общий (после «Весь стол») или новый. */
export async function openBillFor(db: D1Database, table: DiningTable, device: string): Promise<any> {
  const b = await findBill(db, table, device);
  if (b && b.status === 'open') return b;
  const now = iso();
  // Забытый открытый счёт (старше 16 ч) закрываем, чтобы телефон начал новый.
  await db
    .prepare(`UPDATE bills SET status = 'closed', closed_at = ?, updated_at = ? WHERE table_id = ? AND device_key = ? AND status = 'open' AND created_at <= ?`)
    .bind(now, now, table.id, device, new Date(Date.now() - BILL_STALE_MS).toISOString())
    .run();
  await db
    .prepare(`INSERT OR IGNORE INTO bills (location_id, table_id, device_key, status, created_at, updated_at) VALUES (?, ?, ?, 'open', ?, ?)`)
    .bind(table.location_id, table.id, device, now, now)
    .run();
  return db.prepare(`SELECT * FROM bills WHERE table_id = ? AND device_key = ? AND status = 'open'`).bind(table.id, device).first<any>();
}

export async function billTotal(db: D1Database, billId: number): Promise<number> {
  const r = await db.prepare(`SELECT COALESCE(SUM(total), 0) AS t FROM orders WHERE bill_id = ? AND status != 'cancelled'`).bind(billId).first<{ t: number }>();
  return r?.t ?? 0;
}

async function billOrders(db: D1Database, billIds: number[], lang = 'ru') {
  if (!billIds.length) return [];
  const q = billIds.map(() => '?').join(',');
  const [orders, items] = await db.batch([
    db.prepare(`SELECT id, bill_id, status, total, comment, created_at FROM orders WHERE bill_id IN (${q}) ORDER BY id`).bind(...billIds),
    db.prepare(`SELECT oi.order_id, oi.dish_id, oi.name, oi.qty, oi.options, oi.line_total FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.bill_id IN (${q}) ORDER BY oi.id`).bind(...billIds),
  ]);
  const lines = await localizeItems(db, (items.results as any[]).map((i) => ({ ...i, options: JSON.parse(i.options) as { id?: string; name: string }[] })), lang);
  return (orders.results as any[]).map((o) => ({
    number: o.id,
    billId: o.bill_id,
    status: tableOrderStatus(o.status),
    kitchenStatus: o.status,
    total: o.total,
    comment: o.comment,
    createdAt: o.created_at,
    items: lines
      .filter((i) => i.order_id === o.id)
      .map((i) => ({ name: i.name, qty: i.qty, options: i.options.map((x: { name: string }) => x.name), lineTotal: i.line_total })),
  }));
}

async function openCalls(db: D1Database, tableId: string) {
  return (await db.prepare('SELECT id, kind, bill_id, created_at FROM table_calls WHERE table_id = ? AND done_at IS NULL ORDER BY id').bind(tableId).all<any>()).results;
}

/** Что видит гость: свой счёт с заказами, другие счета стола (только суммы), открытые вызовы. */
export async function guestBillView(db: D1Database, table: DiningTable, device: string, qrUrl: string | null, lang = 'ru') {
  const bill = await findBill(db, table, device);
  const others = await db
    .prepare(
      `SELECT b.id, (SELECT COALESCE(SUM(total),0) FROM orders o WHERE o.bill_id = b.id AND o.status != 'cancelled') AS total
       FROM bills b WHERE b.table_id = ? AND b.status = 'open' AND b.id != ? AND b.created_at > ?`,
    )
    .bind(table.id, bill?.id ?? 0, new Date(Date.now() - BILL_STALE_MS).toISOString())
    .all<any>();
  const otherBills = others.results.filter((o) => o.total > 0);
  const calls = await openCalls(db, table.id);
  const orders = bill ? await billOrders(db, [bill.id], lang) : [];
  const total = orders.filter((o) => o.kitchenStatus !== 'cancelled').reduce((s, o) => s + o.total, 0);
  return {
    table: { id: table.id, zone: table.zone, title: tableTitle(table) },
    bill: bill
      ? {
          id: bill.id,
          status: bill.status,
          shared: !!bill.viaMerge || (await db.prepare(`SELECT 1 FROM bills WHERE merged_into = ? LIMIT 1`).bind(bill.id).first()) !== null,
          requested: !!bill.requested_at,
          paymentStatus: bill.payment_status,
          paymentMethod: bill.payment_method,
          paidTotal: bill.paid_total,
          total,
          orders,
        }
      : null,
    others: { count: otherBills.length, total: otherBills.reduce((s, o) => s + o.total, 0) },
    calls: {
      waiter: calls.some((c) => c.kind === 'waiter'),
      bill: !!bill && calls.some((c) => c.kind === 'bill' && c.bill_id === bill.id),
    },
    qrUrl,
  };
}

/** Вызов со стола. Повторное нажатие, пока вызов открыт, возвращает тот же вызов. */
export async function createCall(db: D1Database, table: DiningTable, kind: 'waiter' | 'bill', billId: number | null) {
  const dedup = kind === 'waiter' ? 'waiter' : `bill:${billId}`;
  const now = iso();
  const ins = await db
    .prepare(`INSERT OR IGNORE INTO table_calls (table_id, bill_id, kind, dedup, created_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(table.id, billId, kind, dedup, now)
    .run();
  const row = await db.prepare(`SELECT * FROM table_calls WHERE table_id = ? AND dedup = ? AND done_at IS NULL`).bind(table.id, dedup).first<any>();
  return { created: (ins.meta.changes ?? 0) > 0, call: row };
}

export async function closeCall(db: D1Database, callId: number, actor: string) {
  const now = iso();
  const r = await db.prepare(`UPDATE table_calls SET done_at = ?, done_by = ? WHERE id = ? AND done_at IS NULL`).bind(now, actor, callId).run();
  return (r.meta.changes ?? 0) > 0;
}

export type BillResult = { ok: true; changed: boolean; bill: any; merged?: number[] } | { ok: false; error: string };

/** Действие со счётом: «Я оплатил» гостя, «Оплачено» сотрудника, «Весь стол». */
export async function billAction(db: D1Database, billId: number, action: BillAction, actor: string): Promise<BillResult> {
  const b = await db.prepare('SELECT * FROM bills WHERE id = ?').bind(billId).first<any>();
  if (!b) return { ok: false, error: 'NOT_FOUND' };
  const total = await billTotal(db, b.id);
  const chk = checkBillAction(b, action, total);
  if (!chk.ok) return { ok: false, error: chk.reason };
  if (chk.noop) return { ok: true, changed: false, bill: b };
  const now = iso();
  const ev = (kind: string, data?: unknown) =>
    db.prepare('INSERT INTO bill_events (bill_id, at, actor, kind, data) VALUES (?, ?, ?, ?, ?)').bind(b.id, now, actor, kind, data === undefined ? null : JSON.stringify(data));

  if (action === 'report_payment') {
    const r = await db
      .prepare(`UPDATE bills SET payment_status = 'reported', payment_reported_at = ?, updated_at = ? WHERE id = ? AND status = 'open' AND payment_status = 'unpaid'`)
      .bind(now, now, b.id)
      .run();
    if ((r.meta.changes ?? 0) === 0) return { ok: true, changed: false, bill: b };
    await ev('payment_reported', { total }).run();
  } else if (action === 'paid_qr' || action === 'paid_cash') {
    const method = action === 'paid_qr' ? 'qr' : 'cash';
    // Счёт закрывается; вызовы этого счёта — тоже. Объединённые счета уже закрыты при объединении.
    const res = await db.batch([
      db
        .prepare(
          `UPDATE bills SET status = 'paid', payment_status = 'confirmed', payment_method = ?, paid_total = ?, closed_at = ?, updated_at = ? WHERE id = ? AND status = 'open'`,
        )
        .bind(method, total, now, now, b.id),
      db.prepare(`UPDATE table_calls SET done_at = ?, done_by = ? WHERE bill_id = ? AND done_at IS NULL`).bind(now, actor, b.id),
      ev('paid', { method, total }),
    ]);
    if ((res[0].meta.changes ?? 0) === 0) return { ok: true, changed: false, bill: b };
  } else if (action === 'merge_all') {
    const others = (
      await db
        .prepare(`SELECT id FROM bills WHERE table_id = ? AND status = 'open' AND id != ? AND payment_status = 'unpaid' AND created_at > ?`)
        .bind(b.table_id, b.id, new Date(Date.now() - BILL_STALE_MS).toISOString())
        .all<{ id: number }>()
    ).results.map((x) => x.id);
    if (!others.length) return { ok: false, error: 'NOTHING_TO_MERGE' };
    const q = others.map(() => '?').join(',');
    await db.batch([
      db.prepare(`UPDATE orders SET bill_id = ?, updated_at = ? WHERE bill_id IN (${q})`).bind(b.id, now, ...others),
      db.prepare(`UPDATE bills SET status = 'merged', merged_into = ?, closed_at = ?, updated_at = ? WHERE id IN (${q}) AND status = 'open'`).bind(b.id, now, now, ...others),
      // Вызовы «счёт» объединённых счетов переходят на общий счёт.
      db.prepare(`UPDATE table_calls SET done_at = ?, done_by = 'system:merge' WHERE bill_id IN (${q}) AND done_at IS NULL`).bind(now, ...others),
      db.prepare(`UPDATE bills SET updated_at = ? WHERE id = ?`).bind(now, b.id),
      ev('merged', { bills: others }),
    ]);
    return { ok: true, changed: true, bill: await db.prepare('SELECT * FROM bills WHERE id = ?').bind(b.id).first<any>(), merged: others };
  }
  return { ok: true, changed: true, bill: await db.prepare('SELECT * FROM bills WHERE id = ?').bind(b.id).first<any>() };
}

export async function markBillRequested(db: D1Database, billId: number) {
  const now = iso();
  await db.prepare(`UPDATE bills SET requested_at = COALESCE(requested_at, ?), updated_at = ? WHERE id = ?`).bind(now, now, billId).run();
}

/** Для сотрудника: все столы с открытыми счетами, заказами и вызовами. */
export async function staffTablesView(db: D1Database, locationId: string) {
  const tables = await listTables(db, locationId);
  const fresh = new Date(Date.now() - BILL_STALE_MS).toISOString();
  const bills = (await db.prepare(`SELECT * FROM bills WHERE location_id = ? AND status = 'open' AND created_at > ? ORDER BY id`).bind(locationId, fresh).all<any>()).results;
  const orders = await billOrders(db, bills.map((b) => b.id));
  const calls = (await db.prepare(`SELECT id, table_id, kind, bill_id, created_at FROM table_calls WHERE done_at IS NULL ORDER BY id`).all<any>()).results;
  return tables.map((t) => {
    const tb = bills
      .filter((b) => b.table_id === t.id)
      .map((b) => {
        const os = orders.filter((o) => o.billId === b.id);
        return {
          id: b.id,
          requested: !!b.requested_at,
          paymentStatus: b.payment_status,
          paymentReportedAt: b.payment_reported_at,
          total: os.filter((o) => o.kitchenStatus !== 'cancelled').reduce((s, o) => s + o.total, 0),
          orders: os,
        };
      })
      .filter((b) => b.orders.length > 0);
    return {
      id: t.id,
      code: t.code,
      zone: t.zone,
      title: tableTitle(t),
      bills: tb,
      calls: calls.filter((c) => c.table_id === t.id),
    };
  });
}
