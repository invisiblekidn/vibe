import { describe, expect, it } from 'vitest';
import { cleanSettings, distanceKm, feeForKm, quoteDelivery, type DeliverySettings } from '../src/lib/delivery';
import { OrderError } from '../src/lib/pricing';
import { guestEventText, staffButtons, staffOrderText } from '../src/lib/telegram';

const S: DeliverySettings = { lat: 12.2697605, lng: 109.2015646, radius_km: 10, base_fee: 30000, base_km: 3, per_km: 5000, free_from: 250000, min_order: 0 };
const home = { lat: S.lat!, lng: S.lng! };
/** Точка на север от ресторана на km километров. */
const north = (km: number) => ({ lat: home.lat + km / 111.195, lng: home.lng });
const code = (f: () => unknown) => {
  try {
    f();
  } catch (e) {
    return e instanceof OrderError ? e.code : 'OTHER';
  }
  return null;
};

describe('доставка: тариф', () => {
  it('до 3 км — 30 000, дальше +5 000 за каждый начатый км', () => {
    expect(feeForKm(S, 0.5)).toBe(30000);
    expect(feeForKm(S, 3)).toBe(30000);
    expect(feeForKm(S, 3.1)).toBe(35000);
    expect(feeForKm(S, 4)).toBe(35000);
    expect(feeForKm(S, 4.2)).toBe(40000);
    expect(feeForKm(S, 10)).toBe(65000);
  });

  it('расстояние по прямой', () => {
    expect(distanceKm(home, north(5))).toBeCloseTo(5, 2);
  });

  it('считает цену по точке и бесплатно от 250 000 за блюда', () => {
    expect(quoteDelivery(S, north(4.2), 100000)).toEqual({ km: 4.2, fee: 40000, baseFee: 40000, free: false });
    expect(quoteDelivery(S, north(4.2), 250000)).toMatchObject({ fee: 0, free: true, baseFee: 40000 });
    expect(quoteDelivery({ ...S, free_from: 0 }, north(1), 999999)).toMatchObject({ fee: 30000, free: false });
  });

  it('дальше радиуса, без точки и меньше минимальной суммы — ошибка', () => {
    expect(code(() => quoteDelivery(S, north(10.4), 100000))).toBe('DELIVERY_TOO_FAR');
    expect(code(() => quoteDelivery(S, north(9.9), 100000))).toBeNull();
    expect(code(() => quoteDelivery(S, null, 100000))).toBe('DELIVERY_NO_POINT');
    expect(code(() => quoteDelivery(S, { lat: NaN, lng: 1 }, 100000))).toBe('DELIVERY_NO_POINT');
    expect(code(() => quoteDelivery({ ...S, min_order: 150000 }, north(1), 149000))).toBe('DELIVERY_MIN_ORDER');
    expect(code(() => quoteDelivery({ ...S, min_order: 150000 }, north(1), 150000))).toBeNull();
  });

  it('настройки из панели проверяются', () => {
    const ok = cleanSettings({ enabled: true, ...S });
    expect(ok).toMatchObject({ enabled: true, base_fee: 30000 });
    expect(cleanSettings({ enabled: true, ...S, radius_km: 0 })).toBeNull();
    expect(cleanSettings({ enabled: true, ...S, base_fee: -1 })).toBeNull();
    expect(cleanSettings({ enabled: true, ...S, base_fee: 1.5 })).toBeNull();
    expect(cleanSettings({ enabled: true, ...S, lat: 'x' })).toBeNull();
  });
});

describe('доставка: сообщения', () => {
  const o = {
    id: 12, type: 'delivery', slot: '2026-11-20 12:30', status: 'cooking', payment_status: 'confirmed', payment_method: 'qr', total: 140000,
    guest_name: 'Анна', guest_phone: '+84 90 000 00 00', channel: 'site', items: [{ name: 'Борщ', qty: 1, options: [] }],
    delivery_fee: 40000, delivery_address: 'Hòn Chồng, отель Sea <b>', delivery_lat: 12.27, delivery_lng: 109.2, delivery_km: 4.2,
  };
  it('в группе сотрудников: адрес, точка на карте, км и цена', () => {
    const txt = staffOrderText(o, '2026-11-20');
    expect(txt).toContain('Доставка · сегодня в 12:30');
    expect(txt).toContain('🛵 <b>Hòn Chồng, отель Sea &lt;b&gt;</b>');
    expect(txt).toContain('https://www.google.com/maps/search/?api=1&query=12.270000,109.200000');
    expect(txt).toContain('4,2 км · доставка 40 000 ₫');
  });
  it('кнопки для доставки: «Отдать курьеру», потом «Доставлен»', () => {
    expect(staffButtons(o)[0].map((b) => b.text)).toEqual(['🛵 Отдать курьеру']);
    expect(staffButtons({ ...o, status: 'ready' })[0].map((b) => b.text)).toEqual(['✔️ Доставлен']);
  });
  it('гостю: «в пути» и «доставлен»', () => {
    expect(guestEventText('ready', o, undefined, 'ru')).toContain('в пути');
    expect(guestEventText('completed', o, undefined, 'vi')).toContain('đã giao xong');
    expect(guestEventText('ready', { ...o, type: 'pickup' }, undefined, 'ru')).toContain('на кассе');
  });
});
