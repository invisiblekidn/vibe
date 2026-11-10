// Проверка заказа со стола на локальном сервере с имитацией Telegram:
//   1) в .dev.vars задать STAFF_PIN, TG_* и TG_API_BASE=http://localhost:8788 (см. .dev.vars.example)
//   2) npm run dev
//   3) node scripts/table-smoke.mjs
// Скрипт сам ставит в локальной базе блюдо в стоп-лист и снимает его в конце.
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
const phoneA = crypto.randomUUID();
const phoneB = crypto.randomUUID();
const phoneC = crypto.randomUUID();
const view = async (code, d) => (await call(`/api/table/${code}?d=${d}`)).data;
const order = (code, device, items, extra = {}) => call(`/api/table/${code}/orders`, { idempotencyKey: crypto.randomUUID(), device, items, lang: 'ru', ...extra });

try {
  // 1. QR-ссылка и стол
  const redirect = await fetch(`${BASE}/t/${TABLE3}`, { redirect: 'manual' });
  ok(redirect.status === 302 && redirect.headers.get('location') === `/?table=${TABLE3}`, 'ссылка из QR /t/<код> открывает меню со столом');
  const v0 = await view(TABLE3, phoneA);
  ok(v0.table.title === 'В зале, стол 3' && v0.bill === null, `стол узнан: «${v0.table.title}», счёта ещё нет`);
  ok((await view(TABLE_U2, phoneA)).table.title === 'На улице, стол У2', 'уличный стол: «На улице, стол У2»');
  ok((await call('/api/table/nope00?d=' + phoneA)).status === 404, 'неизвестный код стола — отказ');

  // 2. Заказ телефона A: без входа, без времени; алкоголь за столом можно
  const body = { idempotencyKey: crypto.randomUUID(), device: phoneA, items: [{ dishId: 'borsch', qty: 1 }, { dishId: 'mojito', qty: 1, price: 1 }], comment: 'без лука', lang: 'ru' };
  const a1 = await call(`/api/table/${TABLE3}/orders`, body);
  ok(a1.status === 201 && a1.data.total === 139000 + 129000, `заказ со стола принят, сумма из меню ${a1.data?.total}, мохито можно`);
  const [r1, r2] = await Promise.all([call(`/api/table/${TABLE3}/orders`, body), call(`/api/table/${TABLE3}/orders`, body)]);
  ok(r1.data.number === a1.data.number && r2.data.number === a1.data.number, 'повторное нажатие «Отправить» не создаёт второй заказ');
  await settle();
  const card = calls.find((c) => c.method === 'sendMessage' && c.body.chat_id === GROUP && c.body.text.includes(`Заказ №${a1.data.number}`));
  ok(card && card.body.text.includes('В зале, стол 3') && card.body.text.includes('по счёту в конце'), 'карточка в группе: «В зале, стол 3», оплата по счёту');
  ok(card && card.body.reply_markup.inline_keyboard[0][0].text === '✅ Принять', 'в карточке кнопка «Принять»');

  // 3. Принять одним нажатием → кухня готовит
  let n = calls.length;
  await hook(press(999, `o:${a1.data.number}:sc`, card.result.message_id));
  await settle();
  ok(calls.slice(n).some((c) => c.method === 'answerCallbackQuery' && c.body.show_alert), 'чужой человек в группе принять не может');
  await hook(press(STAFF, `o:${a1.data.number}:sc`, card.result.message_id));
  await settle();
  let va = await view(TABLE3, phoneA);
  ok(va.bill.orders[0].status === 'cooking', 'одно нажатие «Принять» — заказ сразу готовится');

  // 4. Второй заказ того же телефона — в тот же счёт; другой телефон — свой счёт
  const a2 = await order(TABLE3, phoneA, [{ dishId: 'cappuccino', qty: 2 }]);
  const b1 = await order(TABLE3, phoneB, [{ dishId: 'pelmeni', qty: 1 }]);
  ok(a2.data.billId === a1.data.billId, 'второй заказ телефона A — в тот же счёт');
  ok(b1.data.billId !== a1.data.billId, 'телефон B за тем же столом — отдельный счёт');
  va = await view(TABLE3, phoneA);
  ok(va.bill.total === 139000 + 129000 + 130000 && va.others.count === 1 && va.others.total === 149000, `счёт A ${va.bill.total}, за столом ещё 1 счёт на ${va.others.total}`);

  // 5. Блюдо закончилось
  sql(`INSERT OR IGNORE INTO stop_list (location_id, dish_id, day) VALUES ('nt1', 'kiev', '${(await call('/api/menu')).data.today}')`);
  ok((await order(TABLE3, phoneA, [{ dishId: 'kiev', qty: 1 }])).data.error === 'DISH_SOLD_OUT', 'закончившееся блюдо со стола заказать нельзя');

  // 6. Позвать официанта: два нажатия — один вызов
  n = calls.length;
  await call(`/api/table/${TABLE3}/call`, { device: phoneA, kind: 'waiter' });
  const dup = await call(`/api/table/${TABLE3}/call`, { device: phoneB, kind: 'waiter' });
  await settle();
  const waiterMsgs = calls.slice(n).filter((c) => c.method === 'sendMessage' && c.body.text.includes('зовут официанта'));
  ok(dup.data.duplicate && waiterMsgs.length === 1, 'два нажатия «Позвать официанта» — одно сообщение в группе');
  ok((await view(TABLE3, phoneB)).calls.waiter, 'гость видит, что официант уже идёт');
  const callId = Number(waiterMsgs[0].body.reply_markup.inline_keyboard[0][0].callback_data.slice(2));
  n = calls.length;
  await hook(press(STAFF, `c:${callId}`, waiterMsgs[0].result.message_id));
  await settle();
  ok(calls.slice(n).some((c) => c.method === 'editMessageText' && c.body.text.includes('Идёт')), '«Иду» в группе: в сообщении видно, кто идёт');
  ok(!(await view(TABLE3, phoneA)).calls.waiter, 'вызов закрыт, кнопка у гостя снова «Позвать официанта»');

  // 7. Попросить счёт → «Весь стол» → «Я оплатил» → «Деньги пришли»
  n = calls.length;
  await call(`/api/table/${TABLE3}/call`, { device: phoneA, kind: 'bill' });
  await settle();
  const billMsg = calls.slice(n).find((c) => c.method === 'sendMessage' && c.body.text.includes('просят счёт'));
  ok(billMsg && billMsg.body.reply_markup.inline_keyboard.flat().some((b) => b.callback_data === `b:${a1.data.billId}:all`), 'в группе «просят счёт» с кнопками оплаты и «Весь стол»');
  ok((await call(`/api/table/${TABLE3}/bill/merge`, { device: phoneA })).data.ok, 'гость A нажал «Оплатить весь стол»');
  const vb = await view(TABLE3, phoneB);
  ok(vb.bill.id === a1.data.billId && vb.bill.shared && vb.bill.orders.length === 3 && vb.others.count === 0, 'телефон B видит общий счёт стола, его отдельный счёт закрыт');
  const whole = 139000 + 129000 + 130000 + 149000;
  ok(vb.bill.total === whole, `общий счёт: ${vb.bill.total}`);
  const b2 = await order(TABLE3, phoneB, [{ dishId: 'syrniki', qty: 1, optionIds: ['sy-jam'] }]);
  ok(b2.data.billId === a1.data.billId, 'новый заказ телефона B после объединения идёт в общий счёт');
  await call(`/api/table/${TABLE3}/bill/report-payment`, { device: phoneB });
  va = await view(TABLE3, phoneA);
  ok(va.bill.paymentStatus === 'reported' && va.bill.status === 'open', '«Я оплатил» — счёт ждёт проверки, но ещё не закрыт');
  ok((await call(`/api/table/${TABLE3}/bill/merge`, { device: phoneA })).data.error === 'BILL_PAYMENT_PENDING', 'объединять после «Я оплатил» нельзя');

  // Панель сотрудника
  const login = await call('/api/staff/login', { name: 'Аня', pin: vars.STAFF_PIN });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const st = (await call('/api/staff/tables', null, cookie)).data.tables.find((t) => t.id === '3');
  ok(st.bills.length === 1 && st.bills[0].paymentStatus === 'reported' && st.bills[0].total === whole + 119000, 'в панели: стол 3, один общий счёт, «гость сообщил об оплате»');
  const so = (await call('/api/staff/orders', null, cookie)).data.orders.find((o) => o.id === a1.data.number);
  ok(so.table === 'В зале, стол 3' && so.status === 'cooking', 'заказ стола в общем списке панели');
  ok((await call('/api/staff/tables')).status === 401, 'без входа данные столов не отдаются');
  const paid = await call(`/api/staff/bills/${a1.data.billId}/action`, { action: 'paid_qr' }, cookie);
  ok(paid.data.ok && paid.data.changed, 'сотрудник: «Деньги пришли» — счёт закрыт');
  const again = await call(`/api/staff/bills/${a1.data.billId}/action`, { action: 'paid_qr' }, cookie);
  ok(again.data.ok && !again.data.changed, 'повторное нажатие ничего не меняет');
  await settle();
  ok(calls.some((c) => c.method === 'editMessageText' && c.body.text.includes('оплачен')), 'сообщение о счёте в группе стало «оплачен»');
  vb.after = await view(TABLE3, phoneB);
  ok(vb.after.bill.status === 'paid', 'гость B видит «Счёт оплачен»');

  // 8. После оплаты — новый счёт; оплата наличными кнопкой в Telegram
  const c1 = await order(TABLE3, phoneC, [{ dishId: 'cappuccino', qty: 1 }]);
  const b3 = await order(TABLE3, phoneB, [{ dishId: 'cappuccino', qty: 1 }]);
  ok(b3.data.billId !== a1.data.billId && c1.data.billId !== b3.data.billId, 'после оплаты следующий заказ открывает новый счёт');
  n = calls.length;
  await call(`/api/table/${TABLE3}/call`, { device: phoneC, kind: 'bill' });
  await settle();
  const cMsg = calls.slice(n).find((c) => c.method === 'sendMessage' && c.body.text.includes('просят счёт'));
  await hook(press(STAFF, `b:${c1.data.billId}:pc`, cMsg.result.message_id));
  await settle();
  const vc = await view(TABLE3, phoneC);
  ok(vc.bill.status === 'paid' && vc.bill.paymentMethod === 'cash', 'кнопка «Наличными» в группе закрыла счёт телефона C');
  ok((await view(TABLE3, phoneB)).bill.status === 'open', 'счёт телефона B при этом остался открытым');
  ok((await call(`/api/table/${TABLE3}/call`, { device: crypto.randomUUID(), kind: 'bill' })).data.error === 'BILL_EMPTY', 'попросить счёт без заказов нельзя');
} finally {
  sql(`DELETE FROM stop_list WHERE dish_id = 'kiev'`);
  fake.close();
}
console.log(fails ? `\nОшибок: ${fails}` : '\nВсе проверки пройдены');
process.exit(fails ? 1 : 0);
