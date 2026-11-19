// Быстрые кнопки в чате бота: «Блюдо дня», «Быстрый заказ», «Повторить прошлый заказ».
// Здесь только чистые функции (корзина, кнопки, тексты) — их проверяют модульные тесты.
// Цены и наличие при оформлении всё равно проверяет общая логика заказа на сервере (priceCart + createOrder).
import { MAX_LINES, MAX_QTY, pickName, type MenuIndex, type Option, type OptionGroup } from './pricing';
import { fmtVnd, escHtml, slotText, type InlineButton, type Lang } from './telegram';
import type { SlotInfo } from './time';

export const QUICK_MAX = 7;
export const QUICK_RECOMMENDED = 5;
export const SLOTS_PER_PAGE = 8;

export interface BotCartItem {
  dishId: string;
  qty: number;
  optionIds: string[];
}

const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
export const isMenuId = (v: unknown): v is string => typeof v === 'string' && ID_RE.test(v);

// ---------- Корзина ----------

const keyOf = (i: { dishId: string; optionIds: string[] }) => `${i.dishId}|${[...i.optionIds].sort().join(',')}`;

/** Добавить одну порцию. Такое же блюдо с теми же опциями — +1 к количеству. Последней становится изменённая строка. */
export function addToCart(items: BotCartItem[], dishId: string, optionIds: string[] = []): BotCartItem[] {
  const k = keyOf({ dishId, optionIds });
  const same = items.find((i) => keyOf(i) === k);
  if (same) {
    if (same.qty >= MAX_QTY) return items;
    return [...items.filter((i) => i !== same), { ...same, qty: same.qty + 1 }];
  }
  if (items.length >= MAX_LINES) return items;
  return [...items, { dishId, qty: 1, optionIds: [...optionIds] }];
}

/** «Убрать последнее»: минус одна порция у последней добавленной строки. */
export function undoLast(items: BotCartItem[]): BotCartItem[] {
  if (!items.length) return items;
  const last = items[items.length - 1];
  return last.qty > 1 ? [...items.slice(0, -1), { ...last, qty: last.qty - 1 }] : items.slice(0, -1);
}

export function parseCart(s: string | null | undefined): BotCartItem[] {
  try {
    const v = JSON.parse(s || '[]');
    if (!Array.isArray(v)) return [];
    return v
      .filter((i) => i && isMenuId(i.dishId) && Number.isInteger(i.qty) && i.qty > 0)
      .map((i) => ({ dishId: i.dishId, qty: Math.min(MAX_QTY, i.qty), optionIds: Array.isArray(i.optionIds) ? i.optionIds.filter(isMenuId) : [] }))
      .slice(0, MAX_LINES);
  } catch {
    return [];
  }
}

/** Сколько порций блюда уже в корзине (для отметки ✓N на кнопке). */
export const qtyOf = (items: BotCartItem[], dishId: string) => items.filter((i) => i.dishId === dishId).reduce((s, i) => s + i.qty, 0);

/** Предварительная сумма по текущему меню (окончательную считает сервер при оформлении). */
export function unitPrice(menu: MenuIndex, i: BotCartItem): number {
  const d = menu.dishes.get(i.dishId);
  if (!d) return 0;
  return d.price + i.optionIds.reduce((s, id) => s + (menu.options.get(id)?.price_delta ?? 0), 0);
}
export const cartTotal = (menu: MenuIndex, items: BotCartItem[]) => items.reduce((s, i) => s + unitPrice(menu, i) * i.qty, 0);

/** Корзина для окна меню: «dish*2*opt1.opt2,dish2*1». Окно меню само проверит, что блюда ещё есть. */
export function cartParam(items: BotCartItem[]): string {
  return items.map((i) => [i.dishId, i.qty, i.optionIds.join('.')].join('*').replace(/\*$/, '')).join(',');
}

/** Следующая обязательная группа опций, в которой гость ещё не выбрал нужное количество. */
export function nextRequiredGroup(groups: OptionGroup[], chosen: string[], options: Map<string, Option>): OptionGroup | null {
  for (const g of groups) {
    if (g.min_select < 1) continue;
    const n = chosen.filter((id) => options.get(id)?.group_id === g.id).length;
    if (n < g.min_select) return g;
  }
  return null;
}

// ---------- Повтор прошлого заказа ----------

export interface PastItem {
  dish_id: string;
  name: string;
  qty: number;
  unit_price: number;
  options: { id?: string; name: string }[];
}

export type RepeatNote =
  | { kind: 'gone'; name: string; qty: number; why: 'sold_out' | 'unavailable' | 'changed' | 'alcohol' }
  | { kind: 'price'; name: string; was: number; now: number };

/** Собрать корзину из прошлого заказа по сегодняшнему меню. Что нельзя заказать — в заметки, с причиной. */
export function repeatCart(past: PastItem[], menu: MenuIndex, soldOut: Set<string>, lang: string): { items: BotCartItem[]; notes: RepeatNote[] } {
  let items: BotCartItem[] = [];
  const notes: RepeatNote[] = [];
  for (const p of past) {
    const d = menu.dishes.get(p.dish_id);
    const name = d ? pickName(d.name, lang) : p.name;
    if (!d || !d.active) {
      notes.push({ kind: 'gone', name, qty: p.qty, why: 'unavailable' });
      continue;
    }
    if (soldOut.has(d.id)) {
      notes.push({ kind: 'gone', name, qty: p.qty, why: 'sold_out' });
      continue;
    }
    const optionIds = p.options.map((o) => o.id).filter(isMenuId);
    const groups = menu.groupsByDish.get(d.id) ?? [];
    const valid =
      optionIds.length === p.options.length &&
      optionIds.every((id) => {
        const o = menu.options.get(id);
        return !!o && o.active && groups.some((g) => g.id === o.group_id);
      }) &&
      !nextRequiredGroup(groups, optionIds, menu.options);
    if (!valid) {
      notes.push({ kind: 'gone', name, qty: p.qty, why: 'changed' });
      continue;
    }
    const line: BotCartItem = { dishId: d.id, qty: Math.min(MAX_QTY, p.qty), optionIds };
    const now = unitPrice(menu, line);
    if (now !== p.unit_price) notes.push({ kind: 'price', name, was: p.unit_price, now });
    for (let k = 0; k < line.qty; k++) items = addToCart(items, line.dishId, line.optionIds);
  }
  return { items, notes };
}

// ---------- Кнопки ----------

/**
 * callback_data быстрых кнопок (лимит Telegram 64 байта). Действия «из чата» (новое сообщение) и «внутри корзины» (правка того же сообщения).
 *  q:day — блюдо дня · q:new — быстрый заказ новым сообщением · q:rep — повторить · q:da:<блюдо> — добавить блюдо дня
 *  q:l — список · q:a:<блюдо> — добавить · q:o:<опция> — выбрать опцию · q:undo · q:clr · q:go — оформить
 *  q:t:p|v — самовывоз / к визиту · q:dy — все дни · q:d:<YYYY-MM-DD> — день · q:sp:<страница> · q:s:<HHMM> — время · q:ok — подтвердить
 */
export type QuickCb =
  | { k: 'day' | 'new' | 'rep' | 'l' | 'undo' | 'clr' | 'go' | 'dy' | 'ok' }
  | { k: 'da' | 'a' | 'o'; id: string }
  | { k: 't'; type: 'pickup' | 'visit' }
  | { k: 'd'; day: string }
  | { k: 'sp'; page: number }
  | { k: 's'; time: string };

export function parseQuickCallback(data: string | undefined): QuickCb | null {
  const s = data || '';
  let m = /^q:(day|new|rep|l|undo|clr|go|dy|ok)$/.exec(s);
  if (m) return { k: m[1] as any };
  m = /^q:(da|a|o):([A-Za-z0-9_-]{1,40})$/.exec(s);
  if (m) return { k: m[1] as 'da' | 'a' | 'o', id: m[2] };
  m = /^q:t:(p|v)$/.exec(s);
  if (m) return { k: 't', type: m[1] === 'v' ? 'visit' : 'pickup' };
  m = /^q:d:(\d{4}-\d{2}-\d{2})$/.exec(s);
  if (m) return { k: 'd', day: m[1] };
  m = /^q:sp:(\d{1,2})$/.exec(s);
  if (m) return { k: 'sp', page: Number(m[1]) };
  m = /^q:s:(\d{2})(\d{2})$/.exec(s);
  if (m) return { k: 's', time: `${m[1]}:${m[2]}` };
  return null;
}

const cb = (text: string, data: string): InlineButton => ({ text, callback_data: data });
/** Цена на кнопке без знака валюты, чтобы название поместилось: «Борщ · 139 000». */
const shortPrice = (v: number) => fmtVnd(v).replace(' ₫', '');

// ---------- Тексты на трёх языках ----------

type T = Record<string, string>;
export const QT: Record<Lang, T> = {
  ru: {
    btnDay: '⭐ Хит продаж', btnQuick: '⚡ Быстрый заказ', btnRepeat: '🔁 Повторить прошлый заказ',
    kbHint: '👇 Хит продаж, быстрый заказ и повтор прошлого заказа — на кнопках внизу. Если они скрылись, нажмите значок ⌨ рядом с полем ввода.',
    dayTitle: 'Хит продаж', dayAdd: '➕ Добавить в заказ', dayMore: '⚡ Ещё из быстрого заказа', chef: 'шеф',
    dayNone: 'Хит продаж пока не выбран. Загляните в быстрый заказ или в меню.',
    daySold: 'Хит продаж сегодня закончился. Загляните в быстрый заказ или в меню.',
    quickTitle: 'Быстрый заказ', quickHint: 'Нажмите на блюдо, чтобы добавить. Повторное нажатие добавит ещё одну порцию.',
    quickEmpty: 'Быстрый заказ пока не настроен. Всё меню открывается кнопкой ниже.',
    inCart: '🧺 В заказе', total: 'Итого', undo: '➖ Убрать последнее', clear: '🗑 Очистить', checkout: 'Оформить · {sum}',
    openMenu: '🍽 Открыть меню', editInMenu: '✏️ Изменить в меню', back: '← Назад', toCart: '← К заказу',
    added: 'Добавили: {name}', removed: 'Убрали', cleared: 'Корзина пуста', soldNow: '{name} сейчас нет в наличии', empty: 'В заказе пока ничего нет',
    chooseOpt: '{dish}: {group}',
    howGet: 'Как вы получите заказ?', pickup: '🥡 Самовывоз', visit: '🍽 К визиту', delivery: '🛵 Доставка (в меню)',
    alcoholOnlyVisit: 'В заказе есть алкоголь, его можно заказать только к визиту.',
    whenPickup: 'Когда забрать?', whenVisit: 'К какому времени подать?', nearest: 'Ближайшее время: <b>{t}</b>.',
    today: 'Сегодня', tomorrow: 'Завтра', otherDay: 'Другой день', more: 'ещё ›', earlier: '‹ раньше', chooseDay: 'Выберите день:',
    noSlots: 'На этот день свободного времени уже нет. Выберите другой день.',
    askPhone: 'Оставьте, пожалуйста, номер телефона: администратор позвонит, если что-то изменится в заказе.\nНажмите кнопку ниже или напишите номер сообщением.',
    sendPhone: '📱 Отправить номер', phoneSaved: 'Спасибо, номер сохранили.',
    check: 'Проверьте заказ', confirm: '✅ Подтвердить заказ', otherTime: '← Другое время',
    placed: '✅ Заказ №{n} оформлен. Ниже карточка заказа: там оплата и статус.', already: 'Заказ №{n} уже оформлен',
    repeatTitle: 'Ваш заказ №{n} от {date}', repeatNone: 'Прошлых заказов пока нет. Загляните в быстрый заказ или в меню.',
    repeatNow: 'Итого сейчас', addQuick: '⚡ Добавить из быстрого', inMenu: '✏️ В меню', repeatNothing: 'Сегодня ни одно блюдо из этого заказа заказать не получится.',
    gone_sold_out: 'сегодня закончилось', gone_unavailable: 'больше нет в меню', gone_changed: 'изменился состав, выберите в меню', gone_alcohol: 'только к визиту',
    priceChanged: 'Цена изменилась: {name} — было {was}, сейчас {now}',
    err_DISH_SOLD_OUT: '{name} только что закончилось. Уберите блюдо из заказа.',
    err_DISH_UNAVAILABLE: 'Одного из блюд больше нет в меню. Уберите его из заказа.',
    err_SLOT_FULL: 'Это время только что заняли. Выберите другое.',
    err_SLOT_TOO_SOON: 'На это время уже не успеваем. Выберите время попозже.',
    err_ALCOHOL_NOT_ALLOWED: 'Алкоголь можно заказать только к визиту.',
    err_NOT_ACCEPTING: 'Сейчас ресторан не принимает предзаказы. Напишите нам сюда, мы ответим.',
    err_OTHER: 'Не получилось оформить заказ. Попробуйте ещё раз или откройте меню.',
  },
  vi: {
    btnDay: '⭐ Món bán chạy', btnQuick: '⚡ Đặt nhanh', btnRepeat: '🔁 Đặt lại đơn trước',
    kbHint: '👇 Món bán chạy, đặt nhanh và đặt lại đơn trước — ở các nút bên dưới. Nếu nút bị ẩn, hãy bấm biểu tượng ⌨ cạnh ô nhập tin.',
    dayTitle: 'Món bán chạy', dayAdd: '➕ Thêm vào đơn', dayMore: '⚡ Thêm món đặt nhanh', chef: 'bếp trưởng',
    dayNone: 'Chưa chọn món bán chạy. Mời bạn xem đặt nhanh hoặc thực đơn.',
    daySold: 'Món bán chạy hôm nay đã hết. Mời bạn xem đặt nhanh hoặc thực đơn.',
    quickTitle: 'Đặt nhanh', quickHint: 'Bấm vào món để thêm. Bấm lần nữa để thêm một phần.',
    quickEmpty: 'Đặt nhanh chưa được thiết lập. Bấm nút bên dưới để xem toàn bộ thực đơn.',
    inCart: '🧺 Trong đơn', total: 'Tổng', undo: '➖ Bớt món cuối', clear: '🗑 Xóa hết', checkout: 'Đặt món · {sum}',
    openMenu: '🍽 Xem thực đơn', editInMenu: '✏️ Sửa trong thực đơn', back: '← Quay lại', toCart: '← Về đơn',
    added: 'Đã thêm: {name}', removed: 'Đã bớt', cleared: 'Đơn trống', soldNow: '{name} hiện đã hết', empty: 'Đơn chưa có món nào',
    chooseOpt: '{dish}: {group}',
    howGet: 'Bạn muốn nhận đơn thế nào?', pickup: '🥡 Tự đến lấy', visit: '🍽 Đặt trước khi đến', delivery: '🛵 Giao hàng (trong thực đơn)',
    alcoholOnlyVisit: 'Đơn có đồ uống có cồn, chỉ đặt được khi đến dùng tại quán.',
    whenPickup: 'Khi nào bạn đến lấy?', whenVisit: 'Phục vụ lúc mấy giờ?', nearest: 'Giờ sớm nhất: <b>{t}</b>.',
    today: 'Hôm nay', tomorrow: 'Ngày mai', otherDay: 'Ngày khác', more: 'thêm ›', earlier: '‹ sớm hơn', chooseDay: 'Chọn ngày:',
    noSlots: 'Ngày này đã hết giờ trống. Vui lòng chọn ngày khác.',
    askPhone: 'Vui lòng để lại số điện thoại: quản lý sẽ gọi nếu đơn có thay đổi.\nBấm nút bên dưới hoặc nhắn số điện thoại.',
    sendPhone: '📱 Gửi số điện thoại', phoneSaved: 'Cảm ơn, đã lưu số điện thoại.',
    check: 'Kiểm tra đơn', confirm: '✅ Xác nhận đặt món', otherTime: '← Giờ khác',
    placed: '✅ Đã đặt đơn số {n}. Thẻ đơn hàng bên dưới có thanh toán và trạng thái.', already: 'Đơn số {n} đã được đặt',
    repeatTitle: 'Đơn số {n} ngày {date}', repeatNone: 'Bạn chưa có đơn nào. Mời bạn xem đặt nhanh hoặc thực đơn.',
    repeatNow: 'Tổng hiện tại', addQuick: '⚡ Thêm từ đặt nhanh', inMenu: '✏️ Thực đơn', repeatNothing: 'Hôm nay không đặt được món nào trong đơn này.',
    gone_sold_out: 'hôm nay đã hết', gone_unavailable: 'không còn trong thực đơn', gone_changed: 'đã thay đổi, chọn trong thực đơn', gone_alcohol: 'chỉ khi đến quán',
    priceChanged: 'Giá đã thay đổi: {name} — trước {was}, nay {now}',
    err_DISH_SOLD_OUT: '{name} vừa hết. Vui lòng bỏ món này khỏi đơn.',
    err_DISH_UNAVAILABLE: 'Một món không còn trong thực đơn. Vui lòng bỏ món đó.',
    err_SLOT_FULL: 'Giờ này vừa kín chỗ. Vui lòng chọn giờ khác.',
    err_SLOT_TOO_SOON: 'Giờ này không kịp chuẩn bị. Vui lòng chọn giờ muộn hơn.',
    err_ALCOHOL_NOT_ALLOWED: 'Đồ uống có cồn chỉ đặt được khi đến quán.',
    err_NOT_ACCEPTING: 'Hiện nhà hàng tạm ngừng nhận đặt trước. Hãy nhắn cho chúng tôi tại đây.',
    err_OTHER: 'Chưa đặt được đơn. Vui lòng thử lại hoặc mở thực đơn.',
  },
  en: {
    btnDay: '⭐ Best seller', btnQuick: '⚡ Quick order', btnRepeat: '🔁 Repeat last order',
    kbHint: '👇 Best seller, quick order and repeat last order are on the buttons below. If they are hidden, tap the ⌨ icon next to the message field.',
    dayTitle: 'Best seller', dayAdd: '➕ Add to order', dayMore: '⚡ More from quick order', chef: 'chef',
    dayNone: 'No best seller picked yet. Have a look at the quick order or the menu.',
    daySold: 'Today’s best seller is sold out. Have a look at the quick order or the menu.',
    quickTitle: 'Quick order', quickHint: 'Tap a dish to add it. Tap again to add one more portion.',
    quickEmpty: 'The quick order is not set up yet. The full menu opens with the button below.',
    inCart: '🧺 In your order', total: 'Total', undo: '➖ Remove last', clear: '🗑 Clear', checkout: 'Checkout · {sum}',
    openMenu: '🍽 Open menu', editInMenu: '✏️ Edit in menu', back: '← Back', toCart: '← Back to order',
    added: 'Added: {name}', removed: 'Removed', cleared: 'Order is empty', soldNow: '{name} is not available now', empty: 'Your order is empty',
    chooseOpt: '{dish}: {group}',
    howGet: 'How will you get your order?', pickup: '🥡 Pickup', visit: '🍽 For my visit', delivery: '🛵 Delivery (in menu)',
    alcoholOnlyVisit: 'Your order has alcohol, it can only be ordered for your visit.',
    whenPickup: 'When will you pick it up?', whenVisit: 'What time should we serve?', nearest: 'Earliest time: <b>{t}</b>.',
    today: 'Today', tomorrow: 'Tomorrow', otherDay: 'Another day', more: 'more ›', earlier: '‹ earlier', chooseDay: 'Choose a day:',
    noSlots: 'No free time left on this day. Please choose another day.',
    askPhone: 'Please leave your phone number so the manager can call if anything changes.\nTap the button below or type the number.',
    sendPhone: '📱 Share phone number', phoneSaved: 'Thank you, number saved.',
    check: 'Check your order', confirm: '✅ Confirm order', otherTime: '← Another time',
    placed: '✅ Order #{n} placed. The order card below has payment and status.', already: 'Order #{n} is already placed',
    repeatTitle: 'Your order #{n} from {date}', repeatNone: 'No past orders yet. Have a look at the quick order or the menu.',
    repeatNow: 'Total now', addQuick: '⚡ Add from quick order', inMenu: '✏️ Menu', repeatNothing: 'None of the dishes from this order can be ordered today.',
    gone_sold_out: 'sold out today', gone_unavailable: 'no longer on the menu', gone_changed: 'changed, choose it in the menu', gone_alcohol: 'only for your visit',
    priceChanged: 'Price changed: {name} — was {was}, now {now}',
    err_DISH_SOLD_OUT: '{name} has just sold out. Please remove it from the order.',
    err_DISH_UNAVAILABLE: 'One of the dishes is no longer on the menu. Please remove it.',
    err_SLOT_FULL: 'This time has just been taken. Please choose another.',
    err_SLOT_TOO_SOON: 'We cannot make it by this time. Please choose a later time.',
    err_ALCOHOL_NOT_ALLOWED: 'Alcohol can only be ordered for your visit.',
    err_NOT_ACCEPTING: 'The restaurant is not taking pre-orders right now. Write to us here and we will reply.',
    err_OTHER: 'Could not place the order. Please try again or open the menu.',
  },
};
export const qt = (lang: Lang, key: string, vars: Record<string, string | number> = {}) =>
  (QT[lang][key] ?? QT.ru[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));

/** Название блюда с выбранными опциями: «Блинчики (с творогом)». */
export function lineName(menu: MenuIndex, i: BotCartItem, lang: string): string {
  const d = menu.dishes.get(i.dishId);
  const n = d ? pickName(d.name, lang) : i.dishId;
  const opts = i.optionIds.map((id) => menu.options.get(id)).filter(Boolean).map((o) => pickName(o!.name, lang));
  return opts.length ? `${n} (${opts.join(', ')})` : n;
}

/** Короткая строка корзины: «Борщ ×1, Сырники ×2». */
export function cartSummary(menu: MenuIndex, items: BotCartItem[], lang: Lang): string {
  return items.map((i) => `${escHtml(lineName(menu, i, lang))} ×${i.qty}`).join(', ');
}

export interface QuickDish {
  id: string;
  name: string;
  price: number;
  isDay: boolean;
}

/** Экран «Быстрый заказ»: одно сообщение, которое бот обновляет при каждом нажатии. */
export function quickScreen(
  lang: Lang,
  dishes: QuickDish[],
  items: BotCartItem[],
  menu: MenuIndex,
  menuButton: InlineButton,
): { text: string; rows: InlineButton[][] } {
  if (!dishes.length && !items.length) return { text: qt(lang, 'quickEmpty'), rows: [[menuButton]] };
  const lines = [`<b>${qt(lang, 'quickTitle')}</b>`, qt(lang, 'quickHint')];
  const sum = cartTotal(menu, items);
  if (items.length) lines.push('', `${qt(lang, 'inCart')}: ${cartSummary(menu, items, lang)}`, `${qt(lang, 'total')} <b>${fmtVnd(sum)}</b>`);
  const rows: InlineButton[][] = dishes.map((d) => {
    const n = qtyOf(items, d.id);
    return [cb(`⭐ ${d.name} · ${shortPrice(d.price)}${n ? ` ✓${n}` : ''}`.slice(0, 64), `q:a:${d.id}`)];
  });
  if (items.length) {
    rows.push([cb(qt(lang, 'undo'), 'q:undo'), cb(qt(lang, 'clear'), 'q:clr')]);
    rows.push([cb(qt(lang, 'checkout', { sum: fmtVnd(sum) }), 'q:go')]);
  }
  rows.push([menuButton]);
  return { text: lines.join('\n'), rows };
}

/** Выбор обязательной опции (начинка, соус…). Платные добавки — только в окне меню. */
export function optionScreen(lang: Lang, dishName: string, group: OptionGroup, options: Option[]): { text: string; rows: InlineButton[][] } {
  const rows = options
    .filter((o) => o.active && o.group_id === group.id)
    .map((o) => [cb(`${pickName(o.name, lang)}${o.price_delta ? ` · +${shortPrice(o.price_delta)}` : ''}`.slice(0, 64), `q:o:${o.id}`)]);
  rows.push([cb(qt(lang, 'back'), 'q:l')]);
  return { text: `<b>${escHtml(qt(lang, 'chooseOpt', { dish: dishName, group: pickName(group.name, lang) }))}</b>`, rows };
}

export function typeScreen(lang: Lang, hasAlcohol: boolean, deliveryButton: InlineButton | null): { text: string; rows: InlineButton[][] } {
  const rows: InlineButton[][] = [hasAlcohol ? [cb(qt(lang, 'visit'), 'q:t:v')] : [cb(qt(lang, 'pickup'), 'q:t:p'), cb(qt(lang, 'visit'), 'q:t:v')]];
  if (deliveryButton && !hasAlcohol) rows.push([deliveryButton]);
  rows.push([cb(qt(lang, 'toCart'), 'q:l')]);
  return { text: [qt(lang, 'howGet'), hasAlcohol ? `<i>${qt(lang, 'alcoholOnlyVisit')}</i>` : ''].filter(Boolean).join('\n'), rows };
}

/** «Сегодня», «Завтра» или «Пн 17.11» на языке гостя. */
export function dayShort(day: string, today: string, lang: Lang): string {
  const diff = Math.round((Date.parse(day) - Date.parse(today)) / 864e5);
  if (diff === 0) return qt(lang, 'today');
  if (diff === 1) return qt(lang, 'tomorrow');
  const [, m, d] = day.split('-').map(Number);
  const wd = new Date(day + 'T00:00:00Z').getUTCDay();
  const W: Record<Lang, string[]> = {
    ru: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
    vi: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'],
    en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  };
  return `${W[lang][wd]} ${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}`;
}

/** Выбор времени: строка дней и свободные интервалы по 8 на страницу. Занятые и слишком ранние не показываем. */
export function timeScreen(
  lang: Lang,
  type: 'pickup' | 'visit',
  day: string,
  days: string[],
  slots: SlotInfo[],
  page: number,
): { text: string; rows: InlineButton[][] } {
  const today = days[0];
  const free = slots.filter((s) => s.state === 'free');
  const dayRow: InlineButton[] = [];
  const firstTwo = days.slice(0, 2);
  for (const d of firstTwo) dayRow.push(cb(`${d === day ? '• ' : ''}${dayShort(d, today, lang)}`, `q:d:${d}`));
  dayRow.push(cb(`${firstTwo.includes(day) ? '' : '• ' + dayShort(day, today, lang) + ' · '}${qt(lang, 'otherDay')}`.slice(0, 64), 'q:dy'));
  const rows: InlineButton[][] = [dayRow];
  const head = qt(lang, type === 'visit' ? 'whenVisit' : 'whenPickup');
  let text: string;
  if (!free.length) text = `${head}\n${qt(lang, 'noSlots')}`;
  else {
    text = `${head} ${qt(lang, 'nearest', { t: `${dayShort(day, today, lang).toLowerCase()} ${free[0].time}` })}`;
    const pages = Math.ceil(free.length / SLOTS_PER_PAGE);
    const p = Math.min(Math.max(0, page), pages - 1);
    const chunk = free.slice(p * SLOTS_PER_PAGE, (p + 1) * SLOTS_PER_PAGE);
    for (let i = 0; i < chunk.length; i += 4) rows.push(chunk.slice(i, i + 4).map((s) => cb(s.time, `q:s:${s.time.replace(':', '')}`)));
    const nav: InlineButton[] = [];
    if (p > 0) nav.push(cb(qt(lang, 'earlier'), `q:sp:${p - 1}`));
    if (p < pages - 1) nav.push(cb(qt(lang, 'more'), `q:sp:${p + 1}`));
    if (nav.length) rows.push(nav);
  }
  rows.push([cb(qt(lang, 'back'), 'q:go')]);
  return { text, rows };
}

export function daysScreen(lang: Lang, days: string[]): { text: string; rows: InlineButton[][] } {
  const rows: InlineButton[][] = [];
  for (let i = 0; i < days.length; i += 4) rows.push(days.slice(i, i + 4).map((d) => cb(dayShort(d, days[0], lang), `q:d:${d}`)));
  rows.push([cb(qt(lang, 'back'), 'q:go')]);
  return { text: qt(lang, 'chooseDay'), rows };
}

/** Проверка перед подтверждением: позиции с ценами сервера, вид, время и итог. */
export function confirmScreen(
  lang: Lang,
  lines: { name: string; qty: number; lineTotal: number }[],
  total: number,
  typeLabel: string,
  slot: string,
  today: string,
  editButton: InlineButton,
): { text: string; rows: InlineButton[][] } {
  const text = [
    `<b>${qt(lang, 'check')}</b>`,
    ...lines.map((l) => `${escHtml(l.name)} ×${l.qty} — ${fmtVnd(l.lineTotal)}`),
    `${typeLabel}, ${slotText(slot, today, lang)}`,
    `${qt(lang, 'total')} <b>${fmtVnd(total)}</b>`,
  ].join('\n');
  return { text, rows: [[cb(qt(lang, 'confirm'), 'q:ok')], [editButton], [cb(qt(lang, 'otherTime'), `q:d:${slot.slice(0, 10)}`)]] };
}

/** Повтор прошлого заказа: что вошло, что нельзя заказать сегодня и почему, изменения цен. */
export function repeatScreen(
  lang: Lang,
  orderId: number,
  date: string,
  items: BotCartItem[],
  notes: RepeatNote[],
  menu: MenuIndex,
  menuButton: InlineButton,
): { text: string; rows: InlineButton[][] } {
  const out = [`<b>${qt(lang, 'repeatTitle', { n: orderId, date })}</b>`];
  for (const i of items) out.push(`${escHtml(lineName(menu, i, lang))} ×${i.qty} — ${fmtVnd(unitPrice(menu, i) * i.qty)}`);
  for (const n of notes) if (n.kind === 'gone') out.push(`<s>${escHtml(n.name)} ×${n.qty}</s> <i>${qt(lang, 'gone_' + n.why)}</i>`);
  const sum = cartTotal(menu, items);
  if (items.length) out.push('', `${qt(lang, 'repeatNow')} <b>${fmtVnd(sum)}</b>`);
  else out.push('', qt(lang, 'repeatNothing'));
  for (const n of notes) if (n.kind === 'price') out.push(`<i>${escHtml(qt(lang, 'priceChanged', { name: n.name, was: fmtVnd(n.was), now: fmtVnd(n.now) }))}</i>`);
  const rows: InlineButton[][] = [];
  if (items.length) rows.push([cb(qt(lang, 'checkout', { sum: fmtVnd(sum) }), 'q:go')]);
  rows.push([cb(qt(lang, 'addQuick'), 'q:l'), { ...menuButton, text: qt(lang, 'inMenu') }]);
  return { text: out.join('\n'), rows };
}

// ---------- Постоянные кнопки внизу чата ----------

/**
 * Кнопки под полем ввода. После нажатия сворачиваются в значок ⌨ рядом с полем ввода
 * и остаются там: гость открывает их одним касанием, ничего не вводя.
 * Бот заново присылает их после каждого заказа, так что они не теряются.
 */
export function quickKeyboard(lang: Lang) {
  return {
    keyboard: [[{ text: qt(lang, 'btnDay') }, { text: qt(lang, 'btnQuick') }], [{ text: qt(lang, 'btnRepeat') }]],
    resize_keyboard: true,
    one_time_keyboard: true,
    is_persistent: false,
  };
}

const LEGACY_DAY = ['⭐ Блюдо дня', '⭐ Món của ngày', '⭐ Dish of the day'];

/** Нажатие кнопки внизу чата приходит обычным текстом — узнаём его на любом из трёх языков. */
export function quickTextKind(text: string): 'day' | 'new' | 'rep' | null {
  const t = text.trim();
  // Старые надписи «⭐ Блюдо дня» остаются на клавиатуре у гостей, пока бот не пришлёт новую.
  if (LEGACY_DAY.includes(t)) return 'day';
  for (const l of ['ru', 'vi', 'en'] as Lang[]) {
    if (t === QT[l].btnDay) return 'day';
    if (t === QT[l].btnQuick) return 'new';
    if (t === QT[l].btnRepeat) return 'rep';
  }
  return null;
}
