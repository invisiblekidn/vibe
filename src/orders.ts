// Смена статуса заказа — общая для сайта, панели сотрудника и кнопок в Telegram.
import { applyAction, type Action, type OrderState } from './lib/status';

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
