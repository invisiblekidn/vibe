// Проверка доставки на локальном сервере: node scripts/delivery-smoke.mjs [http://localhost:8787]
// Нужен запущенный `npm run dev`, база с тестовыми данными и STAFF_PIN из .dev.vars.
import { readFileSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:8787';
const PIN = (readFileSync('.dev.vars', 'utf8').match(/^STAFF_PIN=(.*)$/m) || [])[1]?.trim();
let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fails++; };
const rnd = () => crypto.randomUUID();
async function call(path, { method = 'GET', body, cookie } = {}) {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => null), headers: r.headers };
}

const login = await call('/api/staff/login', { method: 'POST', body: { name: 'Проверка', pin: PIN } });
const cookie = login.headers.get('set-cookie').split(';')[0];
const settings = (await call('/api/staff/delivery', { cookie })).data;
const put = (over) => call('/api/staff/delivery', { method: 'PUT', cookie, body: { enabled: settings.enabled, fee: settings.fee, min_order: settings.min_order, ...over } });
await put({ enabled: true, fee: 0, min_order: 100000 });

let menu = (await call('/api/menu')).data;
ok(menu.location.orderTypes.includes('delivery'), 'доставка в видах заказа');
const d = menu.location.delivery;
ok(d && d.fee === 0 && d.minOrder === 100000 && d.leadMin === 20 && d.building === 'Napoleon Castle 1', `условия в меню: ${JSON.stringify(d)}`);

const slots = (await call('/api/slots?type=delivery')).data;
let day, time;
for (const dd of slots.days.slice(1)) {
  const s = (await call(`/api/slots?type=delivery&day=${dd}`)).data.slots.find((x) => x.state === 'free');
  if (s) { day = dd; time = s.time; break; }
}
const dish = menu.dishes.find((x) => !x.is_alcohol && !x.groups.some((g) => g.min_select > 0) && x.price < 100000 && x.price >= 40000);
const two = 2 * dish.price >= 100000 ? 2 : Math.ceil(100000 / dish.price);
const alco = menu.dishes.find((x) => x.is_alcohol);
const order = (over = {}) => ({
  idempotencyKey: rnd(), type: 'delivery', slot: `${day} ${time}`, guest: { name: 'Тест доставки', phone: '+84 900 000 001' }, lang: 'ru',
  items: [{ dishId: dish.id, qty: two }], delivery: { floor: '43', apt: '5' }, ...over,
});

// 1. Заказ в квартиру: доставка бесплатная
const body = order();
const a = await call('/api/orders', { method: 'POST', body });
ok(a.status === 201 && a.data.total === dish.price * two, `доставка по зданию: сумма ${a.data?.total} = только блюда`);
// 2. Повтор с тем же ключом — тот же заказ
const a2 = await call('/api/orders', { method: 'POST', body });
ok(a2.data?.duplicate && a2.data.number === a.data.number, 'повторное нажатие не создаёт второй заказ');
const pub = (await call(`/api/orders/${a.data.token}`)).data;
ok(pub.type === 'delivery' && pub.deliveryFee === 0 && pub.deliveryAddress === 'Наполеон, этаж 43, кв. 05' && pub.deliveryPoint === null, `гость видит: ${pub.deliveryAddress}`);
// 3. Цена от гостя не принимается
const fake = await call('/api/orders', { method: 'POST', body: order({ deliveryFee: 50000, total: 1 }) });
ok(fake.data?.total === dish.price * two, 'цену доставки считает только сервер');
// 4. Меньше 100 000 за блюда
const small = await call('/api/orders', { method: 'POST', body: order({ items: [{ dishId: dish.id, qty: 1 }] }) });
ok(small.status === 409 && small.data.error === 'DELIVERY_MIN_ORDER' && small.data.min === 100000, `меньше 100 000 — отказ ${small.data?.error}`);
// 5. Без квартиры, неверный этаж, старый сайт с картой
for (const [del, what] of [[{ floor: '12', apt: '' }, 'без квартиры'], [{ floor: '44', apt: '05' }, 'этаж 44'], [{ floor: '12', apt: '1206' }, 'четырёхзначная квартира'], [{ address: 'Hòn Chồng', lat: 12.27, lng: 109.2 }, 'старая корзина с картой'], [undefined, 'без данных']]) {
  const r = await call('/api/orders', { method: 'POST', body: order({ delivery: del }) });
  ok(r.status === 409 && r.data.error === 'DELIVERY_NO_APT', `${what} — отказ ${r.data?.error}`);
}
// 6. Алкоголь на доставку нельзя
if (alco) {
  const al = await call('/api/orders', { method: 'POST', body: order({ items: [{ dishId: alco.id, qty: 5 }] }) });
  ok(al.status === 409 && al.data.error === 'ALCOHOL_NOT_ALLOWED', 'алкоголь с доставкой — отказ');
}
// 7. Слишком рано (меньше 20 минут)
const today = (await call('/api/slots?type=delivery')).data;
const soon = today.slots.find((s) => s.state === 'too_soon');
if (soon) {
  const r = await call('/api/orders', { method: 'POST', body: order({ slot: `${today.day} ${soon.time}` }) });
  ok(r.status === 409 && r.data.error === 'SLOT_TOO_SOON', 'время раньше чем через 20 минут — отказ');
}
// 8. Платная доставка, если сотрудник поставит цену
await put({ fee: 10000 });
const paid = await call('/api/orders', { method: 'POST', body: order() });
ok(paid.status === 201 && paid.data.total === dish.price * two + 10000, `цена из панели 10 000: ${paid.data?.total}`);
await put({ fee: 0 });
// 9. Выключили доставку
await put({ enabled: false });
menu = (await call('/api/menu')).data;
ok(!menu.location.orderTypes.includes('delivery') && menu.location.delivery === null, 'выключенная доставка пропала из меню');
const off = await call('/api/orders', { method: 'POST', body: order() });
ok(off.status === 409 && off.data.error === 'DELIVERY_OFF', 'выключенную доставку сервер не принимает');
ok((await call('/api/slots?type=delivery')).status === 400, 'время для выключенной доставки не выдаётся');
// 10. Неверные настройки
ok((await put({ fee: -5 })).status === 400, 'отрицательная цена не сохраняется');
await put({ enabled: true });
// 11. Сотрудник видит квартиру
const staff = (await call('/api/staff/orders', { cookie })).data.orders.find((o) => o.id === a.data.number);
ok(staff && staff.deliveryAddress === 'Наполеон, этаж 43, кв. 05' && staff.deliveryMap === null && staff.deliveryFee === 0, 'сотрудник видит этаж и квартиру');
// 12. Статусы: оплата → готовить → отдать курьеру → доставлен
for (const act of ['confirm_payment', 'start_cooking', 'mark_ready', 'complete']) {
  const r = await call(`/api/staff/orders/${a.data.number}/action`, { method: 'POST', cookie, body: { action: act } });
  ok(r.status === 200, `действие ${act}: ${r.data?.status}`);
}
// 12б. Телефон для доставки необязателен, для «С собой» — обязателен
const nophone = await call('/api/orders', { method: 'POST', body: order({ guest: { name: 'Без телефона', phone: '' } }) });
ok(nophone.status === 201, `доставка без телефона принята: ${nophone.status}`);
const badphone = await call('/api/orders', { method: 'POST', body: order({ guest: { name: 'Кривой', phone: 'abc' } }) });
ok(badphone.status === 400, 'доставка с неверным телефоном — отказ');
const pkNoPhone = await call('/api/orders', { method: 'POST', body: order({ type: 'pickup', delivery: undefined, guest: { name: 'Без телефона', phone: '' } }) });
ok(pkNoPhone.status === 400 && pkNoPhone.data.field === 'phone', '«С собой» без телефона — отказ');
const staffNp = (await call('/api/staff/orders', { cookie })).data.orders.find((o) => o.id === nophone.data.number);
ok(staffNp && staffNp.guestPhone === '' && staffNp.inTelegram === false, 'сотрудник видит заказ без телефона');
// 13. «С собой» (pickup) работает как прежде
const pk = await call('/api/orders', { method: 'POST', body: order({ type: 'pickup', delivery: undefined, items: [{ dishId: dish.id, qty: 1 }] }) });
ok(pk.status === 201 && pk.data.total === dish.price, '«С собой» без минимума и доставки');

console.log(fails ? `\n${fails} проверок не прошли` : '\nВсе проверки доставки прошли');
process.exit(fails ? 1 : 0);
