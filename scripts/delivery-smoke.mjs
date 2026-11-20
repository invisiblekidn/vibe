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
const put = (over) => call('/api/staff/delivery', { method: 'PUT', cookie, body: { ...settings, ...over } });
await put({ enabled: true, min_order: 0, free_from: 250000 });

let menu = (await call('/api/menu')).data;
ok(menu.location.orderTypes.includes('delivery'), 'доставка в видах заказа');
const d = menu.location.delivery;
ok(d && d.baseFee === 30000 && d.radiusKm === 10, `тариф в меню: ${d?.baseFee} ₫, ${d?.radiusKm} км`);
const north = (km) => ({ lat: d.lat + km / 111.195, lng: d.lng });

const slots = (await call('/api/slots?type=delivery')).data;
let day, time;
for (const dd of slots.days.slice(1)) {
  const s = (await call(`/api/slots?type=delivery&day=${dd}`)).data.slots.find((x) => x.state === 'free');
  if (s) { day = dd; time = s.time; break; }
}
const dish = menu.dishes.find((x) => !x.is_alcohol && !x.groups.some((g) => g.min_select > 0) && x.price < 125000);
const alco = menu.dishes.find((x) => x.is_alcohol);
const order = (over = {}) => ({
  idempotencyKey: rnd(), type: 'delivery', slot: `${day} ${time}`, guest: { name: 'Тест доставки', phone: '+84 900 000 001' }, lang: 'ru',
  items: [{ dishId: dish.id, qty: 1 }], delivery: { address: 'Hòn Chồng, отель Sea, номер 305', ...north(4.2) }, ...over,
});

// 1. Заказ на 4,2 км: 30 000 + 2 × 5 000
const body = order();
const a = await call('/api/orders', { method: 'POST', body });
ok(a.status === 201 && a.data.total === dish.price + 40000, `доставка 4,2 км: сумма ${a.data?.total} = ${dish.price} + 40 000`);
// 2. Повтор с тем же ключом — тот же заказ
const a2 = await call('/api/orders', { method: 'POST', body });
ok(a2.data?.duplicate && a2.data.number === a.data.number, 'повторное нажатие не создаёт второй заказ');
const pub = (await call(`/api/orders/${a.data.token}`)).data;
ok(pub.type === 'delivery' && pub.deliveryFee === 40000 && pub.deliveryKm === 4.2 && pub.deliveryAddress.includes('305'), 'гость видит адрес, км и цену доставки');
// 3. Цена от гостя не принимается: подменённый delivery_fee игнорируется
const fake = await call('/api/orders', { method: 'POST', body: order({ deliveryFee: 0, total: 1 }) });
ok(fake.data?.total === dish.price + 40000, 'цену доставки считает только сервер');
// 4. Бесплатно от 250 000 за блюда
const qty = Math.ceil(250000 / dish.price);
const free = await call('/api/orders', { method: 'POST', body: order({ items: [{ dishId: dish.id, qty }] }) });
ok(free.status === 201 && free.data.total === dish.price * qty, `от 250 000 доставка бесплатная: ${free.data?.total}`);
// 5. Дальше радиуса
const far = await call('/api/orders', { method: 'POST', body: order({ delivery: { address: 'Cam Ranh', ...north(12) } }) });
ok(far.status === 409 && far.data.error === 'DELIVERY_TOO_FAR' && far.data.km === 12, `12 км — отказ ${far.data?.error}`);
// 6. Без точки
const nop = await call('/api/orders', { method: 'POST', body: order({ delivery: { address: 'где-то' } }) });
ok(nop.status === 409 && nop.data.error === 'DELIVERY_NO_POINT', 'без точки на карте — отказ');
// 7. Алкоголь на доставку нельзя
if (alco) {
  const al = await call('/api/orders', { method: 'POST', body: order({ items: [{ dishId: alco.id, qty: 1 }] }) });
  ok(al.status === 409 && al.data.error === 'ALCOHOL_NOT_ALLOWED', 'алкоголь с доставкой — отказ');
}
// 8. Минимальная сумма
await put({ enabled: true, min_order: dish.price + 1 });
const min = await call('/api/orders', { method: 'POST', body: order() });
ok(min.status === 409 && min.data.error === 'DELIVERY_MIN_ORDER' && min.data.min === dish.price + 1, 'меньше минимальной суммы — отказ');
// 9. Слишком рано (меньше 40 минут) — через проверку времени
const today = (await call('/api/slots?type=delivery')).data;
const soon = today.slots.find((s) => s.state === 'too_soon');
if (soon) {
  const r = await call('/api/orders', { method: 'POST', body: order({ slot: `${today.day} ${soon.time}` }) });
  ok(r.status === 409 && r.data.error === 'SLOT_TOO_SOON', 'время раньше чем через 40 минут — отказ');
}
// 10. Выключили доставку
await put({ enabled: false, min_order: 0 });
menu = (await call('/api/menu')).data;
ok(!menu.location.orderTypes.includes('delivery') && menu.location.delivery === null, 'выключенная доставка пропала из меню');
const off = await call('/api/orders', { method: 'POST', body: order() });
ok(off.status === 409 && off.data.error === 'DELIVERY_OFF', 'выключенную доставку сервер не принимает');
ok((await call('/api/slots?type=delivery')).status === 400, 'время для выключенной доставки не выдаётся');
// 11. Неверные настройки
ok((await put({ radius_km: 0 })).status === 400, 'радиус 0 не сохраняется');
await put({ enabled: true, min_order: 0 });
// 12. Сотрудник видит адрес и ссылку на карту
const staff = (await call('/api/staff/orders', { cookie })).data.orders.find((o) => o.id === a.data.number);
ok(staff && staff.deliveryAddress.includes('305') && staff.deliveryMap.startsWith('https://www.google.com/maps/') && staff.deliveryFee === 40000, 'сотрудник видит адрес, точку и цену');
// 13. Статусы: оплата → готовить → отдать курьеру → доставлен
for (const act of ['confirm_payment', 'start_cooking', 'mark_ready', 'complete']) {
  const r = await call(`/api/staff/orders/${a.data.number}/action`, { method: 'POST', cookie, body: { action: act } });
  ok(r.status === 200, `действие ${act}: ${r.data?.status}`);
}

console.log(fails ? `\n${fails} проверок не прошли` : '\nВсе проверки доставки прошли');
process.exit(fails ? 1 : 0);
