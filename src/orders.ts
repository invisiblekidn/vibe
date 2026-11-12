// Смена статуса заказа — общая для сайта, панели сотрудника и кнопок в Telegram.
import { applyAction, type Action, type OrderState } from './lib/status';
import { applyCourseAction, orderStatusFromCourses, type CourseAction, type CourseRow } from './lib/courses';

export type TransitionResult = { ok: true; changed: boolean; event: string; order: any } | { ok: false; error: string };

export async function transition(db: D1Database, o: any, action: Action, actor: string): Promise<TransitionResult> {
  // Заказ по подачам: «Готово» и «Подано» ставят у каждой подачи отдельно.
  if (o.serve_mode === 'courses' && (action === 'mark_ready' || action === 'complete')) return { ok: false, error: 'USE_COURSES' };
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
  // Администратор принял заказ по подачам — кухня сразу готовит подачу 1, остальные ждут команды шефа.
  if (t.event === 'cooking_started' && o.serve_mode === 'courses') {
    await db.prepare(`UPDATE order_courses SET status = 'cooking', started_at = ? WHERE order_id = ? AND course = 1 AND status = 'waiting'`).bind(now, o.id).run();
  }
  const fresh = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(o.id).first<any>();
  return { ok: true, changed: true, event: t.event, order: fresh };
}

export async function orderWithItems(db: D1Database, id: number) {
  const [o, items, courses] = await db.batch([
    db.prepare('SELECT o.*, t.zone AS table_zone FROM orders o LEFT JOIN dining_tables t ON t.id = o.table_id WHERE o.id = ?').bind(id),
    db.prepare('SELECT name, qty, options, course FROM order_items WHERE order_id = ? ORDER BY course, id').bind(id),
    db.prepare('SELECT course, status FROM order_courses WHERE order_id = ? ORDER BY course').bind(id),
  ]);
  const order = (o.results as any[])[0];
  if (!order) return null;
  return {
    ...order,
    items: (items.results as any[]).map((i) => ({ name: i.name, qty: i.qty, options: JSON.parse(i.options), course: i.course })),
    courses: courses.results as unknown as CourseRow[],
  };
}

export type CourseResult = { ok: true; changed: boolean; event: string; order: any } | { ok: false; error: string };

/** Действие с подачей заказа: из панели сотрудника и из кнопок в группе Telegram. */
export async function courseTransition(db: D1Database, o: any, n: number, action: CourseAction, actor: string): Promise<CourseResult> {
  if (o.serve_mode !== 'courses') return { ok: false, error: 'NOT_COURSES' };
  const rows = (await db.prepare('SELECT course, status FROM order_courses WHERE order_id = ? ORDER BY course').bind(o.id).all<CourseRow>()).results;
  const t = applyCourseAction(o.status, rows, n, action);
  if (!t.ok) return { ok: false, error: t.reason };
  if (t.event === 'noop') return { ok: true, changed: false, event: 'noop', order: o };
  const now = new Date().toISOString();
  const col = t.next === 'cooking' ? 'started_at' : t.next === 'ready' ? 'ready_at' : 'served_at';
  const cur = rows.find((r) => r.course === n)!.status;
  // Два одновременных нажатия = одно действие: обновляем, только если статус подачи не изменился.
  const res = await db.batch([
    db.prepare(`UPDATE order_courses SET status = ?, ${col} = ? WHERE order_id = ? AND course = ? AND status = ?`).bind(t.next, now, o.id, n, cur),
    db.prepare(`INSERT INTO order_events (order_id, at, actor, kind) SELECT ?, ?, ?, ? WHERE changes() = 1`).bind(o.id, now, actor, `${t.event}:${n}`),
  ]);
  if ((res[0].meta.changes ?? 0) === 0) return { ok: false, error: 'CHANGED_MEANWHILE' };
  const after = rows.map((r) => (r.course === n ? { ...r, status: t.next } : r));
  const status = orderStatusFromCourses(after);
  await db.prepare(`UPDATE orders SET status = ?, updated_at = ? WHERE id = ? AND status NOT IN ('cancelled', 'completed')`).bind(status, now, o.id).run();
  const fresh = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(o.id).first<any>();
  return { ok: true, changed: true, event: `${t.event}:${n}`, order: fresh };
}
