// Проверка порядка подачи (заказ со стола «По очереди») на локальном сервере с имитацией Telegram:
//   1) в .dev.vars задать STAFF_PIN, TG_* и TG_API_BASE=http://localhost:8788 (см. .dev.vars.example)
//   2) npm run dev
//   3) node scripts/courses-smoke.mjs
import http from 'node:http';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:8787';
const vars = Object.fromEntries(readFileSync('.dev.vars', 'utf8').split('\n').map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
const GROUP = Number(vars.TG_STAFF_CHAT_ID);
const [STAFF] = vars.TG_STAFF.split(',').map((x) => Number(x.split(':')[0]));
const TABLE3 = 'swpe6x';
const TABLE_U2 = '5ka88y';

const calls = [];
let msgId = 5000;
const fake = http.createServer((req, res) => {
  let b = '';
  req.on('data', (c) => (b += c));
  req.on('end', () => {
    const method = req.url.split('/').pop();
    const result = ['answerCallbackQuery', 'setMessageReaction', 'editMessageText'].includes(method) ? true : { message_id: ++msgId };
    calls.push({ method, body: JSON.parse(b || '{}'), result });
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: true, result }));
  });
});
await new Promise((r) => fake.listen(8788, r));

let fails = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const settle = async () => { let n = -1; while (n !== calls.length) { n = calls.length; await wait(400); } };
const sql = (q) => execSync(`npx wrangler d1 execute vibe-db --local --command ${JSON.stringify(q)}`, { stdio: 'pipe' });
let uid = Math.floor(Date.now() / 1000) * 10;
const hook = (update) => fetch(BASE + '/tg/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': vars.TG_WEBHOOK_SECRET }, body: JSON.stringify(update) });
const press = (from, data, message_id) => ({ update_id: ++uid, callback_query: { id: 'cb' + uid, from: { id: from, first_name: 'X' }, data, message: { message_id, chat: { id: GROUP, type: 'supergroup' } } } });
async function call(path, body, cookie) {
  const r = await fetch(BASE + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => null), headers: r.headers };
}
const sig = (items) => items.map((i) => `${i.dishId}*${i.qty}[${(i.optionIds || []).join(',')}]@${i.course}`).join('|');
const phone = crypto.randomUUID();
const order = (items, extra = {}) => call(`/api/table/${TABLE3}/orders`, { idempotencyKey: crypto.randomUUID(), device: phone, items, lang: 'vi', serveMode: 'courses', ...extra });
const view = async () => (await call(`/api/table/${TABLE3}?d=${phone}&lang=vi`)).data;
const items = [
  { dishId: 'cappuccino', qty: 2, optionIds: [], course: 1 },
  { dishId: 'caesar-chicken', qty: 1, optionIds: [], course: 1 },
  { dishId: 'borsch', qty: 1, optionIds: [], course: 2 },
  { dishId: 'kids-nuggets', qty: 1, optionIds: [], course: 3 },
];
const lastCard = (id) => [...calls].reverse().find((c) => (c.method === 'sendMessage' || c.method === 'editMessageText') && c.body.chat_id === GROUP && c.body.text.includes(`Заказ №${id}`));
const buttons = (c) => c.body.reply_markup.inline_keyboard.flat().map((b) => b.text);

try {
  // 1. Подтверждение порядка обязательно
  ok((await order(items)).data.error === 'COURSES_NOT_CONFIRMED', 'без подтверждения гостя заказ по подачам не принимается');
  const changed = items.map((i) => (i.dishId === 'kids-nuggets' ? { ...i, course: 2 } : i));
  ok((await order(changed, { serveConfirm: sig(items) })).data.error === 'COURSES_NOT_CONFIRMED', 'порядок изменили после подтверждения — нужно подтвердить заново');
  const gap = [{ ...items[0], course: 1 }, { ...items[2], course: 3 }];
  ok((await order(gap, { serveConfirm: sig(gap) })).data.error === 'BAD_COURSES', 'подачи с пропуском номера — отказ');

  // 2. Заказ с подтверждённым порядком; повтор не создаёт дубль
  const body = { idempotencyKey: crypto.randomUUID(), device: phone, items, lang: 'vi', serveMode: 'courses', serveConfirm: sig(items) };
  const a = await call(`/api/table/${TABLE3}/orders`, body);
  const again = await call(`/api/table/${TABLE3}/orders`, body);
  ok(a.status === 201 && again.data.number === a.data.number, `заказ №${a.data.number} по подачам принят, повторное нажатие не создаёт второй`);
  const id = a.data.number;
  let v = await view();
  let o = v.bill.orders.find((x) => x.number === id);
  ok(o.serveMode === 'courses' && o.courses.length === 3 && o.courses.every((c) => c.status === 'waiting'), 'гость видит 3 подачи, все ждут');
  ok(o.items.find((i) => i.course === 3).name.startsWith('Gà viên'), 'гость видит блюда на своём языке (VI)');
  await settle();
  let card = lastCard(id);
  ok(card.body.text.includes('Подача по очереди') && card.body.text.includes('1️⃣ Подача 1') && card.body.text.includes('3️⃣ Подача 3'), 'карточка в группе показывает подачи 1–3');
  ok(card.body.text.includes('Куриные наггетсы'), 'в группе названия по-русски');
  ok(buttons(card)[0] === '✅ Принять', 'заказ по подачам принимают одной кнопкой «Принять»');
  const msg = card.result?.message_id || card.body.message_id;

  // 3. Принять → подача 1 готовится, остальные ждут шефа
  await hook(press(STAFF, `o:${id}:sc`, msg));
  await settle();
  o = (await view()).bill.orders.find((x) => x.number === id);
  ok(o.courses.map((c) => c.status).join(',') === 'cooking,waiting,waiting', 'после «Принять» готовится только подача 1');
  card = lastCard(id);
  ok(buttons(card).includes('✅ Подача 1 готова') && buttons(card).includes('▶️ Начать подачу 2'), 'в группе кнопки «Подача 1 готова» и «Начать подачу 2»');
  ok(!buttons(card).some((b) => b.includes('Подано') || b === '🍽 Готово'), 'общих кнопок «Готово/Подано» у заказа по подачам нет');
  await hook(press(STAFF, `o:${id}:mr`, msg));
  await settle();
  ok(calls.filter((c) => c.method === 'answerCallbackQuery').pop().body.text.includes('подачи'), 'старая общая кнопка «Готово» для такого заказа не срабатывает');

  // 4. Перескочить через подачу нельзя
  await hook(press(STAFF, `k:${id}:3:s`, msg));
  await settle();
  ok(calls.filter((c) => c.method === 'answerCallbackQuery').pop().body.text.includes('более раннюю'), 'начать подачу 3 раньше подачи 2 нельзя');

  // 5. Подача 1 готова → подана → напоминание о подаче 2
  await hook(press(STAFF, `k:${id}:1:r`, msg));
  await settle();
  await hook(press(999, `k:${id}:1:v`, msg));
  await settle();
  ok(calls.filter((c) => c.method === 'answerCallbackQuery').pop().body.show_alert, 'чужой человек в группе подачу отметить не может');
  let n = calls.length;
  await Promise.all([hook(press(STAFF, `k:${id}:1:v`, msg)), hook(press(STAFF, `k:${id}:1:v`, msg))]);
  await settle();
  const alerts = calls.slice(n).filter((c) => c.method === 'sendMessage' && c.body.text.includes('подача 1 подана'));
  ok(alerts.length === 1 && alerts[0].body.text.includes('подача 2'), 'двойное нажатие «Подано» — одно напоминание шефу о подаче 2');
  o = (await view()).bill.orders.find((x) => x.number === id);
  ok(o.courses.map((c) => c.status).join(',') === 'served,waiting,waiting' && o.status === 'cooking', 'гость видит: подача 1 подана, следующие ждут');

  // 6. Панель сотрудника: шеф начинает подачу 2, кухня, «Подано»
  const login = await call('/api/staff/login', { name: 'Шеф', pin: vars.STAFF_PIN });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const so = (await call('/api/staff/orders', null, cookie)).data.orders.find((x) => x.id === id);
  ok(so.serveMode === 'courses' && so.items.find((i) => i.name === 'Борщ с говядиной').course === 2, 'панель получает подачи и номер подачи у блюд');
  ok((await call(`/api/staff/orders/${id}/course`, { course: 2, action: 'start' }, cookie)).data.ok, 'в панели «Начать подачу 2»');
  ok((await call(`/api/staff/orders/${id}/course`, { course: 2, action: 'start' }, cookie)).data.changed === false, 'повторное «Начать» ничего не меняет');
  ok((await call(`/api/staff/orders/${id}/course`, { course: 2, action: 'served' }, cookie)).data.error === 'COURSE_NOT_READY', 'подать неготовую подачу нельзя');
  await call(`/api/staff/orders/${id}/course`, { course: 2, action: 'ready' }, cookie);
  await call(`/api/staff/orders/${id}/course`, { course: 2, action: 'served' }, cookie);
  await call(`/api/staff/orders/${id}/course`, { course: 3, action: 'start' }, cookie);
  await call(`/api/staff/orders/${id}/course`, { course: 3, action: 'ready' }, cookie);
  o = (await view()).bill.orders.find((x) => x.number === id);
  ok(o.status === 'ready' && o.courses[2].status === 'ready', 'подача 3 готова — заказ «готово, несём»');
  await call(`/api/staff/orders/${id}/course`, { course: 3, action: 'served' }, cookie);
  o = (await view()).bill.orders.find((x) => x.number === id);
  ok(o.status === 'served' && o.courses.every((c) => c.status === 'served'), 'последняя подача подана — заказ закрыт');
  await settle();
  card = lastCard(id);
  ok(card.body.reply_markup.inline_keyboard.length === 0, 'в группе у закрытого заказа кнопок больше нет');

  // 7. «Всё сразу» работает как раньше
  const t = await call(`/api/table/${TABLE3}/orders`, { idempotencyKey: crypto.randomUUID(), device: phone, items: [{ dishId: 'borsch', qty: 1 }], lang: 'ru' });
  o = (await view()).bill.orders.find((x) => x.number === t.data.number);
  ok(o.serveMode === 'together' && o.courses.length === 0, 'заказ «Всё сразу» — без подач, как раньше');
  const one = items.map((i) => ({ ...i, course: 1 }));
  const t2 = await call(`/api/table/${TABLE3}/orders`, { idempotencyKey: crypto.randomUUID(), device: phone, items: one, lang: 'ru', serveMode: 'courses' });
  ok(t2.status === 201, 'все блюда в одной подаче — обычный заказ, подтверждение не нужно');
} finally {
  fake.close();
}
console.log(fails ? `\nНе пройдено: ${fails}` : '\nВсе проверки пройдены');
process.exit(fails ? 1 : 0);
