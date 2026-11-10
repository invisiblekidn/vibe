// Чистые функции для Telegram: проверка данных Mini App, тексты сообщений, кнопки.
// Сетевые вызовы — в src/bot.ts.

const enc = new TextEncoder();

async function hmacRaw(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc.encode(data));
}
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

export interface TgUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

/**
 * Проверка initData из Mini App (подпись Telegram ботом).
 * Возвращает пользователя или null, если подпись неверна или данные старше maxAgeSec.
 */
export async function verifyInitData(initData: string, botToken: string, nowMs: number, maxAgeSec = 86400): Promise<TgUser | null> {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const check = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = await hmacRaw(enc.encode('WebAppData'), botToken);
  const expected = hex(await hmacRaw(secret, check));
  if (expected.length !== hash.length) return null;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= expected.charCodeAt(i) ^ hash.charCodeAt(i);
  if (diff !== 0) return null;
  const authDate = Number(params.get('auth_date'));
  if (!authDate || nowMs / 1000 - authDate > maxAgeSec) return null;
  try {
    const user = JSON.parse(params.get('user') || 'null') as TgUser | null;
    return user && typeof user.id === 'number' ? user : null;
  } catch {
    return null;
  }
}

/** Подписать initData (для тестов и локальной имитации Telegram). */
export async function signInitData(fields: Record<string, string>, botToken: string): Promise<string> {
  const check = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n');
  const secret = await hmacRaw(enc.encode('WebAppData'), botToken);
  const p = new URLSearchParams(fields);
  p.set('hash', hex(await hmacRaw(secret, check)));
  return p.toString();
}

/** Сотрудники, которым разрешены кнопки в группе: «123456:Аня,987654:Иван». */
export function parseStaffList(v: string | undefined): Map<number, string> {
  const m = new Map<number, string>();
  for (const part of (v || '').split(',')) {
    const [id, ...name] = part.trim().split(':');
    const n = Number(id);
    if (Number.isSafeInteger(n) && n !== 0) m.set(n, name.join(':').trim() || String(n));
  }
  return m;
}

// ---------- Тексты ----------

export const fmtVnd = (v: number) => String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₫';
export const escHtml = (s: unknown) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

const TYPE = { pickup: 'Самовывоз', visit: 'К визиту', delivery: 'Доставка', table: 'В зале' } as Record<string, string>;
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

export function slotText(slot: string, today?: string): string {
  const [day, time] = slot.split(' ');
  const [, m, d] = day.split('-').map(Number);
  let prefix = `${d} ${MONTHS[m - 1]}`;
  if (today) {
    const diff = Math.round((Date.parse(day) - Date.parse(today)) / 864e5);
    if (diff === 0) prefix = 'сегодня';
    else if (diff === 1) prefix = 'завтра';
  }
  return `${prefix} в ${time}`;
}

export interface OrderForText {
  id: number;
  type: string;
  slot: string;
  status: string;
  payment_status: string;
  payment_method: string;
  payment_reported_at?: string | null;
  total: number;
  guest_name: string;
  guest_phone: string;
  comment?: string | null;
  channel: string;
  items: { name: string; qty: number; options: { name: string }[] }[];
}

const PAY_LINE: Record<string, string> = {
  unpaid: '⏳ ждёт оплаты',
  reported: '⚠️ гость сообщил об оплате, проверьте поступление',
  confirmed: '✅ оплата подтверждена',
  refunded: '↩️ возврат',
};
const KITCHEN_LINE: Record<string, string> = {
  new: 'новый',
  cooking: '👩‍🍳 готовится',
  ready: '🍽 готов',
  completed: '✔️ выдан',
  cancelled: '✖️ отменён',
};

/** Сообщение о заказе в группе сотрудников (HTML-разметка Telegram). */
export function staffOrderText(o: OrderForText, today?: string, lastActor?: string): string {
  const head = o.status === 'cancelled' ? `<s>Заказ №${o.id}</s> · отменён` : `<b>Заказ №${o.id}</b> · ${o.channel === 'telegram' ? 'Telegram' : 'Сайт'}`;
  const items = o.items
    .map((i) => `${escHtml(i.name)}${i.options.length ? ` (${escHtml(i.options.map((x) => x.name).join(', '))})` : ''} ×${i.qty}`)
    .join('\n');
  return [
    head,
    `${TYPE[o.type] || o.type} · ${slotText(o.slot, today)}`,
    items,
    `<b>${fmtVnd(o.total)}</b> · QR`,
    `${escHtml(o.guest_name)} · ${escHtml(o.guest_phone)}`,
    o.comment ? `«${escHtml(o.comment)}»` : '',
    '',
    `Оплата: ${PAY_LINE[o.payment_status] || o.payment_status}`,
    `Кухня: ${KITCHEN_LINE[o.status] || o.status}`,
    lastActor ? `<i>${escHtml(lastActor)}</i>` : '',
  ]
    .filter((x, i, a) => x !== '' || (i > 0 && a[i - 1] !== ''))
    .join('\n')
    .trim();
}

export type InlineButton = { text: string; callback_data?: string; url?: string; web_app?: { url: string } };

/** Короткие коды действий в callback_data (лимит Telegram 64 байта). */
export const ACTION_CODES = { cp: 'confirm_payment', sc: 'start_cooking', mr: 'mark_ready', cm: 'complete', cx: 'cancel' } as const;
type Code = keyof typeof ACTION_CODES;

export function parseCallback(data: string | undefined): { orderId: number; code: Code | 'cx?' | 'back' } | null {
  const m = /^o:(\d{1,9}):(cp|sc|mr|cm|cx|cx\?|back)$/.exec(data || '');
  return m ? { orderId: Number(m[1]), code: m[2] as Code } : null;
}

/** Кнопки под сообщением о заказе. Отмена — в два нажатия. */
export function staffButtons(o: { id: number; status: string; payment_status: string; payment_method: string }, askCancel = false): InlineButton[][] {
  if (o.status === 'completed' || o.status === 'cancelled') return [];
  const b = (text: string, code: string): InlineButton => ({ text, callback_data: `o:${o.id}:${code}` });
  if (askCancel) return [[b('Да, отменить заказ', 'cx'), b('Назад', 'back')]];
  const row: InlineButton[] = [];
  if (o.payment_method === 'qr' && o.payment_status !== 'confirmed') row.push(b('💳 Деньги пришли', 'cp'));
  if (o.status === 'new' && (o.payment_method !== 'qr' || o.payment_status === 'confirmed')) row.push(b('👩‍🍳 Готовить', 'sc'));
  if (o.status === 'cooking') row.push(b('🍽 Готово', 'mr'));
  if (o.status === 'ready') row.push(b('✔️ Выдан', 'cm'));
  return [row, [b('Отменить', 'cx?')]].filter((r) => r.length);
}

/** Сообщение гостю в бот при смене статуса. null — ничего не отправляем. */
export function guestEventText(event: string, o: OrderForText, today?: string): string | null {
  const n = `№${o.id}`;
  const when = `${TYPE[o.type] || ''} ${slotText(o.slot, today)}`.trim();
  switch (event) {
    case 'created':
      return `<b>Заказ ${n} принят</b>\n${when}\nСумма: <b>${fmtVnd(o.total)}</b>\n\nОплатите по QR в окне заказа и нажмите «Я оплатил». Начнём готовить, когда подтвердим оплату.`;
    case 'payment_reported':
      return `⏳ <b>Оплата проверяется</b>\nСпасибо! Вы отметили оплату заказа ${n} на ${fmtVnd(o.total)}.\nАдминистратор сверяет поступление. Мы напишем сюда, как только деньги придут.`;
    case 'payment_confirmed':
      return `✅ <b>Оплата подтверждена</b>\nДеньги поступили, заказ ${n} передаём на кухню.`;
    case 'cooking_started':
      return `👩‍🍳 Заказ ${n} готовим.`;
    case 'ready':
      return o.type === 'visit'
        ? `🍽 <b>Заказ ${n} готов</b>\nЖдём вас, стол готов. Назовите номер ${o.id}.`
        : `🍽 <b>Заказ ${n} готов</b>\nМожно забирать на кассе. Назовите номер ${o.id}.`;
    case 'completed':
      return `Заказ ${n} выдан. Приятного аппетита!\nБудем рады видеть вас снова, у нас есть детская зона.`;
    case 'cancelled':
      return `Заказ ${n} отменён. Если это ошибка, напишите сюда, мы ответим.`;
    default:
      return null;
  }
}

/** Кому из сотрудников сообщить отдельным сообщением (а не только обновить карточку). */
export function staffAlertText(event: string, o: OrderForText): string | null {
  if (event === 'payment_reported') return `⚠️ Гость сообщил об оплате №${o.id} на <b>${fmtVnd(o.total)}</b>. Подтверждайте, только когда увидите деньги в банке.`;
  return null;
}

export const WELCOME =
  'Здравствуйте! Это семейный ресторан VIBE в Нячанге 🌿\n\n' +
  'Здесь можно заказать заранее: забрать самому или к своему приходу.\n\n' +
  'Работаем ежедневно 9:00–22:00.\n25 Nguyễn Đình Chiểu, Bắc Nha Trang\n\n' +
  'Если хотите что-то спросить, просто напишите сюда, ответит администратор.';
