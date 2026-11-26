// Смена статуса заказа — общая для сайта, панели сотрудника и кнопок в Telegram.
import { applyAction, type Action, type OrderState } from './lib/status';
import { deliverySettings, indexMenu, loadMenu, soldOutOn, type Location } from './db';
import { apartmentText, quoteDelivery, type Apartment } from './lib/delivery';
import { OrderError, priceCart, type CartItemInput } from './lib/pricing';
import { checkSlot, type OrderType } from './lib/time';

export type TransitionResult = { ok: true; changed: boolean; event: string; order: any } | { ok: false; error: string };

export async function transition(db: D1Database, o: any, action: Action, actor: string): Promise<TransitionResult> {
  const t = applyAction(o as OrderState, action);
  if (!t.ok) return { ok: false, error: t.reason };
  if (t.event === 'noop') return { ok: true, changed: false, event: 'noop', order: o };
  const now = new Date().toISOString();
  // Обновляем, только если статусы не изменились с момента чтения (два одновременных нажатия = одно действие).
  const res = await db.batch([
    db
      .prepare(
        `UPDATE orders SET status = ?, payment_status = ?, updated_at = ?,
           payment_reported_at = CASE WHEN ? = 'payment_reported' THEN ? ELSE payment_reported_at END
         WHERE id = ? AND status = ? AND payment_status = ?`,
      )
      .bind(t.next.status, t.next.payment_status, now, t.event, now, o.id, o.status, o.payment_status),
    db.prepare(`INSERT INTO order_events (order_id, at, actor, kind) SELECT ?, ?, ?, ? WHERE changes() = 1`).bind(o.id, now, actor, t.event),
  ]);
  if ((res[0].meta.changes ?? 0) === 0) return { ok: false, error: 'CHANGED_MEANWHILE' };
  const fresh = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(o.id).first<any>();
  return { ok: true, changed: true, event: t.event, order: fresh };
}

export async function orderWithItems(db: D1Database, id: number) {
  const [o, items] = await db.batch([
    db.prepare('SELECT o.*, t.zone AS table_zone FROM orders o LEFT JOIN dining_tables t ON t.id = o.table_id WHERE o.id = ?').bind(id),
    db.prepare('SELECT name, qty, options FROM order_items WHERE order_id = ? ORDER BY id').bind(id),
  ]);
  const order = (o.results as any[])[0];
  if (!order) return null;
  return { ...order, items: (items.results as any[]).map((i) => ({ name: i.name, qty: i.qty, options: JSON.parse(i.options) })) };
}

// ---------- Оформление предзаказа: общее для сайта, окна меню в Telegram и быстрых кнопок в чате бота ----------

/** Виды предзаказа, которые сейчас можно выбрать. Доставку сотрудник включает и выключает во вкладке «Доставка». */
export function enabledTypes(loc: Pick<Location, 'delivery_enabled'>): OrderType[] {
  return loc.delivery_enabled ? ['pickup', 'visit', 'delivery'] : ['pickup', 'visit'];
}

/** Доставка только по зданию «Наполеон»: этаж и квартира (null — гость не заполнил или заполнил неверно). */
export type DeliveryInput = Apartment | null;

export interface NewOrder {
  /** Ключ заказа: повторное оформление с тем же ключом возвращает уже созданный заказ. */
  key: string;
  type: OrderType;
  slot: string;
  items: CartItemInput[];
  name: string;
  phone: string;
  comment: string | null;
  lang: string;
  tgUserId: number | null;
  /** NULL — сайт или окно меню; 'chat' — быстрые кнопки в чате бота. */
  source: string | null;
  /** Только для доставки. */
  delivery?: DeliveryInput | null;
}

export type CreatedOrder = { id: number; token: string; total: number; duplicate: boolean };

async function byKey(db: D1Database, key: string): Promise<CreatedOrder | null> {
  const o = await db.prepare('SELECT id, public_token, total FROM orders WHERE idempotency_key = ?').bind(key).first<any>();
  return o ? { id: o.id, token: o.public_token, total: o.total, duplicate: true } : null;
}

/**
 * Проверяет на сервере вид заказа, время, наличие и цены по меню и записывает заказ.
 * Ошибки — OrderError с кодом (DISH_SOLD_OUT, SLOT_FULL, SLOT_TOO_SOON, ALCOHOL_NOT_ALLOWED …).
 */
export async function createOrder(db: D1Database, loc: Location, n: NewOrder, nowMs = Date.now()): Promise<CreatedOrder> {
  const existing = await byKey(db, n.key);
  if (existing) return existing;
  if (!loc.accepting_orders) throw new OrderError('NOT_ACCEPTING');
  if (!enabledTypes(loc).includes(n.type)) throw new OrderError(n.type === 'delivery' ? 'DELIVERY_OFF' : 'TYPE_NOT_AVAILABLE');
  if (n.type === 'delivery' && !n.delivery) throw new OrderError('DELIVERY_NO_APT');
  const slotErr = checkSlot(n.slot, nowMs, loc, n.type);
  if (slotErr) throw new OrderError(slotErr);

  const menu = indexMenu(await loadMenu(db));
  const soldOut = await soldOutOn(db, loc.id, n.slot.slice(0, 10));
  // Названия в заказе — по-русски, для кухни.
  const { lines, subtotal } = priceCart(n.items, menu, soldOut, { alcoholAllowed: n.type === 'visit', lang: 'ru' });

  const token = crypto.randomUUID();
  const now = new Date(nowMs).toISOString();
  // Доставка: минимальная сумма и цена — только по настройкам точки.
  const q = n.type === 'delivery' ? quoteDelivery(deliverySettings(loc), n.delivery ?? null, subtotal) : null;
  const fee = q ? q.fee : 0;
  const total = subtotal + fee;
  const d = n.type === 'delivery' ? n.delivery! : null;
  const channel = n.tgUserId ? 'telegram' : 'site';

  // Заказ, позиции и запись в журнал пишутся одним пакетом (одна транзакция).
  // Заказ вставляется, только если в интервале ещё есть место: проверка и запись атомарны.
  const insertOrder = db
    .prepare(
      `INSERT INTO orders (public_token, idempotency_key, location_id, channel, type, slot, status, payment_method, payment_status,
         subtotal, delivery_fee, total, guest_name, guest_phone, comment, lang, created_at, updated_at, tg_user_id, source,
         delivery_address, delivery_lat, delivery_lng, delivery_km)
       SELECT ?, ?, ?, ?, ?, ?, 'new', 'qr', 'unpaid', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE (SELECT COUNT(*) FROM orders WHERE location_id = ? AND slot = ? AND status != 'cancelled') < ?`,
    )
    .bind(
      token, n.key, loc.id, channel, n.type, n.slot, subtotal, fee, total, n.name, n.phone, n.comment, n.lang, now, now, n.tgUserId, n.source,
      d ? apartmentText(d) : null, null, null, null,
      loc.id, n.slot, loc.slot_capacity,
    );
  const insertItems = lines.map((l) =>
    db
      .prepare(
        `INSERT INTO order_items (order_id, dish_id, name, qty, unit_price, options, line_total)
         SELECT id, ?, ?, ?, ?, ?, ? FROM orders WHERE idempotency_key = ?`,
      )
      .bind(l.dishId, l.name, l.qty, l.unitPrice, JSON.stringify(l.options), l.lineTotal, n.key),
  );
  const insertEvent = db
    .prepare(`INSERT INTO order_events (order_id, at, actor, kind) SELECT id, ?, 'guest', 'created' FROM orders WHERE idempotency_key = ?`)
    .bind(now, n.key);

  let inserted: number;
  try {
    const res = await db.batch([insertOrder, ...insertItems, insertEvent]);
    inserted = res[0].meta.changes ?? 0;
  } catch (e) {
    // Два одинаковых запроса одновременно: второй упирается в уникальный ключ — отдаём первый заказ.
    const again = await byKey(db, n.key);
    if (again) return again;
    throw e;
  }
  if (inserted === 0) throw new OrderError('SLOT_FULL', { slot: n.slot });
  const row = await db.prepare('SELECT id FROM orders WHERE idempotency_key = ?').bind(n.key).first<{ id: number }>();
  return { id: row!.id, token, total, duplicate: false };
}
