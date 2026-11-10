// Telegram: вызовы Bot API, уведомления о заказах и обработка событий бота.
import { getLocation } from './db';
import { toLocal } from './lib/time';
import type { Action } from './lib/status';
import {
  ACTION_CODES,
  WELCOME,
  escHtml,
  fmtVnd,
  guestEventText,
  parseCallback,
  parseStaffList,
  slotText,
  staffAlertText,
  staffButtons,
  staffOrderText,
  type InlineButton,
} from './lib/telegram';
import { orderWithItems, transition } from './orders';

export interface TgEnv {
  DB: D1Database;
  LOCATION_ID: string;
  TG_BOT_TOKEN?: string;
  TG_WEBHOOK_SECRET?: string;
  TG_STAFF_CHAT_ID?: string;
  TG_STAFF?: string;
  TG_BOT_USERNAME?: string;
  TG_API_BASE?: string;
  PUBLIC_URL?: string;
}

export async function tg(env: TgEnv, method: string, payload: Record<string, unknown>): Promise<any> {
  if (!env.TG_BOT_TOKEN) return null;
  const base = env.TG_API_BASE || 'https://api.telegram.org';
  try {
    const r = await fetch(`${base}/bot${env.TG_BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data: any = await r.json().catch(() => null);
    if (!data?.ok) console.warn(`telegram ${method} failed`, data?.description);
    return data?.ok ? data.result : null;
  } catch (e) {
    console.warn(`telegram ${method} error`, e);
    return null;
  }
}

const staffChat = (env: TgEnv) => (env.TG_STAFF_CHAT_ID ? Number(env.TG_STAFF_CHAT_ID) : null);
const kb = (rows: InlineButton[][]) => ({ inline_keyboard: rows });

async function today(env: TgEnv) {
  const loc = await getLocation(env.DB, env.LOCATION_ID);
  return toLocal(Date.now(), loc?.tz_offset_min ?? 420).day;
}

function orderUrl(base: string, token: string) {
  return `${base}/order?t=${encodeURIComponent(token)}&tg=1`;
}

/** Обновить карточку заказа в группе сотрудников (или создать, если её ещё нет). */
async function syncStaffCard(env: TgEnv, o: any, day: string, lastActor?: string, askCancel = false) {
  const chat = staffChat(env);
  if (!chat) return;
  const text = staffOrderText(o, day, lastActor);
  const reply_markup = kb(staffButtons(o, askCancel));
  if (o.staff_msg_id) {
    await tg(env, 'editMessageText', { chat_id: chat, message_id: o.staff_msg_id, text, parse_mode: 'HTML', reply_markup });
    return;
  }
  const sent = await tg(env, 'sendMessage', { chat_id: chat, text: `🆕 ${text}`, parse_mode: 'HTML', reply_markup });
  if (sent?.message_id) {
    await env.DB.prepare('UPDATE orders SET staff_msg_id = ? WHERE id = ? AND staff_msg_id IS NULL').bind(sent.message_id, o.id).run();
    o.staff_msg_id = sent.message_id;
  }
}

const ACTOR_NOTE: Record<string, string> = {
  payment_confirmed: 'подтвердил(а) оплату',
  cooking_started: 'начал(а) готовить',
  ready: 'отметил(а) «готово»',
  completed: 'выдал(а) заказ',
  cancelled: 'отменил(а) заказ',
};

/** Сообщить гостю и сотрудникам о событии заказа. Ошибки Telegram не мешают заказу. */
export async function notifyOrderEvent(env: TgEnv, orderId: number, event: string, actor: string, baseUrl: string) {
  if (!env.TG_BOT_TOKEN) return;
  const o = await orderWithItems(env.DB, orderId);
  if (!o) return;
  const day = await today(env);
  const who = actor.startsWith('staff:') ? actor.slice(6) : actor === 'guest' ? 'Гость' : '';
  const note = ACTOR_NOTE[event] && who ? `${who} ${ACTOR_NOTE[event]}` : undefined;

  await syncStaffCard(env, o, day, note);
  const alert = staffAlertText(event, o);
  if (alert && staffChat(env)) {
    await tg(env, 'sendMessage', {
      chat_id: staffChat(env),
      text: alert,
      parse_mode: 'HTML',
      ...(o.staff_msg_id ? { reply_parameters: { message_id: o.staff_msg_id, allow_sending_without_reply: true } } : {}),
    });
  }

  if (o.tg_user_id) {
    const text = guestEventText(event, o, day);
    if (text) {
      const open = event === 'created' || event === 'payment_reported';
      await tg(env, 'sendMessage', {
        chat_id: o.tg_user_id,
        text,
        parse_mode: 'HTML',
        ...(open ? { reply_markup: kb([[{ text: event === 'created' ? 'Открыть заказ и QR' : 'Открыть заказ', web_app: { url: orderUrl(baseUrl, o.public_token) } }]]) } : {}),
      });
    }
  }
}

// ---------- События от Telegram ----------

export async function handleUpdate(env: TgEnv, u: any, baseUrl: string): Promise<void> {
  if (u.callback_query) return onCallback(env, u.callback_query, baseUrl);
  const m = u.message;
  if (!m || !m.chat) return;
  if (m.chat.type === 'private') return onPrivate(env, m, baseUrl);
  if (m.chat.id === staffChat(env)) return onStaffGroup(env, m);
  if (typeof m.text === 'string' && /^\/id(@\w+)?$/.test(m.text)) {
    // Помогает настроить группу сотрудников: бот сообщает id этой группы.
    await tg(env, 'sendMessage', { chat_id: m.chat.id, text: `id этой группы: ${m.chat.id}` });
  }
}

function menuButton(baseUrl: string): InlineButton[][] {
  return [[{ text: 'Открыть меню и заказать', web_app: { url: `${baseUrl}/?tg=1` } }]];
}

async function onPrivate(env: TgEnv, m: any, baseUrl: string) {
  const userId: number = m.from?.id ?? m.chat.id;
  const text: string = typeof m.text === 'string' ? m.text.trim() : '';

  if (text.startsWith('/start')) {
    const payload = text.split(/\s+/)[1] || '';
    const link = /^o_([0-9a-f-]{36})$/i.exec(payload);
    if (link) {
      // Ссылка со страницы заказа на сайте: дальше статусы этого заказа приходят в Telegram.
      const o = await env.DB.prepare('SELECT id, public_token, tg_user_id FROM orders WHERE public_token = ?').bind(link[1]).first<any>();
      if (o && (!o.tg_user_id || o.tg_user_id === userId)) {
        await env.DB.prepare('UPDATE orders SET tg_user_id = ? WHERE id = ? AND tg_user_id IS NULL').bind(userId, o.id).run();
        await tg(env, 'sendMessage', {
          chat_id: userId,
          text: `Готово! Статус заказа №${o.id} будем присылать сюда.`,
          reply_markup: kb([[{ text: `Открыть заказ №${o.id}`, web_app: { url: orderUrl(baseUrl, o.public_token) } }]]),
        });
        return;
      }
    }
    await tg(env, 'sendMessage', { chat_id: userId, text: WELCOME, reply_markup: kb(menuButton(baseUrl)) });
    return;
  }

  if (text === '/orders' || text === '/my') {
    const r = await env.DB.prepare('SELECT id, public_token, slot, status, payment_status, total FROM orders WHERE tg_user_id = ? ORDER BY id DESC LIMIT 5').bind(userId).all<any>();
    if (!r.results.length) {
      await tg(env, 'sendMessage', { chat_id: userId, text: 'Заказов пока нет.', reply_markup: kb(menuButton(baseUrl)) });
      return;
    }
    const day = await today(env);
    await tg(env, 'sendMessage', {
      chat_id: userId,
      text: 'Ваши последние заказы:',
      reply_markup: kb(r.results.map((o) => [{ text: `№${o.id} · ${slotText(o.slot, day)} · ${fmtVnd(o.total)}`, web_app: { url: orderUrl(baseUrl, o.public_token) } }])),
    });
    return;
  }

  // Любое другое сообщение — администратору в группу сотрудников. Ответ сотрудника вернётся сюда.
  const chat = staffChat(env);
  if (!chat) {
    await tg(env, 'sendMessage', { chat_id: userId, text: 'Спасибо! Сейчас ответить здесь не можем, позвоните нам, пожалуйста.' });
    return;
  }
  const last = await env.DB.prepare('SELECT id FROM orders WHERE tg_user_id = ? ORDER BY id DESC LIMIT 1').bind(userId).first<any>();
  const name = [m.from?.first_name, m.from?.last_name].filter(Boolean).join(' ') || 'Гость';
  const handle = m.from?.username ? ` (@${escHtml(m.from.username)})` : '';
  const head = `💬 <b>${escHtml(name)}</b>${handle}${last ? ` · заказ №${last.id}` : ''}\n<i>Ответьте на это сообщение, и бот перешлёт ответ гостю.</i>`;
  const now = new Date().toISOString();
  const ids: number[] = [];
  if (text) {
    const s = await tg(env, 'sendMessage', { chat_id: chat, text: `${head}\n\n${escHtml(text)}`, parse_mode: 'HTML' });
    if (s?.message_id) ids.push(s.message_id);
  } else {
    const h = await tg(env, 'sendMessage', { chat_id: chat, text: head, parse_mode: 'HTML' });
    const c = await tg(env, 'copyMessage', { chat_id: chat, from_chat_id: m.chat.id, message_id: m.message_id });
    if (h?.message_id) ids.push(h.message_id);
    if (c?.message_id) ids.push(c.message_id);
  }
  const recent = await env.DB.prepare(`SELECT 1 FROM tg_relay WHERE user_id = ? AND created_at > ? LIMIT 1`).bind(userId, new Date(Date.now() - 10 * 60000).toISOString()).first();
  for (const id of ids) {
    await env.DB.prepare('INSERT OR IGNORE INTO tg_relay (group_msg_id, user_id, order_id, created_at) VALUES (?, ?, ?, ?)').bind(id, userId, last?.id ?? null, now).run();
  }
  if (!recent) await tg(env, 'sendMessage', { chat_id: userId, text: 'Передали администратору. Ответ придёт сюда.' });
}

async function onStaffGroup(env: TgEnv, m: any) {
  const staff = parseStaffList(env.TG_STAFF);
  const replyTo = m.reply_to_message?.message_id;
  if (!replyTo || !staff.has(m.from?.id)) return;
  // Ответ на сообщение гостя или на карточку заказа уходит гостю.
  let userId: number | null = null;
  const relay = await env.DB.prepare('SELECT user_id FROM tg_relay WHERE group_msg_id = ?').bind(replyTo).first<any>();
  if (relay) userId = relay.user_id;
  else {
    const o = await env.DB.prepare('SELECT tg_user_id FROM orders WHERE staff_msg_id = ?').bind(replyTo).first<any>();
    userId = o?.tg_user_id ?? null;
  }
  if (!userId) {
    await tg(env, 'sendMessage', { chat_id: m.chat.id, text: 'Этот гость не на связи в Telegram, позвоните ему по телефону из заказа.', reply_parameters: { message_id: m.message_id } });
    return;
  }
  let sent;
  if (typeof m.text === 'string') sent = await tg(env, 'sendMessage', { chat_id: userId, text: `<b>Администратор VIBE:</b>\n${escHtml(m.text)}`, parse_mode: 'HTML' });
  else sent = await tg(env, 'copyMessage', { chat_id: userId, from_chat_id: m.chat.id, message_id: m.message_id });
  await tg(env, 'setMessageReaction', { chat_id: m.chat.id, message_id: m.message_id, reaction: [{ type: 'emoji', emoji: sent ? '👌' : '🤷' }] });
}

const ERR_TEXT: Record<string, string> = {
  PAYMENT_NOT_CONFIRMED: 'Сначала подтвердите оплату',
  CHANGED_MEANWHILE: 'Заказ только что изменили, карточка обновлена',
  ORDER_CLOSED: 'Заказ уже закрыт',
  NOT_COOKING: 'Заказ ещё не готовится',
  NOT_READY: 'Заказ ещё не готов',
};

async function onCallback(env: TgEnv, q: any, baseUrl: string) {
  const answer = (text: string, show_alert = false) => tg(env, 'answerCallbackQuery', { callback_query_id: q.id, text, show_alert });
  const parsed = parseCallback(q.data);
  const chat = staffChat(env);
  if (!parsed || !chat || q.message?.chat?.id !== chat) return void (await answer('Кнопка устарела'));
  const staff = parseStaffList(env.TG_STAFF);
  const name = staff.get(q.from?.id);
  if (!name) return void (await answer('Эти кнопки только для сотрудников из списка.', true));

  const o = await env.DB.prepare('SELECT * FROM orders WHERE id = ? AND location_id = ?').bind(parsed.orderId, env.LOCATION_ID).first<any>();
  if (!o) return void (await answer('Заказ не найден'));
  // Нажатие пришло с другой копии карточки — дальше обновляем именно её.
  if (!o.staff_msg_id && q.message?.message_id) {
    await env.DB.prepare('UPDATE orders SET staff_msg_id = ? WHERE id = ? AND staff_msg_id IS NULL').bind(q.message.message_id, o.id).run();
    o.staff_msg_id = q.message.message_id;
  }

  if (parsed.code === 'cx?' || parsed.code === 'back') {
    const full = await orderWithItems(env.DB, o.id);
    await syncStaffCard(env, { ...full, staff_msg_id: q.message.message_id }, await today(env), undefined, parsed.code === 'cx?');
    return void (await answer(parsed.code === 'cx?' ? 'Точно отменить?' : ''));
  }

  const action = ACTION_CODES[parsed.code] as Action;
  const r = await transition(env.DB, o, action, `staff:${name}`);
  if (!r.ok) {
    await answer(ERR_TEXT[r.error] || 'Не получилось', r.error === 'PAYMENT_NOT_CONFIRMED');
    const full = await orderWithItems(env.DB, o.id);
    if (full) await syncStaffCard(env, { ...full, staff_msg_id: q.message.message_id }, await today(env));
    return;
  }
  if (!r.changed) {
    await answer('Уже сделано');
    return;
  }
  await answer('Готово');
  await notifyOrderEvent(env, o.id, r.event, `staff:${name}`, baseUrl);
}
