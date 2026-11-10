import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { getLocation, indexMenu, loadMenu, soldOutOn, takenSlots } from './db';
import { OrderError, priceCart, type CartItemInput } from './lib/pricing';
import { checkSlot, orderableDays, slotsForDay, toLocal, type OrderType } from './lib/time';
import { guestStatus, type Action, type OrderState } from './lib/status';
import { SESSION_COOKIE, makeSession, pinMatches, readSession } from './auth';
import { verifyInitData } from './lib/telegram';
import { handleUpdate, notifyOrderEvent, type TgEnv } from './bot';
import { transition } from './orders';

export interface Env extends TgEnv {
  DB: D1Database;
  ASSETS: Fetcher;
  LOCATION_ID: string;
  STAFF_PIN?: string;
  SESSION_SECRET?: string;
}

type Ctx = { Bindings: Env; Variables: { staff: string } };
const app = new Hono<Ctx>();

const LANGS = ['ru', 'vi', 'en'];
const langOf = (v: unknown) => (typeof v === 'string' && LANGS.includes(v) ? v : 'ru');
const nowMs = () => Date.now();
const iso = () => new Date().toISOString();
const baseUrl = (c: { env: Env; req: { url: string } }) => (c.env.PUBLIC_URL || new URL(c.req.url).origin).replace(/\/$/, '');

/** Уведомления в Telegram отправляются после ответа гостю и не задерживают его. */
function notifyLater(c: any, orderId: number, event: string, actor: string) {
  const p = notifyOrderEvent(c.env, orderId, event, actor, baseUrl(c)).catch((e) => console.warn('notify failed', e));
  try {
    c.executionCtx.waitUntil(p);
  } catch {
    /* вне Workers (тесты) — просто не ждём */
  }
}

// Этап 1: самовывоз и «к визиту». Доставка и стол подключаются на этапах 3 и 4.
const ENABLED_TYPES: OrderType[] = ['pickup', 'visit'];

app.onError((err, c) => {
  if (err instanceof OrderError) return c.json({ error: err.code, ...err.details }, 409);
  console.error(err);
  return c.json({ error: 'SERVER_ERROR' }, 500);
});

// ---------- Меню и время ----------

app.get('/api/menu', async (c) => {
  const loc = await getLocation(c.env.DB, c.env.LOCATION_ID);
  if (!loc) return c.json({ error: 'NO_LOCATION' }, 500);
  const menu = await loadMenu(c.env.DB);
  const today = toLocal(nowMs(), loc.tz_offset_min).day;
  const soldOut = await soldOutOn(c.env.DB, loc.id, today);
  return c.json({
    location: {
      id: loc.id,
      name: loc.name,
      address: loc.address,
      open: loc.open_min,
      close: loc.close_min,
      acceptingOrders: !!loc.accepting_orders,
      orderTypes: ENABLED_TYPES,
    },
    today,
    soldOutToday: [...soldOut],
    categories: menu.categories,
    dishes: menu.dishes.map((d) => ({
      ...d,
      groups: menu.groups
        .filter((g) => g.dish_id === d.id)
        .map((g) => ({ ...g, options: menu.options.filter((o) => o.group_id === g.id && o.active) })),
    })),
  });
});

app.get('/api/slots', async (c) => {
  const loc = await getLocation(c.env.DB, c.env.LOCATION_ID);
  if (!loc) return c.json({ error: 'NO_LOCATION' }, 500);
  const type = (c.req.query('type') ?? 'pickup') as OrderType;
  if (!ENABLED_TYPES.includes(type)) return c.json({ error: 'TYPE_NOT_AVAILABLE' }, 400);
  const days = orderableDays(nowMs(), loc);
  const day = c.req.query('day') ?? days[0];
  if (!days.includes(day)) return c.json({ error: 'SLOT_OUT_OF_RANGE' }, 400);
  const taken = await takenSlots(c.env.DB, loc.id, day);
  const soldOut = await soldOutOn(c.env.DB, loc.id, day);
  return c.json({ days, day, slots: slotsForDay(day, nowMs(), loc, type, taken), soldOut: [...soldOut] });
});

// ---------- Оформление заказа ----------

interface CreateOrderBody {
  idempotencyKey: string;
  type: OrderType;
  slot: string;
  items: CartItemInput[];
  guest: { name: string; phone: string };
  comment?: string;
  lang?: string;
  /** initData из Telegram Mini App: заказ привязывается к гостю в Telegram. */
  tgInitData?: string;
}

const cleanText = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

app.post('/api/orders', async (c) => {
  const body = (await c.req.json().catch(() => null)) as CreateOrderBody | null;
  if (!body) return c.json({ error: 'BAD_INPUT' }, 400);
  const key = cleanText(body.idempotencyKey, 80);
  if (key.length < 8) return c.json({ error: 'BAD_INPUT', field: 'idempotencyKey' }, 400);

  const db = c.env.DB;
  // Повторное нажатие «Оформить» с тем же ключом возвращает уже созданный заказ.
  const existing = await db.prepare('SELECT id, public_token, total FROM orders WHERE idempotency_key = ?').bind(key).first<any>();
  if (existing) return c.json({ number: existing.id, token: existing.public_token, total: existing.total, duplicate: true });

  const loc = await getLocation(db, c.env.LOCATION_ID);
  if (!loc) return c.json({ error: 'NO_LOCATION' }, 500);
  if (!loc.accepting_orders) throw new OrderError('NOT_ACCEPTING');
  if (!ENABLED_TYPES.includes(body.type)) throw new OrderError('TYPE_NOT_AVAILABLE');

  const name = cleanText(body.guest?.name, 60);
  const phone = cleanText(body.guest?.phone, 30);
  if (!name) return c.json({ error: 'BAD_INPUT', field: 'name' }, 400);
  if (!/^\+?[0-9 ()-]{7,20}$/.test(phone)) return c.json({ error: 'BAD_INPUT', field: 'phone' }, 400);

  let tgUserId: number | null = null;
  if (body.tgInitData) {
    const user = await verifyInitData(String(body.tgInitData), c.env.TG_BOT_TOKEN ?? '', nowMs());
    if (!user) return c.json({ error: 'TG_AUTH' }, 401);
    tgUserId = user.id;
  }

  const slotErr = checkSlot(String(body.slot), nowMs(), loc, body.type);
  if (slotErr) throw new OrderError(slotErr);

  const lang = langOf(body.lang);
  const menu = indexMenu(await loadMenu(db));
  const soldOut = await soldOutOn(db, loc.id, body.slot.slice(0, 10));
  const { lines, subtotal } = priceCart(body.items, menu, soldOut, { alcoholAllowed: body.type === 'visit', lang });

  const token = crypto.randomUUID();
  const now = iso();
  const total = subtotal;

  // Заказ, позиции и запись в журнал пишутся одним пакетом (одна транзакция).
  // Заказ вставляется, только если в интервале ещё есть место: проверка и запись атомарны.
  const insertOrder = db
    .prepare(
      `INSERT INTO orders (public_token, idempotency_key, location_id, channel, type, slot, status, payment_method, payment_status,
         subtotal, delivery_fee, total, guest_name, guest_phone, comment, lang, created_at, updated_at, tg_user_id)
       SELECT ?, ?, ?, ?, ?, ?, 'new', 'qr', 'unpaid', ?, 0, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE (SELECT COUNT(*) FROM orders WHERE location_id = ? AND slot = ? AND status != 'cancelled') < ?`,
    )
    .bind(token, key, loc.id, tgUserId ? 'telegram' : 'site', body.type, body.slot, subtotal, total, name, phone, cleanText(body.comment, 300) || null, lang, now, now, tgUserId, loc.id, body.slot, loc.slot_capacity);
  const insertItems = lines.map((l) =>
    db
      .prepare(
        `INSERT INTO order_items (order_id, dish_id, name, qty, unit_price, options, line_total)
         SELECT id, ?, ?, ?, ?, ?, ? FROM orders WHERE idempotency_key = ?`,
      )
      .bind(l.dishId, l.name, l.qty, l.unitPrice, JSON.stringify(l.options), l.lineTotal, key),
  );
  const insertEvent = db
    .prepare(`INSERT INTO order_events (order_id, at, actor, kind) SELECT id, ?, 'guest', 'created' FROM orders WHERE idempotency_key = ?`)
    .bind(now, key);

  let inserted: number;
  try {
    const res = await db.batch([insertOrder, ...insertItems, insertEvent]);
    inserted = res[0].meta.changes ?? 0;
  } catch (e) {
    // Два одинаковых запроса одновременно: второй упирается в уникальный ключ — отдаём первый заказ.
    const again = await db.prepare('SELECT id, public_token, total FROM orders WHERE idempotency_key = ?').bind(key).first<any>();
    if (again) return c.json({ number: again.id, token: again.public_token, total: again.total, duplicate: true });
    throw e;
  }
  if (inserted === 0) throw new OrderError('SLOT_FULL', { slot: body.slot });

  const row = await db.prepare('SELECT id FROM orders WHERE idempotency_key = ?').bind(key).first<{ id: number }>();
  notifyLater(c, row!.id, 'created', 'guest');
  return c.json({ number: row!.id, token, total }, 201);
});

// ---------- Страница заказа для гостя ----------

async function orderByToken(db: D1Database, token: string) {
  return db.prepare('SELECT * FROM orders WHERE public_token = ?').bind(token).first<any>();
}

function publicOrder(o: any, items: any[], qrUrl: string | null, botUsername?: string) {
  return {
    // Ссылка «Следить в Telegram» для заказа с сайта: бот привяжет заказ и будет присылать статусы.
    tgLink: botUsername && !o.tg_user_id ? `https://t.me/${botUsername}?start=o_${o.public_token}` : null,
    inTelegram: !!o.tg_user_id,
    number: o.id,
    type: o.type,
    slot: o.slot,
    status: guestStatus(o as OrderState),
    paymentMethod: o.payment_method,
    paymentStatus: o.payment_status,
    paymentReportedAt: o.payment_reported_at,
    subtotal: o.subtotal,
    deliveryFee: o.delivery_fee,
    total: o.total,
    guestName: o.guest_name,
    comment: o.comment,
    createdAt: o.created_at,
    qrUrl,
    items: items.map((i) => ({ name: i.name, qty: i.qty, unitPrice: i.unit_price, options: JSON.parse(i.options), lineTotal: i.line_total })),
  };
}

app.get('/api/orders/:token', async (c) => {
  const o = await orderByToken(c.env.DB, c.req.param('token'));
  if (!o) return c.json({ error: 'NOT_FOUND' }, 404);
  const items = await c.env.DB.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').bind(o.id).all<any>();
  const loc = await getLocation(c.env.DB, o.location_id);
  return c.json(publicOrder(o, items.results, loc?.payment_qr_url ?? null, c.env.TG_BOT_USERNAME));
});

app.post('/api/orders/:token/report-payment', async (c) => {
  const o = await orderByToken(c.env.DB, c.req.param('token'));
  if (!o) return c.json({ error: 'NOT_FOUND' }, 404);
  return runAction(c.env.DB, o, 'report_payment', 'guest', c);
});

async function runAction(db: D1Database, o: any, action: Action, actor: string, c: any) {
  const r = await transition(db, o, action, actor);
  if (!r.ok) return c.json({ error: r.error }, 409);
  if (r.changed) notifyLater(c, o.id, r.event, actor);
  const fresh = r.order;
  return c.json({ ok: true, status: guestStatus(fresh), paymentStatus: fresh.payment_status, kitchenStatus: fresh.status });
}

// ---------- Панель сотрудника ----------

app.post('/api/staff/login', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { name?: string; pin?: string };
  const name = cleanText(body.name, 40);
  if (!name) return c.json({ error: 'NAME_REQUIRED' }, 400);
  if (!c.env.SESSION_SECRET || !pinMatches(c.env.STAFF_PIN, body.pin)) return c.json({ error: 'WRONG_PIN' }, 401);
  setCookie(c, SESSION_COOKIE, await makeSession(c.env.SESSION_SECRET, name, nowMs()), {
    httpOnly: true,
    sameSite: 'Strict',
    secure: new URL(c.req.url).protocol === 'https:',
    path: '/',
    maxAge: 14 * 3600,
  });
  return c.json({ ok: true, name });
});

app.post('/api/staff/logout', (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.json({ ok: true });
});

app.use('/api/staff/*', async (c, next) => {
  if (c.req.path === '/api/staff/login' || c.req.path === '/api/staff/logout') return next();
  const name = await readSession(c.env.SESSION_SECRET ?? '', getCookie(c, SESSION_COOKIE), nowMs());
  if (!name) return c.json({ error: 'UNAUTHORIZED' }, 401);
  c.set('staff', name);
  return next();
});

app.get('/api/staff/me', (c) => c.json({ name: c.get('staff') }));

app.get('/api/staff/orders', async (c) => {
  const db = c.env.DB;
  const loc = await getLocation(db, c.env.LOCATION_ID);
  const today = toLocal(nowMs(), loc!.tz_offset_min).day;
  // Активные заказы + все заказы на сегодня и вперёд.
  const orders = await db
    .prepare(
      `SELECT * FROM orders WHERE location_id = ?
         AND (status IN ('new','cooking','ready') OR slot >= ?)
       ORDER BY slot, id LIMIT 200`,
    )
    .bind(loc!.id, today)
    .all<any>();
  const ids = orders.results.map((o) => o.id);
  const items = ids.length
    ? await db.prepare(`SELECT * FROM order_items WHERE order_id IN (${ids.map(() => '?').join(',')}) ORDER BY id`).bind(...ids).all<any>()
    : { results: [] as any[] };
  return c.json({
    today,
    orders: orders.results.map((o) => ({
      id: o.id,
      channel: o.channel,
      type: o.type,
      slot: o.slot,
      status: o.status,
      paymentMethod: o.payment_method,
      paymentStatus: o.payment_status,
      paymentReportedAt: o.payment_reported_at,
      guestStatus: guestStatus(o),
      total: o.total,
      guestName: o.guest_name,
      guestPhone: o.guest_phone,
      comment: o.comment,
      createdAt: o.created_at,
      items: items.results
        .filter((i) => i.order_id === o.id)
        .map((i) => ({ name: i.name, qty: i.qty, options: JSON.parse(i.options).map((x: any) => x.name), lineTotal: i.line_total })),
    })),
  });
});

const STAFF_ACTIONS: Action[] = ['confirm_payment', 'start_cooking', 'mark_ready', 'complete', 'cancel'];

app.post('/api/staff/orders/:id/action', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { action?: Action };
  if (!body.action || !STAFF_ACTIONS.includes(body.action)) return c.json({ error: 'BAD_ACTION' }, 400);
  const o = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ? AND location_id = ?').bind(Number(c.req.param('id')), c.env.LOCATION_ID).first<any>();
  if (!o) return c.json({ error: 'NOT_FOUND' }, 404);
  return runAction(c.env.DB, o, body.action, `staff:${c.get('staff')}`, c);
});

app.get('/api/staff/orders/:id/events', async (c) => {
  const r = await c.env.DB.prepare('SELECT at, actor, kind FROM order_events WHERE order_id = ? ORDER BY id').bind(Number(c.req.param('id'))).all();
  return c.json({ events: r.results });
});

app.all('/api/*', (c) => c.json({ error: 'NOT_FOUND' }, 404));

// ---------- Telegram ----------

app.post('/tg/webhook', async (c) => {
  // Telegram присылает секрет, заданный при setWebhook: чужие запросы отклоняем.
  const secret = c.req.header('x-telegram-bot-api-secret-token') ?? '';
  if (!c.env.TG_BOT_TOKEN || !c.env.TG_WEBHOOK_SECRET || !pinMatches(c.env.TG_WEBHOOK_SECRET, secret)) return c.text('forbidden', 403);
  const u = (await c.req.json().catch(() => null)) as { update_id?: number } | null;
  if (!u || !Number.isSafeInteger(u.update_id)) return c.text('ok');
  const db = c.env.DB;
  // Одно событие — одна обработка: повторная доставка того же update_id ничего не делает.
  const ins = await db.prepare('INSERT OR IGNORE INTO tg_updates (update_id, received_at) VALUES (?, ?)').bind(u.update_id, iso()).run();
  if ((ins.meta.changes ?? 0) === 0) return c.text('ok');
  try {
    await handleUpdate(c.env, u, baseUrl(c));
  } catch (e) {
    console.error('telegram update failed', e);
    // Снимаем отметку, чтобы Telegram прислал событие ещё раз.
    await db.prepare('DELETE FROM tg_updates WHERE update_id = ?').bind(u.update_id).run();
    return c.text('retry', 500);
  }
  return c.text('ok');
});

app.all('/tg/*', (c) => c.text('not found', 404));

export default app;
