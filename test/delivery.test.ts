import { describe, expect, it } from 'vitest';
import { apartmentText, cleanApartment, cleanSettings, quoteDelivery, type DeliverySettings } from '../src/lib/delivery';
import { OrderError } from '../src/lib/pricing';
import { guestEventText, staffButtons, staffOrderText } from '../src/lib/telegram';

const S: DeliverySettings = { fee: 0, min_order: 100000 };
const apt = { floor: 12, apt: '05' };
const code = (f: () => unknown) => {
  try {
    f();
  } catch (e) {
    return e instanceof OrderError ? e.code : 'OTHER';
  }
  return null;
};

describe('доставка по зданию «Наполеон»', () => {
  it('этаж и квартира проверяются', () => {
    expect(cleanApartment({ floor: 12, apt: '05' })).toEqual(apt);
    expect(cleanApartment({ floor: '12', apt: ' 5 ' })).toEqual(apt);
    expect(cleanApartment({ floor: 43, apt: '18' })).toEqual({ floor: 43, apt: '18' });
    expect(cleanApartment({ floor: 0, apt: '05' })).toBeNull();
    expect(cleanApartment({ floor: 44, apt: '05' })).toBeNull();
    expect(cleanApartment({ floor: 12.5, apt: '05' })).toBeNull();
    expect(cleanApartment({ floor: 12, apt: '1206' })).toBeNull();
    expect(cleanApartment({ floor: 12, apt: '00' })).toBeNull();
    expect(cleanApartment({ floor: 12, apt: '' })).toBeNull();
    expect(cleanApartment({ floor: 12, apt: '<b>' })).toBeNull();
    expect(cleanApartment({ floor: 12, apt: '12345678901' })).toBeNull();
    expect(cleanApartment(null)).toBeNull();
    // Старый сайт (карта) присылает адрес и точку — такой заказ не пройдёт.
    expect(cleanApartment({ address: 'Hòn Chồng', lat: 12.27, lng: 109.2 })).toBeNull();
  });

  it('строка для курьера', () => {
    expect(apartmentText(apt)).toBe('Наполеон, этаж 12, кв. 05');
  });

  it('бесплатно, минимум 100 000 за блюда', () => {
    expect(quoteDelivery(S, apt, 100000)).toEqual({ fee: 0 });
    expect(code(() => quoteDelivery(S, apt, 99000))).toBe('DELIVERY_MIN_ORDER');
    expect(code(() => quoteDelivery(S, null, 200000))).toBe('DELIVERY_NO_APT');
    expect(quoteDelivery({ fee: 10000, min_order: 0 }, apt, 1)).toEqual({ fee: 10000 });
  });

  it('настройки из панели проверяются', () => {
    expect(cleanSettings({ enabled: true, fee: 0, min_order: 100000 })).toEqual({ enabled: true, fee: 0, min_order: 100000 });
    expect(cleanSettings({ enabled: true, fee: -1, min_order: 0 })).toBeNull();
    expect(cleanSettings({ enabled: true, fee: 1.5, min_order: 0 })).toBeNull();
    expect(cleanSettings({ enabled: true, fee: 0 })).toBeNull();
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
  it('в группе сотрудников: квартира в «Наполеоне», без карты', () => {
    const txt = staffOrderText({ ...o, delivery_fee: 0, delivery_address: 'Наполеон, этаж 12, кв. 05', delivery_lat: null, delivery_lng: null, delivery_km: null }, '2026-11-20');
    expect(txt).toContain('🏢 <b>Наполеон, этаж 12, кв. 05</b>');
    expect(txt).toContain('Доставка бесплатно');
    expect(txt).not.toContain('maps');
  });
  it('без телефона: подсказка, где связаться', () => {
    expect(staffOrderText({ ...o, guest_phone: '', tg_user_id: 42 }, '2026-11-20')).toContain('Анна · <i>без телефона, пишите в чате бота</i>');
    expect(staffOrderText({ ...o, guest_phone: '' }, '2026-11-20')).toContain('без телефона, гость не в Telegram');
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
