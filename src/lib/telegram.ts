// Чистые функции для Telegram: проверка данных Mini App, тексты сообщений, кнопки.
// Сетевые вызовы — в src/bot.ts.
import { tableTitle } from './tables';

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

// ---------- Язык гостя в боте ----------

export type Lang = 'ru' | 'vi' | 'en';
/** Язык из настроек Telegram: вьетнамский → vi, русский и близкие → ru, остальные → en. */
export function botLang(code: string | null | undefined): Lang {
  const c = (code || '').toLowerCase().slice(0, 2);
  if (c === 'vi') return 'vi';
  if (['ru', 'uk', 'be', 'kk'].includes(c) || !c) return 'ru';
  return 'en';
}
export const asLang = (v: unknown): Lang => (v === 'vi' || v === 'en' ? v : 'ru');

const TYPE_L: Record<Lang, Record<string, string>> = {
  ru: TYPE,
  vi: { pickup: 'Tự đến lấy', visit: 'Đặt trước khi đến', delivery: 'Giao hàng', table: 'Tại bàn' },
  en: { pickup: 'Pickup', visit: 'For your visit', delivery: 'Delivery', table: 'At the table' },
};
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function slotText(slot: string | null, today?: string, lang: Lang = 'ru'): string {
  if (!slot) return lang === 'vi' ? 'ngay bây giờ' : lang === 'en' ? 'now' : 'сейчас';
  const [day, time] = slot.split(' ');
  const [, m, d] = day.split('-').map(Number);
  let prefix = lang === 'vi' ? `ngày ${d}/${m}` : lang === 'en' ? `${d} ${MONTHS_EN[m - 1]}` : `${d} ${MONTHS[m - 1]}`;
  if (today) {
    const diff = Math.round((Date.parse(day) - Date.parse(today)) / 864e5);
    if (diff === 0) prefix = lang === 'vi' ? 'hôm nay' : lang === 'en' ? 'today' : 'сегодня';
    else if (diff === 1) prefix = lang === 'vi' ? 'ngày mai' : lang === 'en' ? 'tomorrow' : 'завтра';
  }
  return lang === 'vi' ? `${time} ${prefix}` : lang === 'en' ? `${prefix} at ${time}` : `${prefix} в ${time}`;
}

/** Короткие тексты бота для гостя на трёх языках. */
export const BOT_TEXT: Record<string, Record<Lang, string>> = {
  openMenu: { ru: 'Открыть меню и заказать', vi: 'Xem thực đơn và đặt món', en: 'Open menu and order' },
  openOrder: { ru: 'Открыть заказ', vi: 'Xem đơn hàng', en: 'Open order' },
  openOrderQr: { ru: 'Открыть заказ и QR', vi: 'Xem đơn hàng và mã QR', en: 'Open order and QR' },
  openOrderN: { ru: 'Открыть заказ №{n}', vi: 'Xem đơn số {n}', en: 'Open order #{n}' },
  linked: { ru: 'Готово! Статус заказа №{n} будем присылать сюда.', vi: 'Xong! Chúng tôi sẽ gửi trạng thái đơn số {n} vào đây.', en: 'Done! We will send updates on order #{n} here.' },
  noOrders: { ru: 'Заказов пока нет.', vi: 'Bạn chưa có đơn hàng nào.', en: 'No orders yet.' },
  myOrders: { ru: 'Ваши последние заказы:', vi: 'Các đơn hàng gần đây của bạn:', en: 'Your recent orders:' },
  noStaff: { ru: 'Спасибо! Сейчас ответить здесь не можем, позвоните нам, пожалуйста.', vi: 'Cảm ơn bạn! Hiện chúng tôi chưa thể trả lời tại đây, vui lòng gọi điện cho nhà hàng.', en: 'Thank you! We cannot reply here right now, please give us a call.' },
  relayed: { ru: 'Передали администратору. Ответ придёт сюда.', vi: 'Đã chuyển cho quản lý. Câu trả lời sẽ được gửi vào đây.', en: 'Sent to the manager. The reply will come here.' },
  adminPrefix: { ru: 'Администратор VIBE:', vi: 'Quản lý VIBE:', en: 'VIBE manager:' },
};
export const bt = (key: string, lang: Lang, vars: Record<string, string | number> = {}) =>
  (BOT_TEXT[key]?.[lang] ?? BOT_TEXT[key]?.ru ?? key).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));

export interface OrderForText {
  id: number;
  type: string;
  slot: string | null;
  status: string;
  table_id?: string | null;
  table_zone?: string | null;
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
const CHANNEL: Record<string, string> = { telegram: 'Telegram', site: 'Сайт', table: 'QR на столе' };

/** «В зале, стол 3» для заказа со стола. */
export function orderTableTitle(o: { table_id?: string | null; table_zone?: string | null }): string {
  return tableTitle({ id: String(o.table_id ?? '?'), zone: o.table_zone || 'hall' });
}

export function staffOrderText(o: OrderForText, today?: string, lastActor?: string): string {
  const isTable = o.type === 'table';
  const head = o.status === 'cancelled' ? `<s>Заказ №${o.id}</s> · отменён` : `<b>Заказ №${o.id}</b> · ${CHANNEL[o.channel] || o.channel}`;
  const items = o.items
    .map((i) => `${escHtml(i.name)}${i.options.length ? ` (${escHtml(i.options.map((x) => x.name).join(', '))})` : ''} ×${i.qty}`)
    .join('\n');
  return [
    head,
    isTable ? `🍽 <b>${escHtml(orderTableTitle(o))}</b>` : `${TYPE[o.type] || o.type} · ${slotText(o.slot, today)}`,
    items,
    `<b>${fmtVnd(o.total)}</b> · ${isTable ? 'по счёту в конце' : 'QR'}`,
    isTable ? '' : `${escHtml(o.guest_name)} · ${escHtml(o.guest_phone)}`,
    o.comment ? `«${escHtml(o.comment)}»` : '',
    '',
    isTable ? '' : `Оплата: ${PAY_LINE[o.payment_status] || o.payment_status}`,
    `Кухня: ${isTable && o.status === 'new' ? '⏳ ждёт, когда администратор примет' : isTable && o.status === 'completed' ? '✔️ подан' : KITCHEN_LINE[o.status] || o.status}`,
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
export function staffButtons(o: { id: number; type?: string; status: string; payment_status: string; payment_method: string }, askCancel = false): InlineButton[][] {
  if (o.status === 'completed' || o.status === 'cancelled') return [];
  const b = (text: string, code: string): InlineButton => ({ text, callback_data: `o:${o.id}:${code}` });
  if (askCancel) return [[b('Да, отменить заказ', 'cx'), b('Назад', 'back')]];
  const row: InlineButton[] = [];
  if (o.payment_method === 'qr' && o.payment_status !== 'confirmed') row.push(b('💳 Деньги пришли', 'cp'));
  const table = o.type === 'table';
  if (o.status === 'new' && (o.payment_method !== 'qr' || o.payment_status === 'confirmed')) row.push(b(table ? '✅ Принять' : '👩‍🍳 Готовить', 'sc'));
  if (o.status === 'cooking') row.push(b('🍽 Готово', 'mr'));
  if (o.status === 'ready') row.push(b(table ? '✔️ Подано' : '✔️ Выдан', 'cm'));
  return [row, [b('Отменить', 'cx?')]].filter((r) => r.length);
}

/** Сообщение гостю в бот при смене статуса, на языке заказа. null — ничего не отправляем. */
export function guestEventText(event: string, o: OrderForText, today?: string, lang: Lang = 'ru'): string | null {
  const when = `${TYPE_L[lang][o.type] || ''}, ${slotText(o.slot, today, lang)}`.replace(/^, /, '');
  const sum = fmtVnd(o.total);
  const id = o.id;
  const T: Record<Lang, Record<string, string>> = {
    ru: {
      created: `<b>Заказ №${id} принят</b>\n${when}\nСумма: <b>${sum}</b>\n\nОплатите по QR в окне заказа и нажмите «Я оплатил». Начнём готовить, когда подтвердим оплату.`,
      payment_reported: `⏳ <b>Оплата проверяется</b>\nСпасибо! Вы отметили оплату заказа №${id} на ${sum}.\nАдминистратор сверяет поступление. Мы напишем сюда, как только деньги придут.`,
      payment_confirmed: `✅ <b>Оплата подтверждена</b>\nДеньги поступили, заказ №${id} передаём на кухню.`,
      cooking_started: `👩‍🍳 Заказ №${id} готовим.`,
      ready_visit: `🍽 <b>Заказ №${id} готов</b>\nЖдём вас, стол готов. Назовите номер ${id}.`,
      ready: `🍽 <b>Заказ №${id} готов</b>\nМожно забирать на кассе. Назовите номер ${id}.`,
      completed: `Заказ №${id} выдан. Приятного аппетита!\nБудем рады видеть вас снова, у нас есть детская зона.`,
      cancelled: `Заказ №${id} отменён. Если это ошибка, напишите сюда, мы ответим.`,
    },
    vi: {
      created: `<b>Đã nhận đơn số ${id}</b>\n${when}\nTổng tiền: <b>${sum}</b>\n\nVui lòng thanh toán bằng mã QR trong trang đơn hàng và bấm «Tôi đã thanh toán». Chúng tôi sẽ bắt đầu nấu khi xác nhận thanh toán.`,
      payment_reported: `⏳ <b>Đang kiểm tra thanh toán</b>\nCảm ơn bạn! Bạn đã báo thanh toán đơn số ${id}, số tiền ${sum}.\nQuản lý đang kiểm tra tiền về. Chúng tôi sẽ nhắn vào đây ngay khi nhận được.`,
      payment_confirmed: `✅ <b>Đã xác nhận thanh toán</b>\nĐã nhận tiền, đơn số ${id} được chuyển vào bếp.`,
      cooking_started: `👩‍🍳 Đơn số ${id} đang được nấu.`,
      ready_visit: `🍽 <b>Đơn số ${id} đã sẵn sàng</b>\nBàn của bạn đã sẵn sàng, chúng tôi đang chờ bạn. Hãy đọc số ${id}.`,
      ready: `🍽 <b>Đơn số ${id} đã sẵn sàng</b>\nBạn có thể nhận tại quầy. Hãy đọc số ${id}.`,
      completed: `Đơn số ${id} đã được giao. Chúc bạn ngon miệng!\nRất mong được đón bạn lần sau, chúng tôi có khu vui chơi cho trẻ em.`,
      cancelled: `Đơn số ${id} đã bị hủy. Nếu có nhầm lẫn, hãy nhắn vào đây, chúng tôi sẽ trả lời.`,
    },
    en: {
      created: `<b>Order #${id} received</b>\n${when}\nTotal: <b>${sum}</b>\n\nPay with the QR code on the order page and tap “I have paid”. We start cooking once the payment is confirmed.`,
      payment_reported: `⏳ <b>Checking your payment</b>\nThank you! You reported paying ${sum} for order #${id}.\nThe manager is checking the transfer. We will message you here as soon as it arrives.`,
      payment_confirmed: `✅ <b>Payment confirmed</b>\nWe received the money, order #${id} goes to the kitchen.`,
      cooking_started: `👩‍🍳 We are cooking order #${id}.`,
      ready_visit: `🍽 <b>Order #${id} is ready</b>\nYour table is ready and waiting. Just say number ${id}.`,
      ready: `🍽 <b>Order #${id} is ready</b>\nYou can pick it up at the counter. Just say number ${id}.`,
      completed: `Order #${id} handed over. Enjoy your meal!\nWe hope to see you again, we have a play area for kids.`,
      cancelled: `Order #${id} was cancelled. If this is a mistake, write here and we will reply.`,
    },
  };
  const key = event === 'ready' && o.type === 'visit' ? 'ready_visit' : event;
  return T[lang][key] ?? null;
}

/** Кому из сотрудников сообщить отдельным сообщением (а не только обновить карточку). */
export function staffAlertText(event: string, o: OrderForText): string | null {
  if (event === 'payment_reported') return `⚠️ Гость сообщил об оплате №${o.id} на <b>${fmtVnd(o.total)}</b>. Подтверждайте, только когда увидите деньги в банке.`;
  return null;
}

export const WELCOME_L: Record<Lang, string> = {
  ru:
    'Здравствуйте! Это семейный ресторан VIBE в Нячанге 🌿\n\n' +
    'Здесь можно заказать заранее: забрать самому или к своему приходу.\n\n' +
    'Работаем ежедневно 9:00–22:00.\n25 Nguyễn Đình Chiểu, Bắc Nha Trang\n\n' +
    'Если хотите что-то спросить, просто напишите сюда, ответит администратор.',
  vi:
    'Xin chào! Đây là nhà hàng gia đình VIBE ở Nha Trang 🌿\n\n' +
    'Bạn có thể đặt món trước: tự đến lấy hoặc chuẩn bị sẵn khi bạn đến.\n\n' +
    'Mở cửa hằng ngày 9:00–22:00.\n25 Nguyễn Đình Chiểu, Bắc Nha Trang\n\n' +
    'Nếu bạn có câu hỏi, cứ nhắn vào đây, quản lý sẽ trả lời.',
  en:
    'Hello! This is VIBE, a family restaurant in Nha Trang 🌿\n\n' +
    'Order ahead here: pick it up yourself or have it ready for your visit.\n\n' +
    'Open daily 9:00–22:00.\n25 Nguyễn Đình Chiểu, Bắc Nha Trang\n\n' +
    'If you have a question, just write here and the manager will reply.',
};
export const WELCOME = WELCOME_L.ru;

// ---------- Столы: вызовы и счета ----------

/** Кнопки по вызову со стола и по счёту (callback_data до 64 байт). */
export function parseTableCallback(data: string | undefined): { kind: 'call'; id: number } | { kind: 'bill'; id: number; code: 'pq' | 'pc' | 'all' } | null {
  const c = /^c:(\d{1,9})$/.exec(data || '');
  if (c) return { kind: 'call', id: Number(c[1]) };
  const b = /^b:(\d{1,9}):(pq|pc|all)$/.exec(data || '');
  if (b) return { kind: 'bill', id: Number(b[1]), code: b[2] as 'pq' | 'pc' | 'all' };
  return null;
}

export const BILL_CODES = { pq: 'paid_qr', pc: 'paid_cash', all: 'merge_all' } as const;

export function waiterCallText(title: string, doneBy?: string | null): string {
  return doneBy ? `🔔 <s>${escHtml(title)}: зовут официанта</s>\n<i>Идёт ${escHtml(doneBy)}</i>` : `🔔 <b>${escHtml(title)}: зовут официанта</b>`;
}

export interface BillForText {
  id: number;
  status: string;
  payment_status: string;
  payment_method?: string | null;
  total: number;
  shared?: boolean;
}

/** Сообщение «просит счёт» в группе сотрудников; обновляется при оплате. */
export function billText(title: string, b: BillForText, lastActor?: string): string {
  const head =
    b.status === 'paid'
      ? `✅ <b>${escHtml(title)}: счёт №${b.id} оплачен</b> · ${b.payment_method === 'cash' ? 'наличными' : 'по QR'}`
      : `🧾 <b>${escHtml(title)}: просят счёт №${b.id}</b>${b.shared ? ' · весь стол' : ''}`;
  const pay =
    b.status !== 'paid' && b.payment_status === 'reported'
      ? '⚠️ гость сообщил об оплате по QR, проверьте поступление'
      : b.status !== 'paid'
        ? 'Оплата по QR или наличными.'
        : '';
  return [head, `Сумма: <b>${fmtVnd(b.total)}</b>`, pay, lastActor ? `<i>${escHtml(lastActor)}</i>` : ''].filter(Boolean).join('\n');
}

export function billButtons(b: { id: number; status: string }, canMerge: boolean): InlineButton[][] {
  if (b.status !== 'open') return [];
  const rows: InlineButton[][] = [
    [
      { text: '💳 Деньги пришли (QR)', callback_data: `b:${b.id}:pq` },
      { text: '💵 Наличными', callback_data: `b:${b.id}:pc` },
    ],
  ];
  if (canMerge) rows.push([{ text: 'Весь стол одним счётом', callback_data: `b:${b.id}:all` }]);
  return rows;
}
