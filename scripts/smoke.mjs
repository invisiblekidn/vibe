// Сквозная проверка API на локальном сервере: node scripts/smoke.mjs [http://localhost:8787]
// Нужен запущенный `npm run dev`, база с тестовыми данными и STAFF_PIN из .dev.vars.
import { readFileSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:8787';
const PIN = (readFileSync('.dev.vars', 'utf8').match(/^STAFF_PIN=(.*)$/m) || [])[1]?.trim();
let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fails++; };
const rnd = () => crypto.randomUUID();

async function call(path, { method = 'GET', body, cookie } = {}) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json().catch(() => null), headers: r.headers };
}

const menu = (await call('/api/menu')).data;
const slots = (await call('/api/slots?type=pickup')).data;
const day = slots.days[2]; // через два дня: время точно свободно и не «слишком рано»
const guest = { name: 'Тест', phone: '+84 900 000 000' };
const sy = menu.dishes.find((d) => d.id === 'syrniki');
const sauce = sy.groups[0].options[0].id;
const order = (over = {}) => ({
  idempotencyKey: rnd(), type: 'pickup', slot: `${day} 12:00`, guest, lang: 'ru',
  items: [{ dishId: 'cappuccino', qty: 1 }], ...over,
});
const base = order({ items: [{ dishId: 'syrniki', qty: 2, optionIds: [sauce], price: 1 }] });

// 1. Создание и цена с сервера (поле price от гостя игнорируется)
const a = await call('/api/orders', { method: 'POST', body: base });
ok(a.status === 201 && a.data.total === sy.price * 2, `заказ создан, сумма из меню: ${a.data?.total}`);

// 2. Повторное нажатие с тем же ключом не создаёт второй заказ
const [d1, d2] = await Promise.all([call('/api/orders', { method: 'POST', body: base }), call('/api/orders', { method: 'POST', body: base })]);
ok(d1.data.number === a.data.number && d2.data.number === a.data.number && d1.data.duplicate, 'повтор с тем же ключом вернул тот же номер');

// 3. Обязательная опция, алкоголь на самовывоз, неизвестное блюдо
ok((await call('/api/orders', { method: 'POST', body: order({ items: [{ dishId: 'syrniki', qty: 1 }] }) })).data.error === 'OPTION_REQUIRED', 'без соуса — OPTION_REQUIRED');
ok((await call('/api/orders', { method: 'POST', body: order({ items: [{ dishId: 'mojito', qty: 1 }] }) })).data.error === 'ALCOHOL_NOT_ALLOWED', 'мохито на самовывоз — отказ');
ok((await call('/api/orders', { method: 'POST', body: order({ type: 'visit', items: [{ dishId: 'mojito', qty: 1 }] }) })).status === 201, 'мохито к визиту — можно');
ok((await call('/api/orders', { method: 'POST', body: order({ items: [{ dishId: 'nope', qty: 1 }] }) })).data.error === 'DISH_UNAVAILABLE', 'несуществующее блюдо — отказ');
ok((await call('/api/orders', { method: 'POST', body: order({ slot: `${day} 12:15` }) })).data.error === 'SLOT_INVALID', 'время не по сетке — отказ');
ok((await call('/api/orders', { method: 'POST', body: order({ type: 'delivery' }) })).data.error === 'TYPE_NOT_AVAILABLE', 'доставка на этапе 1 выключена');

// 4. Заполненный интервал: 5 заказов на 13:00 одновременно + шестой
const slot = `${day} 13:00`;
const burst = await Promise.all(Array.from({ length: 6 }, () => call('/api/orders', { method: 'POST', body: order({ slot }) })));
const created = burst.filter((r) => r.status === 201).length;
const full = burst.filter((r) => r.data?.error === 'SLOT_FULL').length;
ok(created === 5 && full === 1, `6 одновременных заказов на 13:00: принято ${created}, отказ «занято» ${full}`);
const s2 = (await call(`/api/slots?type=pickup&day=${day}`)).data.slots.find((s) => s.time === '13:00');
ok(s2.state === 'full', 'интервал 13:00 показан гостю как занятый');

// 5. Оплата: «Я оплатил» ≠ «оплата подтверждена»
const t = a.data.token;
await call(`/api/orders/${t}/report-payment`, { method: 'POST' });
const again = await call(`/api/orders/${t}/report-payment`, { method: 'POST' });
const o1 = (await call(`/api/orders/${t}`)).data;
ok(o1.status === 'payment_checking' && o1.paymentStatus === 'reported' && again.status === 200, 'после «Я оплатил» гость видит «Проверяем оплату», повтор безопасен');

ok((await call('/api/staff/orders')).status === 401, 'панель без входа закрыта');
ok((await call('/api/staff/login', { method: 'POST', body: { name: 'Тест', pin: 'wrong' } })).status === 401, 'неверный PIN не пускает');
const login = await call('/api/staff/login', { method: 'POST', body: { name: 'Админ', pin: PIN } });
const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
ok(login.status === 200 && cookie.startsWith('vibe_staff='), 'сотрудник вошёл');

const act = (action) => call(`/api/staff/orders/${a.data.number}/action`, { method: 'POST', body: { action }, cookie });
ok((await act('start_cooking')).data.error === 'PAYMENT_NOT_CONFIRMED', 'кухня не может начать до подтверждения оплаты');
const list = (await call('/api/staff/orders', { cookie })).data.orders.find((o) => o.id === a.data.number);
ok(list && list.paymentStatus === 'reported', 'в панели заказ помечен «гость сообщил об оплате»');
const [c1, c2] = await Promise.all([act('confirm_payment'), act('confirm_payment')]);
ok([c1, c2].some((r) => r.data.ok) && [c1, c2].every((r) => r.data.ok || r.data.error === 'CHANGED_MEANWHILE'), 'два одновременных подтверждения не ломают заказ');
for (const x of ['start_cooking', 'mark_ready', 'complete']) ok((await act(x)).data.ok, `сотрудник: ${x}`);
const fin = (await call(`/api/orders/${t}`)).data;
ok(fin.status === 'completed', 'гость видит «Выдано»');
const ev = (await call(`/api/staff/orders/${a.data.number}/events`, { cookie })).data.events.map((e) => `${e.kind}:${e.actor}`);
ok(ev.length === 6 && !ev.some((e, i) => ev.indexOf(e) !== i), `журнал без дублей: ${ev.join(', ')}`);

console.log(fails ? `\n${fails} проверок не прошло` : '\nВсе проверки прошли');
process.exit(fails ? 1 : 0);
