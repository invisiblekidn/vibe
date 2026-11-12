import { describe, expect, it } from 'vitest';
import { botLang, guestEventText, slotText, parseCallback, parseStaffList, signInitData, staffButtons, staffOrderText, verifyInitData } from '../src/lib/telegram';

const TOKEN = '123456:TEST-token';
const NOW = Date.UTC(2026, 10, 10, 8, 0);
const user = JSON.stringify({ id: 777, first_name: 'Мария' });

describe('вход из Mini App', () => {
  it('принимает данные, подписанные нашим ботом', async () => {
    const init = await signInitData({ auth_date: String(NOW / 1000 - 60), query_id: 'AAA', user }, TOKEN);
    expect(await verifyInitData(init, TOKEN, NOW)).toMatchObject({ id: 777, first_name: 'Мария' });
  });

  it('отклоняет подделку, чужой бот и устаревшие данные', async () => {
    const init = await signInitData({ auth_date: String(NOW / 1000 - 60), user }, TOKEN);
    const forged = init.replace('777', '778');
    expect(await verifyInitData(forged, TOKEN, NOW)).toBeNull();
    expect(await verifyInitData(init, '999:other', NOW)).toBeNull();
    const old = await signInitData({ auth_date: String(NOW / 1000 - 2 * 86400), user }, TOKEN);
    expect(await verifyInitData(old, TOKEN, NOW)).toBeNull();
    expect(await verifyInitData('', TOKEN, NOW)).toBeNull();
  });
});

describe('группа сотрудников', () => {
  const o = { id: 12, type: 'pickup', slot: '2026-11-10 15:00', status: 'new', payment_status: 'reported', payment_method: 'qr', total: 238000,
    guest_name: 'Анна <b>', guest_phone: '+84 905', comment: null, channel: 'telegram', items: [{ name: 'Сырники', qty: 2, options: [{ name: 'Сгущёнка' }] }] };

  it('список сотрудников из настройки', () => {
    const m = parseStaffList('111:Аня, 222:Иван ,bad, 0:x');
    expect([...m.entries()]).toEqual([[111, 'Аня'], [222, 'Иван']]);
  });

  it('пока оплата не подтверждена, кнопки «Готовить» нет', () => {
    const b = staffButtons(o).flat().map((x) => x.callback_data);
    expect(b).toEqual(['o:12:cp', 'o:12:cx?']);
    const paid = staffButtons({ ...o, payment_status: 'confirmed' }).flat().map((x) => x.callback_data);
    expect(paid).toEqual(['o:12:sc', 'o:12:cx?']);
    expect(staffButtons({ ...o, status: 'completed' })).toEqual([]);
    expect(staffButtons(o, true).flat().map((x) => x.callback_data)).toEqual(['o:12:cx', 'o:12:back']);
  });

  it('разбор нажатий и защита от мусора', () => {
    expect(parseCallback('o:12:cp')).toEqual({ orderId: 12, code: 'cp' });
    expect(parseCallback('o:12:cx?')).toEqual({ orderId: 12, code: 'cx?' });
    expect(parseCallback('o:12:drop')).toBeNull();
    expect(parseCallback(undefined)).toBeNull();
  });

  it('карточка заказа: «сообщил об оплате» отдельно от «подтверждена», имя экранировано', () => {
    const t = staffOrderText(o, '2026-11-10');
    expect(t).toContain('Заказ №12');
    expect(t).toContain('сегодня в 15:00');
    expect(t).toContain('238 000 ₫');
    expect(t).toContain('гость сообщил об оплате');
    expect(t).not.toContain('подтверждена');
    expect(t).toContain('Анна &lt;b&gt;');
  });

  it('сообщения гостю', () => {
    expect(guestEventText('payment_reported', o)).toContain('Оплата проверяется');
    expect(guestEventText('payment_confirmed', o)).toContain('Оплата подтверждена');
    expect(guestEventText('ready', { ...o, type: 'visit' })).toContain('стол готов');
    expect(guestEventText('noop', o)).toBeNull();
  });

  it('сообщения гостю на языке заказа', () => {
    expect(guestEventText('payment_confirmed', o, undefined, 'vi')).toContain('Đã xác nhận thanh toán');
    expect(guestEventText('ready', { ...o, type: 'visit' }, undefined, 'en')).toContain('Your table is ready');
    expect(guestEventText('created', o, undefined, 'en')).not.toMatch(/[А-Яа-я]/);
    expect(slotText('2026-11-13 16:00', '2026-11-12', 'vi')).toBe('16:00 ngày mai');
    expect(slotText('2026-11-20 09:30', '2026-11-12', 'en')).toBe('20 November at 09:30');
  });

  it('язык гостя по настройкам Telegram', () => {
    expect(botLang('vi')).toBe('vi');
    expect(botLang('uk')).toBe('ru');
    expect(botLang('ko')).toBe('en');
    expect(botLang(undefined)).toBe('ru');
  });
});
