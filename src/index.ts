import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { deliverySettings, getLocation, indexMenu, loadMenu, localizeItems, setStop, soldOutOn, stopEntries, takenSlots } from './db';
import { OrderError, priceCart, type CartItemInput } from './lib/pricing';
import { checkSlot, orderableDays, slotsForDay, toLocal, type OrderType } from './lib/time';
import { guestStatus, type Action, type OrderState } from './lib/status';
import { SESSION_COOKIE, makeSession, pinMatches, readSession } from './auth';
import { escHtml, fmtVnd as fmtVndPlain, verifyInitData } from './lib/telegram';
import { handleUpdate, notifyBillEvent, notifyOrderEvent, notifyTableCall, tg, type TgEnv } from './bot';
import { loadPicks, picksChangedText, savePicks, type PicksInput } from './quick';
import { QUICK_MAX, QUICK_RECOMMENDED } from './lib/quick';
import { enabledTypes, createOrder, transition } from './orders';
import { cleanSettings, mapLink, validPoint } from './lib/delivery';
import { DEVICE_RE, TABLE_CODE_RE, tableOpenNow, tableTitle, type BillAction } from './lib/tables';
import { billAction, billTotal, closeCall, createCall, findBill, guestBillView, markBillRequested, openBillFor, staffTablesView, tableByCode } from './tables';

export interface Env extends TgEnv {
  DB: D1Database;
  ASSETS: Fetcher;
  LOCATION_ID: string;
  STAFF_PIN?: string;
  SESSION_SECRET?: string;
  /** Только тестовая версия: заказ со стола в любое время суток, чтобы проверять ночью. */
  TABLE_ANY_HOUR?: string;
}

type Ctx = { Bindings: Env; Variables: { staff: string } };
const app = new Hono<Ctx>();

// Ответы API (меню, цены, статусы) не кэшируются ни браузером, ни окном Telegram: гость всегда видит актуальное.
app.use('/api/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store');
});

const LANGS = ['ru', 'vi', 'en'];
const langOf = (v: unknown) => (typeof v === 'string' && LANGS.includes(v) ? v : 'ru');
const nowMs = () => Date.now();
const iso = () => new Date().toISOString();
const baseUrl = (c: { env: Env; req: { url: string } }) => (c.env.PUBLIC_URL || new URL(c.req.url).origin).replace(/\/$/, '');

/** Уведомления в Telegram отправляются после ответа гостю и не задерживают его. */
function notifyLater(c: any, orderId: number, event: string, actor: string) {
  background(c, notifyOrderEvent(c.env, orderId, event, actor, baseUrl(c)));
}

function background(c: any, job: Promise<unknown>) {
  const p = job.catch((e) => console.warn('notify failed', e));
  try {
    c.executionCtx.waitUntil(p);
  } catch {
    /* вне Workers (тесты) — просто не ждём */
  }
}


app.onError((err, c) => {
  if (err instanceof OrderError) return c.json({ error: err.code, ...err.details }, 409);
  console.error(err);
  return c.json({ error: 'SERVER_ERROR' }, 500);
});

// ---------- Меню и время ----------

async function dishOfDayFor(db: D1Database, locationId: string, soldOut: Set<string>, menu: { dishes: { id: string; active: boolean }[] }) {
  const pick = (await loadPicks(db, locationId)).day;
  if (!pick || !menu.dishes.some((d) => d.id === pick.dishId && d.active)) return null;
  // На стопе — гость видит карточку хита с пометкой «на стопе», но добавить его не может.
  return { dishId: pick.dishId, note: pick.note, stopped: soldOut.has(pick.dishId) };
}

/** Хиты продаж: всё из быстрого заказа плюс главный хит — на сайте у них значок «⭐ Хит». */
async function hitsFor(db: D1Database, locationId: string, menu: { dishes: { id: string; active: boolean }[] }) {
  const p = await loadPicks(db, locationId);
  const ids = new Set([...(p.day ? [p.day.dishId] : []), ...p.quick]);
  return menu.dishes.filter((d) => d.active && ids.has(d.id)).map((d) => d.id);
}

function publicDelivery(loc: NonNullable<Awaited<ReturnType<typeof getLocation>>>) {
  const d = deliverySettings(loc);
  return {
    lat: d.lat,
    lng: d.lng,
    radiusKm: d.radius_km,
    baseFee: d.base_fee,
    baseKm: d.base_km,
    perKm: d.per_km,
    freeFrom: d.free_from,
    minOrder: d.min_order,
    leadMin: loc.lead_delivery_min,
  };
}

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
      orderTypes: enabledTypes(loc),
      // Тариф доставки: сайт заранее показывает цену, сервер при оформлении считает её сам по тем же правилам.
      delivery: enabledTypes(loc).includes('delivery') ? publicDelivery(loc) : null,
    },
    today,
    soldOutToday: [...soldOut],
    // Главный хит, который выбрал сотрудник во вкладке «Бот». Снят — не показываем, на стопе — с пометкой.
    dishOfDay: await dishOfDayFor(c.env.DB, loc.id, soldOut, menu),
    hits: await hitsFor(c.env.DB, loc.id, menu),
    categories: menu.categories,
    sections: menu.sections,
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
  if (!enabledTypes(loc).includes(type)) return c.json({ error: type === 'delivery' ? 'DELIVERY_OFF' : 'TYPE_NOT_AVAILABLE' }, 400);
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
  /** Доставка: адрес текстом и точка на карте. */
  delivery?: { address?: string; lat?: number; lng?: number };
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

  const r = await createOrder(db, loc, {
    key,
    type: body.type,
    slot: String(body.slot),
    items: body.items,
    name,
    phone,
    comment: cleanText(body.comment, 300) || null,
    lang: langOf(body.lang),
    tgUserId,
    source: null,
    delivery:
      body.type === 'delivery'
        ? {
            address: cleanText(body.delivery?.address, 200),
            point: validPoint({ lat: body.delivery?.lat, lng: body.delivery?.lng }) ? { lat: body.delivery!.lat!, lng: body.delivery!.lng! } : null,
          }
        : null,
  });
  if (r.duplicate) return c.json({ number: r.id, token: r.token, total: r.total, duplicate: true });
  notifyLater(c, r.id, 'created', 'guest');
  return c.json({ number: r.id, token: r.token, total: r.total }, 201);
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
    deliveryAddress: o.delivery_address,
    deliveryKm: o.delivery_km,
    deliveryPoint: o.delivery_lat != null ? { lat: o.delivery_lat, lng: o.delivery_lng } : null,
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
  // Язык страницы гостя (?lang=), иначе язык, на котором оформляли заказ.
  const lang = c.req.query('lang') ? langOf(c.req.query('lang')) : langOf(o.lang);
  const raw = items.results.map((i: any) => ({ ...i, options: JSON.parse(i.options) }));
  const named = await localizeItems(c.env.DB, raw, lang);
  return c.json(publicOrder(o, named.map((i: any) => ({ ...i, options: JSON.stringify(i.options) })), loc?.payment_qr_url ?? null, c.env.TG_BOT_USERNAME));
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
         AND (status IN ('new','cooking','ready') OR slot >= ? OR (slot IS NULL AND created_at >= ?))
       ORDER BY slot, id LIMIT 200`,
    )
    .bind(loc!.id, today, new Date(nowMs() - 16 * 3600_000).toISOString())
    .all<any>();
  const ids = orders.results.map((o) => o.id);
  const tableZones = new Map(
    (await db.prepare('SELECT id, zone FROM dining_tables WHERE location_id = ?').bind(loc!.id).all<any>()).results.map((t) => [t.id, t.zone]),
  );
  const items = ids.length
    ? await db.prepare(`SELECT * FROM order_items WHERE order_id IN (${ids.map(() => '?').join(',')}) ORDER BY id`).bind(...ids).all<any>()
    : { results: [] as any[] };
  return c.json({
    today,
    orders: orders.results.map((o) => ({
      id: o.id,
      channel: o.channel,
      source: o.source ?? null,
      type: o.type,
      slot: o.slot,
      table: o.table_id ? tableTitle({ id: o.table_id, zone: tableZones.get(o.table_id) || 'hall' }) : null,
      billId: o.bill_id,
      status: o.status,
      paymentMethod: o.payment_method,
      paymentStatus: o.payment_status,
      paymentReportedAt: o.payment_reported_at,
      guestStatus: guestStatus(o),
      subtotal: o.subtotal,
      deliveryFee: o.delivery_fee,
      deliveryAddress: o.delivery_address,
      deliveryKm: o.delivery_km,
      deliveryMap: o.delivery_lat != null ? mapLink({ lat: o.delivery_lat, lng: o.delivery_lng }) : null,
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

// ---------- Бот: блюдо дня и быстрый заказ (вкладка «Бот» в панели) ----------

app.get('/api/staff/bot', async (c) => {
  const db = c.env.DB;
  const loc = await getLocation(db, c.env.LOCATION_ID);
  if (!loc) return c.json({ error: 'NO_LOCATION' }, 500);
  const today = toLocal(nowMs(), loc.tz_offset_min).day;
  const [menu, picks, sold, log] = await Promise.all([
    loadMenu(db),
    loadPicks(db, loc.id),
    soldOutOn(db, loc.id, today),
    db.prepare('SELECT at, actor, change FROM bot_picks_log WHERE location_id = ? ORDER BY id DESC LIMIT 12').bind(loc.id).all<any>(),
  ]);
  const cats = new Map(menu.categories.map((x) => [x.id, x.name.ru || x.id]));
  return c.json({
    day: picks.day,
    quick: picks.quick,
    max: QUICK_MAX,
    recommended: QUICK_RECOMMENDED,
    dishes: menu.dishes.map((d) => ({
      id: d.id,
      name: d.name.ru || d.id,
      price: d.price,
      photo: d.photo,
      category: cats.get(d.category_id) || '',
      soldOut: sold.has(d.id),
      alcohol: d.is_alcohol,
      // Обязательный выбор (начинка, соус): в чате бот спросит его кнопками.
      choice: menu.groups.some((g) => g.dish_id === d.id && g.min_select > 0),
    })),
    log: log.results.map((x) => ({ at: x.at, actor: String(x.actor).replace(/^staff:/, ''), change: x.change })),
  });
});

app.put('/api/staff/bot', async (c) => {
  const body = (await c.req.json().catch(() => null)) as PicksInput | null;
  if (!body) return c.json({ error: 'BAD_INPUT' }, 400);
  const who = c.get('staff');
  const r = await savePicks(c.env.DB, c.env.LOCATION_ID, body, `staff:${who}`);
  if (!r.ok) return c.json({ error: r.error }, 400);
  if (r.changes.length && c.env.TG_STAFF_CHAT_ID) {
    background(
      c,
      (async () => {
        const loc = await getLocation(c.env.DB, c.env.LOCATION_ID);
        const [menu, picks, sold] = await Promise.all([loadMenu(c.env.DB), loadPicks(c.env.DB, c.env.LOCATION_ID), soldOutOn(c.env.DB, c.env.LOCATION_ID, toLocal(nowMs(), loc!.tz_offset_min).day)]);
        const names = new Map(menu.dishes.map((d) => [d.id, d.name.ru || d.id]));
        await tg(c.env, 'sendMessage', { chat_id: Number(c.env.TG_STAFF_CHAT_ID), text: picksChangedText(who, picks, names, sold), parse_mode: 'HTML' });
      })(),
    );
  }
  return c.json({ ok: true, changes: r.changes });
});

// ---------- Стоп-лист (вкладка «Стоп-лист» в панели) ----------
// Блюдо на стопе остаётся в меню: гость видит его с пометкой «на стопе», но заказать не может
// (сайт, окно меню в Telegram, хиты, быстрый заказ в боте, заказ со стола). Сервер тоже не примет такое блюдо.

app.get('/api/staff/stop', async (c) => {
  const db = c.env.DB;
  const loc = await getLocation(db, c.env.LOCATION_ID);
  if (!loc) return c.json({ error: 'NO_LOCATION' }, 500);
  const today = toLocal(nowMs(), loc.tz_offset_min).day;
  const [menu, stops] = await Promise.all([loadMenu(db), stopEntries(db, loc.id, today)]);
  return c.json({
    categories: menu.categories.map((x) => ({ id: x.id, name: x.name.ru || x.id })),
    sections: menu.sections.map((x) => ({ id: x.id, category_id: x.category_id, name: x.name.ru || x.id })),
    dishes: menu.dishes.map((d) => {
      const s = stops.get(d.id);
      return {
        id: d.id,
        category_id: d.category_id,
        section_id: d.section_id,
        name: d.name.ru || d.id,
        price: d.price,
        photo: d.photo,
        stopped: !!s,
        by: s?.by_name ? String(s.by_name).replace(/^staff:/, '') : null,
        at: s?.at ?? null,
      };
    }),
  });
});

app.post('/api/staff/stop', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { dishId?: string; stopped?: boolean } | null;
  if (!body || typeof body.dishId !== 'string' || typeof body.stopped !== 'boolean') return c.json({ error: 'BAD_INPUT' }, 400);
  const db = c.env.DB;
  const loc = await getLocation(db, c.env.LOCATION_ID);
  if (!loc) return c.json({ error: 'NO_LOCATION' }, 500);
  const dish = await db.prepare('SELECT id, name FROM dishes WHERE id = ? AND active = 1').bind(body.dishId).first<{ id: string; name: string }>();
  if (!dish) return c.json({ error: 'DISH_UNAVAILABLE' }, 404);
  const who = c.get('staff');
  const today = toLocal(nowMs(), loc.tz_offset_min).day;
  const changed = await setStop(db, loc.id, dish.id, body.stopped, who, iso(), today);
  if (changed && c.env.TG_STAFF_CHAT_ID) {
    let name = dish.id;
    try { name = JSON.parse(dish.name).ru || dish.id; } catch { /* имя без перевода */ }
    const text = body.stopped ? `🚫 На стопе: <b>${escHtml(name)}</b> · ${escHtml(who)}` : `✅ Снова можно заказать: <b>${escHtml(name)}</b> · ${escHtml(who)}`;
    background(c, tg(c.env, 'sendMessage', { chat_id: Number(c.env.TG_STAFF_CHAT_ID), text, parse_mode: 'HTML', disable_notification: true }));
  }
  return c.json({ ok: true, changed, stopped: body.stopped });
});

// ---------- Доставка (вкладка «Доставка» в панели) ----------
// Сотрудник включает и выключает доставку и меняет тариф. Изменения сразу видят сайт, окно меню и бот.

const deliveryView = (loc: NonNullable<Awaited<ReturnType<typeof getLocation>>>) => ({
  enabled: !!loc.delivery_enabled,
  ...deliverySettings(loc),
  lead_min: loc.lead_delivery_min,
  changedBy: loc.delivery_changed_by ? String(loc.delivery_changed_by) : null,
  changedAt: loc.delivery_changed_at,
});

app.get('/api/staff/delivery', async (c) => {
  const loc = await getLocation(c.env.DB, c.env.LOCATION_ID);
  if (!loc) return c.json({ error: 'NO_LOCATION' }, 500);
  return c.json(deliveryView(loc));
});

app.put('/api/staff/delivery', async (c) => {
  const v = cleanSettings(await c.req.json().catch(() => null));
  if (!v) return c.json({ error: 'BAD_INPUT' }, 400);
  const db = c.env.DB;
  const before = await getLocation(db, c.env.LOCATION_ID);
  if (!before) return c.json({ error: 'NO_LOCATION' }, 500);
  const who = c.get('staff');
  await db
    .prepare(
      `UPDATE locations SET delivery_enabled = ?, lat = ?, lng = ?, delivery_radius_km = ?, delivery_base_fee = ?, delivery_base_km = ?,
         delivery_per_km = ?, delivery_free_from = ?, delivery_min_order = ?, delivery_changed_by = ?, delivery_changed_at = ? WHERE id = ?`,
    )
    .bind(v.enabled ? 1 : 0, v.lat, v.lng, v.radius_km, v.base_fee, v.base_km, v.per_km, v.free_from, v.min_order, who, iso(), before.id)
    .run();
  const loc = (await getLocation(db, c.env.LOCATION_ID))!;
  if (c.env.TG_STAFF_CHAT_ID) {
    const onOff = !!before.delivery_enabled !== v.enabled ? (v.enabled ? '🛵 Доставка включена' : '⛔️ Доставка выключена') : '🛵 Изменены настройки доставки';
    const sum = (x: number) => fmtVndPlain(x);
    const text = [
      `${onOff} · ${escHtml(who)}`,
      `${sum(v.base_fee)} до ${v.base_km} км, +${sum(v.per_km)} за км, радиус ${v.radius_km} км`,
      `${v.free_from ? `Бесплатно от ${sum(v.free_from)}` : 'Бесплатной доставки нет'} · ${v.min_order ? `минимум ${sum(v.min_order)}` : 'без минимальной суммы'}`,
    ].join('\n');
    background(c, tg(c.env, 'sendMessage', { chat_id: Number(c.env.TG_STAFF_CHAT_ID), text, parse_mode: 'HTML', disable_notification: true }));
  }
  return c.json(deliveryView(loc));
});

// ---------- Столы: для сотрудника ----------

app.get('/api/staff/tables', async (c) => {
  return c.json({ tables: await staffTablesView(c.env.DB, c.env.LOCATION_ID), publicUrl: baseUrl(c) });
});

const STAFF_BILL_ACTIONS: BillAction[] = ['paid_qr', 'paid_cash', 'merge_all'];

app.post('/api/staff/bills/:id/action', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { action?: BillAction };
  if (!body.action || !STAFF_BILL_ACTIONS.includes(body.action)) return c.json({ error: 'BAD_ACTION' }, 400);
  const id = Number(c.req.param('id'));
  const own = await c.env.DB.prepare('SELECT id FROM bills WHERE id = ? AND location_id = ?').bind(id, c.env.LOCATION_ID).first();
  if (!own) return c.json({ error: 'NOT_FOUND' }, 404);
  const actor = `staff:${c.get('staff')}`;
  const r = await billAction(c.env.DB, id, body.action, actor);
  if (!r.ok) return c.json({ error: r.error }, 409);
  if (r.changed) background(c, notifyBillEvent(c.env, id, body.action === 'merge_all' ? 'merged' : 'paid', actor));
  return c.json({ ok: true, changed: r.changed });
});

app.post('/api/staff/calls/:id/done', async (c) => {
  const changed = await closeCall(c.env.DB, Number(c.req.param('id')), `staff:${c.get('staff')}`);
  return c.json({ ok: true, changed });
});

// ---------- Столы: для гостя (QR на столе) ----------
// Гость без входа. Телефон хранит свой ключ (device): по нему находится его счёт за этим столом.

async function tableCtx(c: any) {
  const code = String(c.req.param('code') || '');
  if (!TABLE_CODE_RE.test(code)) return null;
  const t = await tableByCode(c.env.DB, code);
  return t && t.location_id === c.env.LOCATION_ID ? t : null;
}
const deviceOf = (v: unknown) => (typeof v === 'string' && DEVICE_RE.test(v) ? v : null);

app.get('/api/table/:code', async (c) => {
  const t = await tableCtx(c);
  if (!t) return c.json({ error: 'TABLE_NOT_FOUND' }, 404);
  const device = deviceOf(c.req.query('d'));
  const loc = await getLocation(c.env.DB, t.location_id);
  const view = device ? await guestBillView(c.env.DB, t, device, loc?.payment_qr_url ?? null, langOf(c.req.query('lang'))) : { table: { id: t.id, zone: t.zone, title: tableTitle(t) }, bill: null, others: { count: 0, total: 0 }, calls: { waiter: false, bill: false }, qrUrl: loc?.payment_qr_url ?? null };
  const now = toLocal(nowMs(), loc!.tz_offset_min);
  return c.json({ ...view, open: c.env.TABLE_ANY_HOUR === '1' || tableOpenNow(now.minutes, loc!.open_min, loc!.close_min) });
});

interface TableOrderBody {
  idempotencyKey: string;
  device: string;
  items: CartItemInput[];
  comment?: string;
  lang?: string;
}

app.post('/api/table/:code/orders', async (c) => {
  const body = (await c.req.json().catch(() => null)) as TableOrderBody | null;
  if (!body) return c.json({ error: 'BAD_INPUT' }, 400);
  const key = cleanText(body.idempotencyKey, 80);
  const device = deviceOf(body.device);
  if (key.length < 8 || !device) return c.json({ error: 'BAD_INPUT' }, 400);
  const db = c.env.DB;
  const existing = await db.prepare('SELECT id, total, bill_id FROM orders WHERE idempotency_key = ?').bind(key).first<any>();
  if (existing) return c.json({ number: existing.id, total: existing.total, billId: existing.bill_id, duplicate: true });

  const t = await tableCtx(c);
  if (!t) return c.json({ error: 'TABLE_NOT_FOUND' }, 404);
  const loc = await getLocation(db, t.location_id);
  if (!loc) return c.json({ error: 'NO_LOCATION' }, 500);
  const now = toLocal(nowMs(), loc.tz_offset_min);
  if (c.env.TABLE_ANY_HOUR !== '1' && !tableOpenNow(now.minutes, loc.open_min, loc.close_min)) throw new OrderError('TABLE_CLOSED');

  const lang = langOf(body.lang);
  const menu = indexMenu(await loadMenu(db));
  const soldOut = await soldOutOn(db, loc.id, now.day);
  // В зале алкоголь можно.
  const { lines, subtotal } = priceCart(body.items, menu, soldOut, { alcoholAllowed: true, lang: 'ru' }); // названия в заказе — по-русски, для кухни

  const insert = async (billId: number) => {
    const ts = iso();
    const insertOrder = db
      .prepare(
        `INSERT INTO orders (public_token, idempotency_key, location_id, channel, type, slot, status, payment_method, payment_status,
           subtotal, delivery_fee, total, guest_name, guest_phone, comment, lang, created_at, updated_at, table_id, bill_id)
         SELECT ?, ?, ?, 'table', 'table', NULL, 'new', 'bill', 'unpaid', ?, 0, ?, ?, '', ?, ?, ?, ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM bills WHERE id = ? AND status = 'open')`,
      )
      .bind(crypto.randomUUID(), key, loc.id, subtotal, subtotal, tableTitle(t), cleanText(body.comment, 300) || null, lang, ts, ts, t.id, billId, billId);
    const insertItems = lines.map((l) =>
      db
        .prepare(`INSERT INTO order_items (order_id, dish_id, name, qty, unit_price, options, line_total) SELECT id, ?, ?, ?, ?, ?, ? FROM orders WHERE idempotency_key = ?`)
        .bind(l.dishId, l.name, l.qty, l.unitPrice, JSON.stringify(l.options), l.lineTotal, key),
    );
    const insertEvent = db.prepare(`INSERT INTO order_events (order_id, at, actor, kind) SELECT id, ?, 'guest', 'created' FROM orders WHERE idempotency_key = ?`).bind(ts, key);
    const res = await db.batch([insertOrder, ...insertItems, insertEvent]);
    return res[0].meta.changes ?? 0;
  };

  try {
    let bill = await openBillFor(db, t, device);
    let n = await insert(bill.id);
    // Счёт закрыли (оплатили) ровно в этот момент — открываем новый и пробуем ещё раз.
    if (n === 0) {
      bill = await openBillFor(db, t, device);
      n = await insert(bill.id);
    }
    if (n === 0) throw new OrderError('BILL_CLOSED');
  } catch (e) {
    const again = await db.prepare('SELECT id, total, bill_id FROM orders WHERE idempotency_key = ?').bind(key).first<any>();
    if (again) return c.json({ number: again.id, total: again.total, billId: again.bill_id, duplicate: true });
    throw e;
  }
  const row = await db.prepare('SELECT id, bill_id FROM orders WHERE idempotency_key = ?').bind(key).first<any>();
  notifyLater(c, row.id, 'created', 'guest');
  return c.json({ number: row.id, total: subtotal, billId: row.bill_id }, 201);
});

app.post('/api/table/:code/call', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { device?: string; kind?: string };
  const device = deviceOf(body.device);
  if (!device || (body.kind !== 'waiter' && body.kind !== 'bill')) return c.json({ error: 'BAD_INPUT' }, 400);
  const t = await tableCtx(c);
  if (!t) return c.json({ error: 'TABLE_NOT_FOUND' }, 404);
  let billId: number | null = null;
  if (body.kind === 'bill') {
    const b = await findBill(c.env.DB, t, device);
    if (!b || b.status !== 'open' || (await billTotal(c.env.DB, b.id)) <= 0) return c.json({ error: 'BILL_EMPTY' }, 409);
    billId = b.id;
    await markBillRequested(c.env.DB, b.id);
  }
  const r = await createCall(c.env.DB, t, body.kind, billId);
  if (r.created && r.call) background(c, notifyTableCall(c.env, r.call.id));
  return c.json({ ok: true, duplicate: !r.created });
});

async function guestBillAction(c: any, action: BillAction) {
  const body = (await c.req.json().catch(() => ({}))) as { device?: string };
  const device = deviceOf(body.device);
  if (!device) return c.json({ error: 'BAD_INPUT' }, 400);
  const t = await tableCtx(c);
  if (!t) return c.json({ error: 'TABLE_NOT_FOUND' }, 404);
  const b = await findBill(c.env.DB, t, device);
  if (!b) return c.json({ error: 'BILL_EMPTY' }, 409);
  const r = await billAction(c.env.DB, b.id, action, 'guest');
  if (!r.ok) return c.json({ error: r.error }, 409);
  if (r.changed) background(c, notifyBillEvent(c.env, b.id, action === 'merge_all' ? 'merged' : action === 'report_payment' ? 'payment_reported' : 'paid', 'guest'));
  return c.json({ ok: true, changed: r.changed });
}

app.post('/api/table/:code/bill/merge', (c) => guestBillAction(c, 'merge_all'));
app.post('/api/table/:code/bill/report-payment', (c) => guestBillAction(c, 'report_payment'));

app.all('/api/*', (c) => c.json({ error: 'NOT_FOUND' }, 404));

// Ссылка из QR на столе: /t/<код> → меню со столом.
app.get('/t/:code', (c) => {
  const code = c.req.param('code');
  if (!TABLE_CODE_RE.test(code)) return c.redirect('/', 302);
  return c.redirect(`/?table=${code}`, 302);
});

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
