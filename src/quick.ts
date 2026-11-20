// Быстрые кнопки в чате бота: «Блюдо дня», «Быстрый заказ», «Повторить прошлый заказ».
// Полный заказ остаётся в окне меню (Mini App). Здесь — корзина в одном сообщении, которое бот обновляет,
// выбор самовывоза / «к визиту», дня и времени, проверка и оформление через общую логику заказа (createOrder).
import { getLocation, indexMenu, loadMenu, soldOutOn, takenSlots, type Location, type MenuData } from './db';
import { OrderError, pickName, priceCart, type MenuIndex } from './lib/pricing';
import { checkSlot, orderableDays, slotsForDay, toLocal } from './lib/time';
import { escHtml, fmtVnd, type InlineButton, type Lang } from './lib/telegram';
import {
  QT,
  quickKeyboard,
  QUICK_MAX,
  addToCart,
  cartParam,
  confirmScreen,
  daysScreen,
  isMenuId,
  nextRequiredGroup,
  optionScreen,
  parseCart,
  qt,
  quickScreen,
  repeatCart,
  repeatScreen,
  timeScreen,
  typeScreen,
  undoLast,
  type BotCartItem,
  type QuickCb,
  type QuickDish,
} from './lib/quick';
import { enabledTypes, createOrder } from './orders';
import type { TgEnv } from './bot';

type Tg = (env: TgEnv, method: string, payload: Record<string, unknown>) => Promise<any>;
type Notify = (env: TgEnv, orderId: number, event: string, actor: string, baseUrl: string) => Promise<void>;
type Screen = { text: string; rows: InlineButton[][] };

const kb = (rows: InlineButton[][]) => ({ inline_keyboard: rows });
const CART_TTL_MS = 12 * 3600_000; // корзина, забытая на полдня, начинается заново
export const PHONE_RE = /^\+?[0-9 ()-]{7,20}$/;

// ---------- Выбор сотрудника: блюдо дня и позиции быстрого заказа ----------

export interface Picks {
  day: { dishId: string; note: Record<string, string> } | null;
  quick: string[];
}

export async function loadPicks(db: D1Database, locationId: string): Promise<Picks> {
  const r = await db.prepare('SELECT kind, dish_id, sort, note FROM bot_picks WHERE location_id = ? ORDER BY kind, sort').bind(locationId).all<any>();
  const day = r.results.find((x) => x.kind === 'day');
  let note: Record<string, string> = {};
  try {
    note = day?.note ? JSON.parse(day.note) : {};
  } catch {
    /* пустой комментарий */
  }
  return {
    day: day ? { dishId: day.dish_id, note } : null,
    quick: r.results.filter((x) => x.kind === 'quick').map((x) => x.dish_id).slice(0, QUICK_MAX),
  };
}

// ---------- Корзина гостя ----------

interface Cart {
  user_id: number;
  items: BotCartItem[];
  pending: { k: 'opt'; dishId: string; optionIds: string[] } | { k: 'phone' } | null;
  type: 'pickup' | 'visit' | null;
  day: string | null;
  slot: string | null;
  phone: string | null;
  source: string | null;
  last_order: number | null;
  idem: string;
}

const newKey = () => `bot-${crypto.randomUUID()}`;

async function getCart(db: D1Database, userId: number): Promise<Cart> {
  const row = await db.prepare('SELECT * FROM bot_carts WHERE user_id = ?').bind(userId).first<any>();
  if (!row) return { user_id: userId, items: [], pending: null, type: null, day: null, slot: null, phone: null, source: null, last_order: null, idem: newKey() };
  let pending = null;
  try {
    pending = row.pending ? JSON.parse(row.pending) : null;
  } catch {
    /* сброс */
  }
  const cart: Cart = {
    user_id: userId,
    items: parseCart(row.items),
    pending,
    type: row.type === 'visit' || row.type === 'pickup' ? row.type : null,
    day: row.day,
    slot: row.slot,
    phone: row.phone,
    source: row.source,
    last_order: row.last_order,
    idem: row.idem,
  };
  if (Date.now() - Date.parse(row.updated_at) > CART_TTL_MS) Object.assign(cart, { items: [], pending: null, type: null, day: null, slot: null, idem: newKey() });
  return cart;
}

async function saveCart(db: D1Database, c: Cart) {
  await db
    .prepare(
      `INSERT INTO bot_carts (user_id, items, pending, type, day, slot, phone, source, last_order, idem, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET items = excluded.items, pending = excluded.pending, type = excluded.type, day = excluded.day,
         slot = excluded.slot, phone = excluded.phone, source = excluded.source, last_order = excluded.last_order, idem = excluded.idem, updated_at = excluded.updated_at`,
    )
    .bind(c.user_id, JSON.stringify(c.items), c.pending ? JSON.stringify(c.pending) : null, c.type, c.day, c.slot, c.phone, c.source, c.last_order, c.idem, new Date().toISOString())
    .run();
}

// ---------- Общие данные для экранов ----------

interface Ctx {
  loc: Location;
  menu: MenuData;
  index: MenuIndex;
  today: string;
  soldToday: Set<string>;
  picks: Picks;
  base: string;
}

async function context(env: TgEnv, base: string): Promise<Ctx | null> {
  const loc = await getLocation(env.DB, env.LOCATION_ID);
  if (!loc) return null;
  const menu = await loadMenu(env.DB);
  const today = toLocal(Date.now(), loc.tz_offset_min).day;
  const [soldToday, picks] = await Promise.all([soldOutOn(env.DB, loc.id, today), loadPicks(env.DB, loc.id)]);
  return { loc, menu, index: indexMenu(menu), today, soldToday, picks, base };
}

function menuButton(x: Ctx, lang: Lang, items: BotCartItem[], key = 'openMenu'): InlineButton {
  const cart = items.length ? `&cart=${encodeURIComponent(cartParam(items))}` : '';
  // Доставка из чата: окно меню сразу открывает корзину с выбранной доставкой (адрес и карта — там).
  const type = key === 'delivery' ? '&type=delivery' : '';
  return { text: qt(lang, key), web_app: { url: `${x.base}/?tg=1${cart}${type}` } };
}

function quickDishes(x: Ctx, lang: Lang): QuickDish[] {
  return x.picks.quick
    .map((id) => x.index.dishes.get(id))
    .filter((d): d is NonNullable<typeof d> => !!d && d.active)
    // Блюдо на стопе остаётся в списке с пометкой «на стопе»; нажатие только покажет подсказку.
    .map((d) => ({ id: d.id, name: pickName(d.name, lang), price: d.price, isDay: x.picks.day?.dishId === d.id, stopped: x.soldToday.has(d.id) }));
}

const quickView = (x: Ctx, lang: Lang, c: Cart): Screen => quickScreen(lang, quickDishes(x, lang), c.items, x.index, menuButton(x, lang, c.items));

/** Показать экран: в том же сообщении (если есть) или новым сообщением. */
async function show(env: TgEnv, tg: Tg, chatId: number, messageId: number | null, s: Screen) {
  const payload = { chat_id: chatId, text: s.text, parse_mode: 'HTML', reply_markup: kb(s.rows), link_preview_options: { is_disabled: true } };
  if (messageId) {
    const r = await tg(env, 'editMessageText', { ...payload, message_id: messageId });
    if (r) return messageId;
  }
  const sent = await tg(env, 'sendMessage', payload);
  return sent?.message_id ?? null;
}

const TYPE_L: Record<Lang, Record<string, string>> = {
  ru: { pickup: '🥡 Самовывоз', visit: '🍽 К визиту' },
  vi: { pickup: '🥡 Tự đến lấy', visit: '🍽 Đặt trước khi đến' },
  en: { pickup: '🥡 Pickup', visit: '🍽 For your visit' },
};

/** Кнопки под приветствием: блюдо дня, быстрый заказ и «Повторить», если у гостя уже был предзаказ. */
export async function welcomeRows(env: TgEnv, userId: number, lang: Lang): Promise<InlineButton[][]> {
  const past = await env.DB.prepare("SELECT 1 FROM orders WHERE tg_user_id = ? AND type != 'table' LIMIT 1").bind(userId).first();
  const rows: InlineButton[][] = [[{ text: qt(lang, 'btnDay'), callback_data: 'q:day' }, { text: qt(lang, 'btnQuick'), callback_data: 'q:new' }]];
  if (past) rows.push([{ text: qt(lang, 'btnRepeat'), callback_data: 'q:rep' }]);
  return rows;
}

// ---------- Блюдо дня ----------

async function sendDay(env: TgEnv, tg: Tg, x: Ctx, chatId: number, lang: Lang) {
  const pick = x.picks.day;
  const d = pick ? x.index.dishes.get(pick.dishId) : undefined;
  const more: InlineButton[] = [{ text: qt(lang, 'dayMore'), callback_data: 'q:new' }];
  if (!pick || !d || !d.active || x.soldToday.has(d.id)) {
    await tg(env, 'sendMessage', {
      chat_id: chatId,
      text: qt(lang, pick && d && d.active ? 'daySold' : 'dayNone', { name: d ? pickName(d.name, lang) : '' }),
      reply_markup: kb([more, [menuButton(x, lang, [])]]),
    });
    return;
  }
  const full = x.menu.dishes.find((m) => m.id === d.id);
  const note = pick.note[lang] || '';
  const desc = pickName(full?.description ?? {}, lang);
  const caption = [
    `⭐ <b>${escHtml(qt(lang, 'dayTitle'))}: ${escHtml(pickName(d.name, lang))}</b>`,
    `<b>${fmtVnd(d.price)}</b>`,
    note ? `\n«${escHtml(note)}» — ${qt(lang, 'chef')}` : desc ? `\n${escHtml(desc.slice(0, 400))}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const reply_markup = kb([[{ text: qt(lang, 'dayAdd'), callback_data: `q:da:${d.id}` }], more]);
  const photo = full?.photo ? (full.photo.startsWith('http') ? full.photo : `${x.base}${full.photo}`) : null;
  const sent = photo ? await tg(env, 'sendPhoto', { chat_id: chatId, photo, caption, parse_mode: 'HTML', reply_markup }) : null;
  if (!sent) await tg(env, 'sendMessage', { chat_id: chatId, text: caption, parse_mode: 'HTML', reply_markup });
}

// ---------- Повтор прошлого заказа ----------

async function sendRepeat(env: TgEnv, tg: Tg, x: Ctx, c: Cart, chatId: number, lang: Lang) {
  const o = await env.DB.prepare("SELECT id, created_at FROM orders WHERE tg_user_id = ? AND location_id = ? AND type != 'table' ORDER BY id DESC LIMIT 1")
    .bind(c.user_id, x.loc.id)
    .first<any>();
  if (!o) {
    await tg(env, 'sendMessage', { chat_id: chatId, text: qt(lang, 'repeatNone'), reply_markup: kb([[{ text: qt(lang, 'btnQuick'), callback_data: 'q:new' }], [menuButton(x, lang, [])]]) });
    return;
  }
  const items = await env.DB.prepare('SELECT dish_id, name, qty, unit_price, options FROM order_items WHERE order_id = ? ORDER BY id').bind(o.id).all<any>();
  const past = items.results.map((i) => ({ ...i, options: JSON.parse(i.options || '[]') }));
  const r = repeatCart(past, x.index, x.soldToday, lang);
  Object.assign(c, { items: r.items, pending: null, type: null, day: null, slot: null, source: 'repeat' });
  await saveCart(env.DB, c);
  const local = toLocal(Date.parse(o.created_at), x.loc.tz_offset_min).day.split('-');
  await show(env, tg, chatId, null, repeatScreen(lang, o.id, `${local[2]}.${local[1]}`, c.items, r.notes, x.index, menuButton(x, lang, c.items)));
}

// ---------- Вход: команды /day /quick /repeat и кнопки под приветствием ----------

export async function quickEntry(env: TgEnv, tg: Tg, userId: number, lang: Lang, kind: 'day' | 'new' | 'rep', base: string) {
  const x = await context(env, base);
  if (!x) return;
  if (kind === 'day') return sendDay(env, tg, x, userId, lang);
  const c = await getCart(env.DB, userId);
  if (kind === 'rep') return sendRepeat(env, tg, x, c, userId, lang);
  c.pending = null;
  if (!c.source) c.source = 'quick';
  await saveCart(env.DB, c);
  await show(env, tg, userId, null, quickView(x, lang, c));
}

// ---------- Нажатия в корзине ----------

function addDish(x: Ctx, c: Cart, dishId: string, lang: Lang): { ok: true; needsOption: boolean } | { ok: false; why: string } {
  const d = x.index.dishes.get(dishId);
  if (!d || !d.active) return { ok: false, why: qt(lang, 'err_DISH_UNAVAILABLE') };
  if (x.soldToday.has(d.id)) return { ok: false, why: qt(lang, 'soldNow', { name: pickName(d.name, lang) }) };
  const groups = x.index.groupsByDish.get(d.id) ?? [];
  if (nextRequiredGroup(groups, [], x.index.options)) {
    c.pending = { k: 'opt', dishId: d.id, optionIds: [] };
    return { ok: true, needsOption: true };
  }
  c.items = addToCart(c.items, d.id);
  c.pending = null;
  return { ok: true, needsOption: false };
}

function optionView(x: Ctx, c: Cart, lang: Lang): Screen | null {
  if (c.pending?.k !== 'opt') return null;
  const groups = x.index.groupsByDish.get(c.pending.dishId) ?? [];
  const g = nextRequiredGroup(groups, c.pending.optionIds, x.index.options);
  const d = x.index.dishes.get(c.pending.dishId);
  if (!g || !d) return null;
  return optionScreen(lang, pickName(d.name, lang), g, x.menu.options);
}

const hasAlcohol = (x: Ctx, c: Cart) => c.items.some((i) => x.index.dishes.get(i.dishId)?.is_alcohol);

async function timeView(env: TgEnv, x: Ctx, c: Cart, lang: Lang, page = 0): Promise<Screen> {
  const days = orderableDays(Date.now(), x.loc);
  if (!c.day || !days.includes(c.day)) c.day = days[0];
  const type = c.type ?? 'pickup';
  const slots = slotsForDay(c.day, Date.now(), x.loc, type, await takenSlots(env.DB, x.loc.id, c.day));
  // Сегодня уже ничего не успеваем — сразу показываем завтра.
  if (c.day === days[0] && !slots.some((s) => s.state === 'free') && page === 0 && days[1]) {
    const tomorrow = slotsForDay(days[1], Date.now(), x.loc, type, await takenSlots(env.DB, x.loc.id, days[1]));
    if (tomorrow.some((s) => s.state === 'free')) {
      c.day = days[1];
      return timeScreen(lang, type, c.day, days, tomorrow, 0);
    }
  }
  return timeScreen(lang, type, c.day, days, slots, page);
}

/** Проверка корзины по меню на день заказа — те же правила, что и при оформлении. */
function confirmView(x: Ctx, c: Cart, lang: Lang, sold: Set<string>): Screen {
  const edit = menuButton(x, lang, c.items, 'editInMenu');
  try {
    const { lines, subtotal } = priceCart(c.items, x.index, sold, { alcoholAllowed: c.type === 'visit', lang });
    return confirmScreen(lang, lines.map((l) => ({ name: l.options.length ? `${l.name} (${l.options.map((o) => o.name).join(', ')})` : l.name, qty: l.qty, lineTotal: l.lineTotal })), subtotal, TYPE_L[lang][c.type!], c.slot!, x.today, edit);
  } catch (e) {
    if (e instanceof OrderError) return errorView(x, c, lang, e);
    throw e;
  }
}

function errorView(x: Ctx, c: Cart, lang: Lang, e: OrderError): Screen {
  const slotErr = ['SLOT_FULL', 'SLOT_TOO_SOON', 'SLOT_INVALID', 'SLOT_OUT_OF_RANGE'].includes(e.code);
  const key = `err_${e.code}`;
  const known = key in QT[lang];
  const text = qt(lang, known ? key : 'err_OTHER', { name: String(e.details.name ?? '') });
  const back: InlineButton = slotErr ? { text: qt(lang, 'otherTime'), callback_data: `q:d:${c.day ?? x.today}` } : { text: qt(lang, 'toCart'), callback_data: 'q:l' };
  return { text: `⚠️ ${text}`, rows: [[back], [menuButton(x, lang, c.items, 'editInMenu')]] };
}

/** Номер телефона из прошлого заказа этого гостя (сайт или бот). */
async function knownPhone(env: TgEnv, userId: number): Promise<string | null> {
  const r = await env.DB.prepare("SELECT guest_phone FROM orders WHERE tg_user_id = ? AND type != 'table' AND guest_phone != '' ORDER BY id DESC LIMIT 1").bind(userId).first<any>();
  return r?.guest_phone ?? null;
}

async function askPhone(env: TgEnv, tg: Tg, chatId: number, lang: Lang) {
  await tg(env, 'sendMessage', {
    chat_id: chatId,
    text: qt(lang, 'askPhone'),
    reply_markup: { keyboard: [[{ text: qt(lang, 'sendPhone'), request_contact: true }]], resize_keyboard: true, one_time_keyboard: true },
  });
}

export async function onQuickCallback(
  env: TgEnv,
  tg: Tg,
  notify: Notify,
  q: any,
  cbq: QuickCb,
  base: string,
  lang: Lang,
  answer: (t: string, alert?: boolean) => Promise<any>,
) {
  const userId: number = q.from?.id;
  const chatId: number = q.message?.chat?.id;
  // Быстрые кнопки работают только в личном чате гостя с ботом.
  if (!userId || chatId !== userId) return void (await answer(''));
  const x = await context(env, base);
  if (!x) return void (await answer(''));
  const c = await getCart(env.DB, userId);
  const here: number | null = q.message?.message_id && !q.message.photo ? q.message.message_id : null;
  let toast = '';
  let screen: Screen | null = null;
  let target = here; // какое сообщение обновить; null — отправить новое

  switch (cbq.k) {
    case 'day':
      await answer('');
      return sendDay(env, tg, x, chatId, lang);
    case 'rep':
      await answer('');
      return sendRepeat(env, tg, x, c, chatId, lang);
    case 'new':
      target = null;
      c.pending = null;
      if (!c.source) c.source = 'quick';
      screen = quickView(x, lang, c);
      break;
    case 'da':
    case 'a': {
      if (cbq.k === 'da') target = null;
      const r = addDish(x, c, cbq.id, lang);
      if (!r.ok) {
        toast = r.why;
        screen = quickView(x, lang, c);
        break;
      }
      if (!c.source) c.source = 'quick';
      screen = r.needsOption ? optionView(x, c, lang) : quickView(x, lang, c);
      const d = x.index.dishes.get(cbq.id)!;
      if (!r.needsOption) toast = qt(lang, 'added', { name: pickName(d.name, lang) });
      break;
    }
    case 'o': {
      const p = c.pending;
      const o = x.index.options.get(cbq.id);
      if (p?.k !== 'opt' || !o || !o.active) {
        c.pending = null;
        screen = quickView(x, lang, c);
        break;
      }
      const groups = x.index.groupsByDish.get(p.dishId) ?? [];
      const g = nextRequiredGroup(groups, p.optionIds, x.index.options);
      if (!g || o.group_id !== g.id) {
        screen = optionView(x, c, lang) ?? quickView(x, lang, c);
        break;
      }
      p.optionIds.push(o.id);
      if (nextRequiredGroup(groups, p.optionIds, x.index.options)) {
        screen = optionView(x, c, lang);
        break;
      }
      c.items = addToCart(c.items, p.dishId, p.optionIds);
      c.pending = null;
      toast = qt(lang, 'added', { name: pickName(x.index.dishes.get(p.dishId)?.name ?? {}, lang) });
      screen = quickView(x, lang, c);
      break;
    }
    case 'l':
      c.pending = null;
      screen = quickView(x, lang, c);
      break;
    case 'undo':
      c.items = undoLast(c.items);
      toast = qt(lang, c.items.length ? 'removed' : 'cleared');
      screen = quickView(x, lang, c);
      break;
    case 'clr':
      c.items = [];
      c.pending = null;
      toast = qt(lang, 'cleared');
      screen = quickView(x, lang, c);
      break;
    case 'go':
      if (!c.items.length) {
        toast = qt(lang, 'empty');
        screen = quickView(x, lang, c);
        break;
      }
      c.pending = null;
      screen = typeScreen(lang, hasAlcohol(x, c), enabledTypes(x.loc).includes('delivery') ? menuButton(x, lang, c.items, 'delivery') : null);
      break;
    case 't':
      if (!c.items.length) {
        screen = quickView(x, lang, c);
        break;
      }
      c.type = hasAlcohol(x, c) ? 'visit' : cbq.type;
      screen = await timeView(env, x, c, lang);
      break;
    case 'dy':
      screen = daysScreen(lang, orderableDays(Date.now(), x.loc));
      break;
    case 'd':
    case 'sp':
      if (!c.items.length) {
        screen = quickView(x, lang, c);
        break;
      }
      if (!c.type) {
        screen = typeScreen(lang, hasAlcohol(x, c), null);
        break;
      }
      if (cbq.k === 'd') c.day = cbq.day;
      screen = await timeView(env, x, c, lang, cbq.k === 'sp' ? cbq.page : 0);
      break;
    case 's': {
      if (!c.items.length || !c.type || !c.day) {
        screen = quickView(x, lang, c);
        break;
      }
      const slot = `${c.day} ${cbq.time}`;
      const err = checkSlot(slot, Date.now(), x.loc, c.type);
      if (err) {
        toast = qt(lang, `err_${err === 'SLOT_TOO_SOON' ? 'SLOT_TOO_SOON' : 'SLOT_FULL'}`);
        screen = await timeView(env, x, c, lang);
        break;
      }
      c.slot = slot;
      c.phone = c.phone || (await knownPhone(env, userId));
      if (!c.phone) {
        c.pending = { k: 'phone' };
        await saveCart(env.DB, c);
        await answer('');
        await askPhone(env, tg, chatId, lang);
        return;
      }
      screen = confirmView(x, c, lang, await soldOutOn(env.DB, x.loc.id, c.day));
      break;
    }
    case 'ok':
      return placeOrder(env, tg, notify, x, c, q, here, lang, answer);
  }

  await saveCart(env.DB, c);
  await answer(toast);
  if (screen) await show(env, tg, chatId, target, screen);
}

/** «Подтвердить заказ»: общая логика заказа. Повторное нажатие возвращает тот же заказ и ничего не шлёт второй раз. */
async function placeOrder(env: TgEnv, tg: Tg, notify: Notify, x: Ctx, c: Cart, q: any, here: number | null, lang: Lang, answer: (t: string, alert?: boolean) => Promise<any>) {
  const chatId = q.from.id;
  if (!c.items.length) return void (await answer(c.last_order ? qt(lang, 'already', { n: c.last_order }) : qt(lang, 'empty')));
  if (!c.type || !c.slot || !c.phone) {
    await answer('');
    return void (await show(env, tg, chatId, here, typeScreen(lang, hasAlcohol(x, c), null)));
  }
  const name = [q.from.first_name, q.from.last_name].filter(Boolean).join(' ').trim().slice(0, 60) || 'Гость';
  try {
    const r = await createOrder(env.DB, x.loc, {
      key: c.idem,
      type: c.type,
      slot: c.slot,
      items: c.items,
      name,
      phone: c.phone,
      comment: null,
      lang,
      tgUserId: chatId,
      source: 'chat',
    });
    // Корзина закрыта: следующее оформление — новый заказ с новым ключом.
    Object.assign(c, { items: [], pending: null, type: null, day: null, slot: null, source: null, last_order: r.id, idem: newKey() });
    await saveCart(env.DB, c);
    if (r.duplicate) return void (await answer(qt(lang, 'already', { n: r.id })));
    await answer('✅');
    // Подтверждение — новым сообщением с кнопками внизу чата: так они гарантированно на месте после заказа.
    // Старое сообщение корзины убираем, чтобы в чате не осталось двух записей об одном заказе.
    if (here) await tg(env, 'deleteMessage', { chat_id: chatId, message_id: here });
    await tg(env, 'sendMessage', { chat_id: chatId, text: qt(lang, 'placed', { n: r.id }), reply_markup: quickKeyboard(lang) });
    await notify(env, r.id, 'created', 'guest', x.base);
  } catch (e) {
    if (!(e instanceof OrderError)) throw e;
    await answer('');
    await show(env, tg, chatId, here, errorView(x, c, lang, e));
  }
}

/** Гость прислал номер (кнопкой «Отправить номер» или текстом), когда бот его просил. true — сообщение обработано. */
export async function onQuickPhone(env: TgEnv, tg: Tg, m: any, base: string, lang: Lang): Promise<boolean> {
  const userId: number = m.from?.id;
  if (!userId) return false;
  const row = await env.DB.prepare('SELECT pending FROM bot_carts WHERE user_id = ?').bind(userId).first<any>();
  if (!row?.pending || !String(row.pending).includes('"phone"')) return false;
  let phone = '';
  if (m.contact && (!m.contact.user_id || m.contact.user_id === userId)) phone = String(m.contact.phone_number || '');
  else if (typeof m.text === 'string' && PHONE_RE.test(m.text.trim())) phone = m.text.trim();
  if (!phone) return false;
  if (!phone.startsWith('+') && /^\d{10,15}$/.test(phone)) phone = `+${phone}`;
  const c = await getCart(env.DB, userId);
  c.phone = phone.slice(0, 30);
  c.pending = null;
  await saveCart(env.DB, c);
  // Вместо кнопки «Отправить номер» снова постоянные кнопки внизу чата.
  await tg(env, 'sendMessage', { chat_id: userId, text: qt(lang, 'phoneSaved'), reply_markup: quickKeyboard(lang) });
  const x = await context(env, base);
  if (!x) return true;
  const screen = c.items.length && c.type && c.slot ? confirmView(x, c, lang, await soldOutOn(env.DB, x.loc.id, c.slot.slice(0, 10))) : quickView(x, lang, c);
  await show(env, tg, userId, null, screen);
  return true;
}

// ---------- Панель сотрудника: вкладка «Бот» ----------

export interface PicksInput {
  day: { dishId: string; note?: Record<string, unknown> } | null;
  quick: string[];
}

export type PicksError = 'DISH_UNAVAILABLE' | 'TOO_MANY' | 'BAD_INPUT';

/** Проверить и сохранить выбор сотрудника. Возвращает список изменений для журнала. */
export async function savePicks(db: D1Database, locationId: string, input: PicksInput, actor: string): Promise<{ ok: true; changes: string[] } | { ok: false; error: PicksError }> {
  if (!input || !Array.isArray(input.quick)) return { ok: false, error: 'BAD_INPUT' };
  const quick = [...new Set(input.quick)];
  if (quick.length > QUICK_MAX) return { ok: false, error: 'TOO_MANY' };
  if (!quick.every(isMenuId) || (input.day && !isMenuId(input.day.dishId))) return { ok: false, error: 'BAD_INPUT' };
  const ids = [...quick, ...(input.day ? [input.day.dishId] : [])];
  const menu = await loadMenu(db);
  const names = new Map(menu.dishes.map((d) => [d.id, pickName(d.name, 'ru')]));
  if (!ids.every((id) => names.has(id))) return { ok: false, error: 'DISH_UNAVAILABLE' };
  const note: Record<string, string> = {};
  for (const l of ['ru', 'vi', 'en']) {
    const v = input.day?.note?.[l];
    if (typeof v === 'string' && v.trim()) note[l] = v.trim().slice(0, 300);
  }

  const before = await loadPicks(db, locationId);
  const changes: string[] = [];
  const dayName = (id?: string) => (id ? names.get(id) || id : '');
  if ((before.day?.dishId ?? null) !== (input.day?.dishId ?? null)) changes.push(input.day ? `главный хит → ${dayName(input.day.dishId)}` : 'главный хит снят');
  else if (input.day && JSON.stringify(before.day?.note ?? {}) !== JSON.stringify(note)) changes.push('изменён комментарий к главному хиту');
  const added = quick.filter((id) => !before.quick.includes(id));
  const removed = before.quick.filter((id) => !quick.includes(id));
  if (added.length) changes.push(`быстрый заказ: добавлено ${added.map(dayName).join(', ')}`);
  if (removed.length) changes.push(`быстрый заказ: убрано ${removed.map(dayName).join(', ')}`);
  if (!added.length && !removed.length && before.quick.join() !== quick.join()) changes.push('быстрый заказ: изменён порядок');
  if (!changes.length) return { ok: true, changes };

  const now = new Date().toISOString();
  await db.batch([
    db.prepare('DELETE FROM bot_picks WHERE location_id = ?').bind(locationId),
    ...(input.day
      ? [db.prepare("INSERT INTO bot_picks (location_id, kind, dish_id, sort, note, updated_by, updated_at) VALUES (?, 'day', ?, 0, ?, ?, ?)").bind(locationId, input.day.dishId, JSON.stringify(note), actor, now)]
      : []),
    ...quick.map((id, i) =>
      db.prepare("INSERT INTO bot_picks (location_id, kind, dish_id, sort, note, updated_by, updated_at) VALUES (?, 'quick', ?, ?, NULL, ?, ?)").bind(locationId, id, i, actor, now),
    ),
    ...changes.map((ch) => db.prepare('INSERT INTO bot_picks_log (location_id, at, actor, change) VALUES (?, ?, ?, ?)').bind(locationId, now, actor, ch)),
  ]);
  return { ok: true, changes };
}

/** Сообщение в группу сотрудников: кто что поменял. */
export function picksChangedText(who: string, picks: Picks, names: Map<string, string>, soldToday: Set<string>): string {
  const day = picks.day ? `⭐ <b>${escHtml(who)}</b> обновил(а) бота. Главный хит: ${escHtml(names.get(picks.day.dishId) || picks.day.dishId)}.` : `⭐ <b>${escHtml(who)}</b> обновил(а) бота. Главный хит не выбрано.`;
  const sold = picks.quick.filter((id) => soldToday.has(id)).map((id) => names.get(id) || id);
  const quick = `Быстрый заказ: ${picks.quick.length} поз.${sold.length ? ` (${escHtml(sold.join(', '))} сейчас в стоп-листе)` : ''}`;
  return `${day}\n${quick}`;
}
