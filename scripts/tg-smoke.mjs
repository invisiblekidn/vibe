// Проверка Telegram-части на имитации Telegram (без настоящего бота и сети):
//   1) в .dev.vars задать TG_* и TG_API_BASE=http://localhost:8788 (см. .dev.vars.example)
//   2) npm run dev
//   3) node scripts/tg-smoke.mjs
import http from 'node:http';
import { readFileSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:8787';
const vars = Object.fromEntries(readFileSync('.dev.vars', 'utf8').split('\n').map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
const TOKEN = vars.TG_BOT_TOKEN;
const SECRET = vars.TG_WEBHOOK_SECRET;
const GROUP = Number(vars.TG_STAFF_CHAT_ID);
const [ANYA] = vars.TG_STAFF.split(',').map((x) => Number(x.split(':')[0]));

// ---- имитация Bot API ----
const calls = [];
let msgId = 1000;
const fake = http.createServer((req, res) => {
  let b = '';
  req.on('data', (c) => (b += c));
  req.on('end', () => {
    const method = req.url.split('/').pop();
    const result = method === 'answerCallbackQuery' || method === 'setMessageReaction' ? true : { message_id: ++msgId };
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
const since = (i) => calls.slice(i);
let uid = Math.floor(Date.now() / 1000) * 10;
const hook = (update, secret = SECRET) =>
  fetch(BASE + '/tg/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': secret }, body: JSON.stringify(update) });
const api = async (path, body) => {
  const r = await fetch(BASE + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => null) };
};
const priv = (from, text) => ({ update_id: ++uid, message: { message_id: uid, from: { id: from, first_name: 'Мария' }, chat: { id: from, type: 'private' }, date: 0, text } });
const press = (from, data, message_id) => ({ update_id: ++uid, callback_query: { id: 'cb' + uid, from: { id: from, first_name: 'X' }, data, message: { message_id, chat: { id: GROUP, type: 'supergroup' } } } });

// initData так, как его подписывает Telegram
async function signInit(fields) {
  const enc = new TextEncoder();
  const h = async (key, data) => crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), enc.encode(data));
  const check = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
  const secret = await h(enc.encode('WebAppData'), TOKEN);
  const p = new URLSearchParams(fields);
  p.set('hash', Buffer.from(await h(secret, check)).toString('hex'));
  return p.toString();
}

try {
  // 1. Чужой запрос без секрета
  ok((await hook(priv(777, '/start'), 'wrong')).status === 403, 'событие без секрета Telegram отклонено');

  // 2. /start и повторная доставка того же события
  let i = calls.length;
  const start = priv(777, '/start');
  await hook(start);
  await hook(start);
  await settle();
  const greet = since(i).filter((c) => c.method === 'sendMessage' && c.body.chat_id === 777);
  ok(greet.length === 1 && greet[0].body.reply_markup.inline_keyboard[0][0].web_app?.url.endsWith('/?tg=1'), '«Старт»: одно приветствие с кнопкой «Открыть меню» даже при повторе события');

  // 3. Заказ из Mini App
  const slots = (await api('/api/slots?type=pickup')).data;
  const day = slots.days[3];
  const menu = (await api('/api/menu')).data;
  const sauce = menu.dishes.find((d) => d.id === 'syrniki').groups[0].options[0].id;
  const initData = await signInit({ auth_date: String(Math.floor(Date.now() / 1000)), query_id: 'Q1', user: JSON.stringify({ id: 777, first_name: 'Мария' }) });
  const body = { idempotencyKey: crypto.randomUUID(), type: 'pickup', slot: `${day} 14:00`, guest: { name: 'Мария', phone: '+84 901 111 222' }, items: [{ dishId: 'syrniki', qty: 1, optionIds: [sauce] }], tgInitData: initData };
  const forged = await api('/api/orders', { ...body, idempotencyKey: crypto.randomUUID(), tgInitData: initData.replace('777', '778') });
  ok(forged.status === 401 && forged.data.error === 'TG_AUTH', 'поддельный вход из Telegram отклонён');
  i = calls.length;
  const created = await api('/api/orders', body);
  await api('/api/orders', body); // двойное нажатие
  await settle();
  const N = created.data.number;
  const T = created.data.token;
  const card = since(i).filter((c) => c.method === 'sendMessage' && c.body.chat_id === GROUP);
  ok(created.status === 201 && card.length === 1 && card[0].body.text.includes(`Заказ №${N}`) && card[0].body.text.includes('Telegram'), `группа: одна карточка заказа №${N} с пометкой «Telegram»`);
  const cardMsg = msgId - (since(i).filter((c) => c.method === 'sendMessage').length - 1 - since(i).filter((c) => c.method === 'sendMessage').findIndex((c) => c.body.chat_id === GROUP));
  const btns = card[0].body.reply_markup.inline_keyboard.flat().map((b) => b.callback_data);
  ok(btns.includes(`o:${N}:cp`) && !btns.includes(`o:${N}:sc`), 'на карточке «Деньги пришли», кнопки «Готовить» пока нет');
  const toGuest = since(i).filter((c) => c.method === 'sendMessage' && c.body.chat_id === 777);
  ok(toGuest.length === 1 && toGuest[0].body.text.includes(`Заказ №${N} принят`) && toGuest[0].body.reply_markup.inline_keyboard[0][0].web_app, 'гостю: «Заказ принят» и кнопка «Открыть заказ и QR»');

  // 4. «Я оплатил»
  i = calls.length;
  await api(`/api/orders/${T}/report-payment`, {});
  await api(`/api/orders/${T}/report-payment`, {});
  await settle();
  const s4 = since(i);
  ok(s4.some((c) => c.method === 'editMessageText' && c.body.text.includes('гость сообщил об оплате')), 'карточка в группе: «гость сообщил об оплате»');
  ok(s4.filter((c) => c.method === 'sendMessage' && c.body.chat_id === GROUP && c.body.text.includes('сообщил об оплате')).length === 1, 'в группе одно напоминание проверить поступление');
  ok(s4.filter((c) => c.method === 'sendMessage' && c.body.chat_id === 777 && c.body.text.includes('Оплата проверяется')).length === 1, 'гостю одно сообщение «Оплата проверяется»');

  // 5. Кнопки: чужой человек, рано готовить, два подтверждения сразу
  const order = await (async () => (await api(`/api/orders/${T}`)).data)();
  i = calls.length;
  await hook(press(999, `o:${N}:cp`, cardMsg));
  await settle();
  ok(since(i).some((c) => c.method === 'answerCallbackQuery' && c.body.show_alert && c.body.text.includes('только для сотрудников')), 'не сотрудник: кнопка не срабатывает');
  ok((await api(`/api/orders/${T}`)).data.paymentStatus === 'reported', '…и оплата не подтверждена');
  i = calls.length;
  await hook(press(ANYA, `o:${N}:sc`, cardMsg));
  await settle();
  ok(since(i).some((c) => c.method === 'answerCallbackQuery' && c.body.text.includes('Сначала подтвердите оплату')), '«Готовить» до подтверждения оплаты не срабатывает');
  i = calls.length;
  await Promise.all([hook(press(ANYA, `o:${N}:cp`, cardMsg)), hook(press(ANYA, `o:${N}:cp`, cardMsg))]);
  await settle();
  const conf = since(i).filter((c) => c.method === 'sendMessage' && c.body.chat_id === 777 && c.body.text.includes('Оплата подтверждена'));
  ok(conf.length === 1, 'два нажатия «Деньги пришли» подряд: гость получил одно «Оплата подтверждена»');
  ok(since(i).some((c) => c.method === 'editMessageText' && c.body.text.includes('Аня подтвердил(а) оплату')), 'в карточке видно, кто подтвердил');
  for (const [code, word] of [['sc', 'готовим'], ['mr', 'готов'], ['cm', 'выдан']]) {
    i = calls.length;
    await hook(press(ANYA, `o:${N}:${code}`, cardMsg));
    await settle();
    ok(since(i).some((c) => c.method === 'sendMessage' && c.body.chat_id === 777 && c.body.text.toLowerCase().includes(word)), `кнопка ${code}: гостю «${word}»`);
  }
  ok((await api(`/api/orders/${T}`)).data.status === 'completed', 'заказ закрыт как «Выдано»');

  // 6. Переписка
  i = calls.length;
  await hook(priv(777, 'Можно без сахара?'));
  await settle();
  const relayed = since(i).find((c) => c.method === 'sendMessage' && c.body.chat_id === GROUP && c.body.text.includes('Можно без сахара?'));
  ok(!!relayed && relayed.body.text.includes(`заказ №${N}`), 'вопрос гостя переслан в группу с номером заказа');
  const relayMsg = msgId - since(i).filter((c) => c.method === 'sendMessage').length + 1 + since(i).filter((c) => c.method === 'sendMessage').findIndex((c) => c.body.chat_id === GROUP);
  i = calls.length;
  await hook({ update_id: ++uid, message: { message_id: uid, from: { id: ANYA }, chat: { id: GROUP, type: 'supergroup' }, date: 0, text: 'Да, конечно', reply_to_message: { message_id: relayMsg } } });
  await settle();
  ok(since(i).some((c) => c.method === 'sendMessage' && c.body.chat_id === 777 && c.body.text.includes('Да, конечно')), 'ответ сотрудника ушёл гостю');

  // 7. Заказ с сайта, привязанный к Telegram по ссылке
  const site = await api('/api/orders', { ...body, idempotencyKey: crypto.randomUUID(), tgInitData: undefined, slot: `${day} 14:30` });
  const so = (await api(`/api/orders/${site.data.token}`)).data;
  ok(so.tgLink?.startsWith('https://t.me/') && !so.inTelegram, 'заказ с сайта: есть кнопка «Получать статус в Telegram»');
  i = calls.length;
  await hook(priv(888, `/start o_${site.data.token}`));
  await hook(priv(889, `/start o_${site.data.token}`)); // чужая ссылка не перехватывает заказ
  await api(`/api/orders/${site.data.token}/report-payment`, {});
  await settle();
  ok(since(i).some((c) => c.method === 'sendMessage' && c.body.chat_id === 888 && c.body.text.includes('Оплата проверяется')), 'после привязки статусы заказа с сайта приходят в Telegram');
  ok(!since(i).some((c) => c.body.chat_id === 889 && c.body.text?.includes('Оплата')), 'второй человек по той же ссылке заказ не получает');

  // 8. Отмена в два нажатия
  const siteCard = (await (async () => { const all = calls.filter((c) => c.method === 'sendMessage' && c.body.chat_id === GROUP && c.body.text.includes(`Заказ №${site.data.number}`)); return all; })());
  ok(siteCard.length === 1, 'заказ с сайта тоже попал в группу');
  i = calls.length;
  await hook(press(ANYA, `o:${site.data.number}:cx?`, 5000));
  await settle();
  ok((await api(`/api/orders/${site.data.token}`)).data.status !== 'cancelled' && since(i).some((c) => c.method === 'editMessageText' && c.body.reply_markup.inline_keyboard[0][0].text.includes('Да, отменить')), 'первое нажатие «Отменить» только спрашивает');
  await hook(press(ANYA, `o:${site.data.number}:cx`, 5000));
  await settle();
  ok((await api(`/api/orders/${site.data.token}`)).data.status === 'cancelled', 'второе нажатие отменяет заказ');

  // 9. Сотрудник сам выбирает гостя: /guests → кнопка гостя → ответ на «адрес» уходит этому гостю
  i = calls.length;
  await hook({ update_id: ++uid, message: { message_id: uid, from: { id: ANYA, first_name: 'Аня' }, chat: { id: GROUP, type: 'supergroup' }, date: 0, text: '/guests' } });
  await settle();
  const list = since(i).find((c) => c.method === 'sendMessage' && c.body.chat_id === GROUP && c.body.text.startsWith('Кому написать'));
  const btn = list?.body.reply_markup.inline_keyboard.flat().find((b) => b.callback_data === 'g:777');
  ok(!!btn && btn.text.includes('Мария'), '/guests: список гостей с кнопками, Мария в нём');
  i = calls.length;
  await hook(press(ANYA, 'g:777', 6000));
  await settle();
  const addr = since(i).find((c) => c.method === 'sendMessage' && c.body.chat_id === GROUP && c.body.text.includes('Пишем гостю'));
  ok(!!addr, 'нажатие на гостя ставит сообщение «Пишем гостю»');
  const addrId = addr?.result.message_id;
  i = calls.length;
  await hook({ update_id: ++uid, message: { message_id: uid, from: { id: ANYA, first_name: 'Аня' }, chat: { id: GROUP, type: 'supergroup' }, date: 0, text: 'Ваш столик готов', reply_to_message: { message_id: addrId } } });
  await settle();
  ok(since(i).some((c) => c.method === 'sendMessage' && c.body.chat_id === 777 && c.body.text.includes('Ваш столик готов')), 'ответ на «Пишем гостю» ушёл выбранному гостю');
  i = calls.length;
  await hook({ update_id: ++uid, message: { message_id: uid, from: { id: 999, first_name: 'Чужой' }, chat: { id: GROUP, type: 'supergroup' }, date: 0, text: '/guests' } });
  await settle();
  ok(!since(i).some((c) => c.body.text?.startsWith('Кому написать')), 'не сотруднику список гостей не показывается');
  void order;
} finally {
  fake.close();
}
console.log(fails ? `\n${fails} проверок не прошло` : '\nВсе проверки прошли');
process.exit(fails ? 1 : 0);
