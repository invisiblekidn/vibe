// Проверка быстрых кнопок в чате бота на имитации Telegram (без настоящего бота и сети):
//   1) .dev.vars как для tg-smoke.mjs (TG_* и TG_API_BASE=http://localhost:8788), STAFF_PIN
//   2) npm run db:migrate:local && npm run db:seed:local && npm run dev
//   3) node scripts/quick-smoke.mjs
// Проверяет: вкладку «Бот» в панели, блюдо дня, быстрый заказ с обязательным выбором, время, номер телефона,
// оформление без дублей, стоп-лист, алкоголь только к визиту, повтор прошлого заказа.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const BASE = process.argv[2] || 'http://localhost:8787';
const vars = Object.fromEntries(readFileSync('.dev.vars', 'utf8').split('\n').map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
const SECRET = vars.TG_WEBHOOK_SECRET;
const GROUP = Number(vars.TG_STAFF_CHAT_ID);
const sql = (q) => execFileSync('npx', ['wrangler', 'd1', 'execute', 'vibe-db', '--local', '--command', q], { stdio: 'pipe' });

// ---- имитация Bot API ----
const calls = [];
let msgId = 5000;
const fake = http.createServer((req, res) => {
  let b = '';
  req.on('data', (c) => (b += c));
  req.on('end', () => {
    const method = req.url.split('/').pop();
    const body = JSON.parse(b || '{}');
    // Виджеты нашему боту не разрешены — как в настоящем Telegram, бот переходит на текстовую карточку.
    if (method === 'sendWidget') {
      calls.push({ method, body, result: null });
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ ok: false, description: 'Bad Request: INPUT_MEDIA_WIDGET_NOT_ALLOWED' }));
    }
    const result = ['answerCallbackQuery', 'setMessageReaction'].includes(method) ? true : { message_id: method.startsWith('edit') ? body.message_id : ++msgId };
    calls.push({ method, body, result });
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: true, result }));
  });
});
await new Promise((r) => fake.listen(8788, r));

let fails = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const settle = async () => { let n = -1; while (n !== calls.length) { n = calls.length; await wait(400); } };
const since = (i) => calls.slice(i);
let uid = Math.floor(Date.now() / 1000) * 10;
const GUEST = 900000 + (uid % 100000);
const hook = (update) => fetch(BASE + '/tg/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': SECRET }, body: JSON.stringify(update) });
const from = { id: GUEST, first_name: 'Мария', language_code: 'ru' };
const say = (text, extra = {}) => ({ update_id: ++uid, message: { message_id: uid, from, chat: { id: GUEST, type: 'private' }, date: 0, text, ...extra } });
const press = (data, message_id, photo) => ({ update_id: ++uid, callback_query: { id: 'cb' + uid, from, data, message: { message_id, chat: { id: GUEST, type: 'private' }, ...(photo ? { photo: [{}] } : {}) } } });
const buttons = (c) => (c?.body.reply_markup?.inline_keyboard || []).flat();
const datas = (c) => buttons(c).map((b) => b.callback_data).filter(Boolean);
const toGuest = (list, m) => list.filter((c) => c.method === m && c.body.chat_id === GUEST);
const lastScreen = (list) => list.filter((c) => (c.method === 'sendMessage' || c.method === 'editMessageText') && c.body.chat_id === GUEST && c.body.reply_markup?.inline_keyboard).at(-1);
const toast = (list) => list.filter((c) => c.method === 'answerCallbackQuery').map((c) => c.body.text).join(' | ');
async function tap(data, message_id, photo) {
  const i = calls.length;
  await hook(press(data, message_id, photo));
  await settle();
  return since(i);
}

// Панель сотрудника
let cookie = '';
const staff = async (path, method = 'GET', body) => {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  return { status: r.status, data: await r.json().catch(() => null) };
};

try {
  sql(`DELETE FROM stop_list; DELETE FROM bot_picks; DELETE FROM bot_carts WHERE user_id = ${GUEST};`);

  // ---- 1. Вкладка «Бот» в панели ----
  ok((await staff('/api/staff/bot')).status === 401, 'без входа вкладка «Бот» закрыта');
  await staff('/api/staff/login', 'POST', { name: 'Шеф Минь', pin: vars.STAFF_PIN });
  ok((await staff('/api/staff/bot', 'PUT', { day: null, quick: ['borsch', 'pelmeni', 'syrniki', 'shakshuka', 'caesar-chicken', 'kiev', 'carbonara', 'olivier'] })).data?.error === 'TOO_MANY', 'больше 7 позиций сохранить нельзя');
  ok((await staff('/api/staff/bot', 'PUT', { day: { dishId: 'no-such-dish' }, quick: [] })).data?.error === 'DISH_UNAVAILABLE', 'блюдо не из меню сохранить нельзя');
  let i = calls.length;
  const saved = await staff('/api/staff/bot', 'PUT', {
    day: { dishId: 'borsch', note: { ru: 'Варим с утра на говяжьей косточке', vi: '', en: '' } },
    quick: ['borsch', 'syrniki', 'pelmeni', 'caesar-chicken', 'shakshuka', 'shot-tequila'],
  });
  await settle();
  ok(saved.status === 200 && saved.data.changes.length === 2, 'шеф сохранил блюдо дня и 6 позиций быстрого заказа');
  const groupNote = since(i).find((c) => c.method === 'sendMessage' && c.body.chat_id === GROUP);
  ok(!!groupNote && groupNote.body.text.includes('Шеф Минь') && groupNote.body.text.includes('Борщ'), 'в группе сотрудников: кто поменял и какое блюдо дня');
  const view = (await staff('/api/staff/bot')).data;
  ok(view.day.dishId === 'borsch' && view.quick.length === 6 && view.log[0].actor === 'Шеф Минь', 'панель показывает выбор и журнал с именем');
  ok(view.dishes.find((d) => d.id === 'syrniki').choice === true, 'панель отмечает блюда с обязательным выбором');

  // ---- 2. Приветствие ----
  i = calls.length;
  await hook(say('/start'));
  await settle();
  const greet = toGuest(since(i), 'sendMessage')[0];
  ok(datas(greet).includes('q:day') && datas(greet).includes('q:new') && !datas(greet).includes('q:rep'), '«Старт»: кнопки «Блюдо дня» и «Быстрый заказ», «Повторить» скрыта без прошлых заказов');
  ok(!!buttons(greet)[0].web_app, 'первая кнопка по-прежнему открывает окно меню');

  // ---- 3. Блюдо дня ----
  i = calls.length;
  await hook(say('/day'));
  await settle();
  const day = toGuest(since(i), 'sendPhoto')[0];
  ok(!!day && day.body.caption.includes('Борщ с говядиной') && day.body.caption.includes('129 000 ₫') && day.body.caption.includes('Варим с утра'), 'блюдо дня: фото, название, цена из меню и комментарий шефа');
  let r = await tap('q:da:borsch', day.result.message_id, true);
  let screen = lastScreen(r);
  ok(screen?.method === 'sendMessage' && buttons(screen)[0].text === '⭐ Борщ с говядиной · 129 000 ✓1', '«Добавить в заказ» → новое сообщение с корзиной, борщ ✓1');
  ok(toast(r).includes('Добавили'), 'всплывающая подсказка «Добавили»');
  const cartMsg = screen.result.message_id;

  // ---- 4. Быстрый заказ: обязательный выбор соуса ----
  r = await tap('q:a:syrniki', cartMsg);
  screen = lastScreen(r);
  ok(screen?.method === 'editMessageText' && screen.body.message_id === cartMsg && datas(screen).includes('q:o:sy-cond'), 'сырники: бот спрашивает соус в том же сообщении');
  r = await tap('q:o:sy-cond', cartMsg);
  screen = lastScreen(r);
  r = await tap('q:a:syrniki', cartMsg);
  r = await tap('q:o:sy-cond', cartMsg);
  screen = lastScreen(r);
  ok(screen.body.text.includes('Мамины сырники (Сгущённое молоко) ×2') && screen.body.text.includes('367 000 ₫'), 'корзина: Борщ ×1, Сырники ×2, итого 367 000 ₫');
  ok(datas(screen).includes('q:go') && decodeURIComponent(buttons(screen).at(-1).web_app?.url || '').includes('cart=borsch*1,syrniki*2*sy-cond'), 'есть «Оформить», кнопка меню переносит корзину в окно меню');

  // ---- 5. Как получить и когда ----
  r = await tap('q:go', cartMsg);
  screen = lastScreen(r);
  ok(datas(screen).join() === 'q:t:p,q:t:v,q:l', 'выбор: самовывоз или к визиту (доставка пока выключена)');
  r = await tap('q:t:p', cartMsg);
  screen = lastScreen(r);
  const slotBtn = buttons(screen).find((b) => /^q:s:\d{4}$/.test(b.callback_data || ''));
  ok(!!slotBtn && /Ближайшее время/.test(screen.body.text), 'выбор времени: ближайшее время и свободные интервалы');
  r = await tap('q:dy', cartMsg);
  ok(datas(lastScreen(r)).filter((d) => d.startsWith('q:d:')).length === 8, '«Другой день»: 8 дней (сегодня + 7 вперёд)');
  r = await tap(datas(lastScreen(r)).find((d) => d.startsWith('q:d:')), cartMsg);
  screen = lastScreen(r);
  const slot = buttons(screen).find((b) => /^q:s:\d{4}$/.test(b.callback_data || ''));
  r = await tap(slot.callback_data, cartMsg);
  const ask = toGuest(r, 'sendMessage').find((c) => c.body.reply_markup?.keyboard);
  ok(!!ask && ask.body.reply_markup.keyboard[0][0].request_contact === true, 'номера нет — бот просит его кнопкой «Отправить номер»');

  i = calls.length;
  await hook(say(undefined, { text: undefined, contact: { phone_number: '84901234567', user_id: GUEST, first_name: 'Мария' } }));
  await settle();
  const afterPhone = since(i);
  ok(toGuest(afterPhone, 'sendMessage').some((c) => c.body.reply_markup?.remove_keyboard), 'номер сохранён, клавиатура убрана');
  ok(!afterPhone.some((c) => c.body.chat_id === GROUP), 'номер не ушёл администратору как переписка');
  const confirm = lastScreen(afterPhone);
  ok(confirm.body.text.includes('Проверьте заказ') && confirm.body.text.includes('Мамины сырники (Сгущённое молоко) ×2 — 238 000 ₫') && datas(confirm)[0] === 'q:ok', 'проверка заказа: позиции с ценами сервера и «Подтвердить»');

  // ---- 6. Подтверждение: двойное нажатие и повторная доставка события ----
  const before = Number(JSON.parse(sql(`SELECT COUNT(*) AS n FROM orders WHERE tg_user_id = ${GUEST}`).toString().replace(/^[^[]*/, ''))[0].results[0].n);
  i = calls.length;
  const okUpd = press('q:ok', confirm.result.message_id);
  await Promise.all([hook(okUpd), hook(press('q:ok', confirm.result.message_id)), hook(okUpd)]);
  await settle();
  const placed = since(i);
  const after = JSON.parse(sql(`SELECT id, source, guest_phone, channel, total FROM orders WHERE tg_user_id = ${GUEST} ORDER BY id DESC`).toString().replace(/^[^[]*/, ''))[0].results;
  ok(after.length === before + 1, 'три нажатия «Подтвердить» (одно — повтор события) → один заказ');
  const o = after[0];
  ok(o.source === 'chat' && o.channel === 'telegram' && o.guest_phone === '+84901234567' && o.total === 367000, `заказ №${o.id}: из чата бота, номер гостя, 367 000 ₫`);
  // Карточка заказа (TG_GUEST_WIDGET=all) или прежнее сообщение «Заказ принят» (off) — в обоих случаях одна.
  const cards = toGuest(placed, 'sendMessage').filter((c) => c.body.text?.includes(`${o.id}`) && (datas(c).includes(`gp:${o.id}`) || buttons(c).some((b) => b.web_app?.url.includes('/order?'))));
  ok(cards.length === 1, 'гость получил одну карточку заказа (оплата по QR и «Я оплатил»)');
  const staffCard = placed.find((c) => c.method === 'sendMessage' && c.body.chat_id === GROUP && c.body.text.includes(`Заказ №${o.id}`));
  ok(!!staffCard && staffCard.body.text.includes('⚡ из чата бота') && datas(staffCard).includes(`o:${o.id}:cp`), 'в группе сотрудников: карточка заказа с пометкой «из чата бота» и «Деньги пришли»');
  ok(toast(placed).includes(`№${o.id} уже оформлен`), 'лишнее нажатие: «Заказ уже оформлен»');

  // «Я оплатил» → только «оплата проверяется», кухня ждёт
  if (datas(cards[0]).includes(`gp:${o.id}`)) r = await tap(`gp:${o.id}`, cards[0].result.message_id);
  else await fetch(`${BASE}/api/orders/${JSON.parse(sql(`SELECT public_token AS t FROM orders WHERE id = ${o.id}`).toString().replace(/^[^[]*/, ''))[0].results[0].t}/report-payment`, { method: 'POST' });
  await settle();
  const st = JSON.parse(sql(`SELECT payment_status, status FROM orders WHERE id = ${o.id}`).toString().replace(/^[^[]*/, ''))[0].results[0];
  ok(st.payment_status === 'reported' && st.status === 'new', '«Я оплатил» → «гость сообщил об оплате», кухня ещё не готовит');

  // ---- 7. Стоп-лист и алкоголь ----
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  sql(`INSERT INTO stop_list (location_id, dish_id, day) VALUES ('nt1', 'syrniki', '${today}')`);
  i = calls.length;
  await hook(say('/quick'));
  await settle();
  screen = lastScreen(since(i));
  ok(!datas(screen).includes('q:a:syrniki') && datas(screen).includes('q:a:pelmeni'), 'блюдо из стоп-листа исчезло из быстрого заказа');
  const qMsg = screen.result.message_id;
  r = await tap('q:a:syrniki', qMsg);
  ok(toast(r).includes('нет в наличии'), 'нажатие на старую кнопку блюда из стоп-листа: «сейчас нет в наличии»');
  r = await tap('q:a:shot-tequila', qMsg);
  r = await tap('q:go', qMsg);
  screen = lastScreen(r);
  ok(datas(screen).join() === 'q:t:v,q:l' && screen.body.text.includes('только к визиту'), 'с алкоголем — только «К визиту»');
  r = await tap('q:clr', qMsg);
  ok(!datas(lastScreen(r)).includes('q:go'), '«Очистить» убирает корзину');

  // ---- 8. Повторить прошлый заказ ----
  i = calls.length;
  await hook(say('/start'));
  await settle();
  ok(datas(toGuest(since(i), 'sendMessage')[0]).includes('q:rep'), 'после заказа в приветствии появилась «Повторить прошлый заказ»');
  i = calls.length;
  await hook(say('/repeat'));
  await settle();
  screen = lastScreen(since(i));
  ok(screen.body.text.includes(`Ваш заказ №${o.id}`) && screen.body.text.includes('<s>Мамины сырники ×2</s> <i>сегодня закончилось</i>') && screen.body.text.includes('129 000 ₫'), 'повтор: борщ по сегодняшней цене, сырники зачёркнуты — закончились');
  ok(datas(screen)[0] === 'q:go', 'повтор: можно сразу оформить');

  // ---- 9. Блюдо дня снято ----
  await staff('/api/staff/bot', 'PUT', { day: null, quick: view.quick });
  i = calls.length;
  await hook(say('/day'));
  await settle();
  ok(toGuest(since(i), 'sendMessage')[0]?.body.text.includes('ещё не выбрано'), 'блюдо дня снято — гость видит «ещё не выбрано» и кнопку быстрого заказа');
} finally {
  sql(`DELETE FROM stop_list WHERE dish_id = 'syrniki'`);
  fake.close();
}
console.log(fails ? `\n${fails} проверок не прошли` : '\nВсе проверки прошли');
process.exit(fails ? 1 : 0);
