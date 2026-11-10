import { describe, expect, it } from 'vitest';
import { checkBillAction, tableOpenNow, tableOrderStatus, tableTitle } from '../src/lib/tables';
import { applyAction } from '../src/lib/status';
import { billButtons, billText, parseTableCallback, staffButtons, staffOrderText, waiterCallText } from '../src/lib/telegram';

describe('столы', () => {
  it('название стола для гостя и сотрудника', () => {
    expect(tableTitle({ id: '3', zone: 'hall' })).toBe('В зале, стол 3');
    expect(tableTitle({ id: 'У2', zone: 'outdoor' })).toBe('На улице, стол У2');
  });

  it('заказ со стола принимают одним нажатием, кухня готовит без подтверждения оплаты', () => {
    const o = { status: 'new', payment_status: 'unpaid', payment_method: 'bill' } as const;
    const r = applyAction(o, 'start_cooking');
    expect(r.ok && r.next.status).toBe('cooking');
    // Предзаказ по QR без подтверждённой оплаты на кухню не попадает, как и раньше.
    expect(applyAction({ ...o, payment_method: 'qr' }, 'start_cooking')).toEqual({ ok: false, reason: 'PAYMENT_NOT_CONFIRMED' });
  });

  it('статус заказа для гостя за столом', () => {
    expect(tableOrderStatus('new')).toBe('sent');
    expect(tableOrderStatus('completed')).toBe('served');
  });

  it('заказ со стола только в часы работы', () => {
    expect(tableOpenNow(8 * 60 + 59, 540, 1320)).toBe(false);
    expect(tableOpenNow(9 * 60, 540, 1320)).toBe(true);
    expect(tableOpenNow(22 * 60, 540, 1320)).toBe(false);
  });
});

describe('счёт стола', () => {
  const open = { status: 'open', payment_status: 'unpaid' } as const;

  it('«Я оплатил» гостя не закрывает счёт и не повторяется', () => {
    expect(checkBillAction(open, 'report_payment', 100)).toEqual({ ok: true });
    expect(checkBillAction({ ...open, payment_status: 'reported' }, 'report_payment', 100)).toEqual({ ok: true, noop: true });
    expect(checkBillAction(open, 'report_payment', 0)).toEqual({ ok: false, reason: 'BILL_EMPTY' });
  });

  it('повторное «Оплачено» ничего не меняет', () => {
    expect(checkBillAction({ status: 'paid', payment_status: 'confirmed' }, 'paid_cash', 100)).toEqual({ ok: true, noop: true });
  });

  it('«Весь стол» нельзя, пока гость уже переводит деньги по своему счёту', () => {
    expect(checkBillAction(open, 'merge_all', 100)).toEqual({ ok: true });
    expect(checkBillAction({ ...open, payment_status: 'reported' }, 'merge_all', 100)).toEqual({ ok: false, reason: 'BILL_PAYMENT_PENDING' });
    expect(checkBillAction({ status: 'merged', payment_status: 'unpaid' }, 'merge_all', 100)).toEqual({ ok: false, reason: 'BILL_MERGED' });
  });
});

describe('столы в группе сотрудников', () => {
  const o = { id: 40, type: 'table', slot: null, status: 'new', payment_status: 'unpaid', payment_method: 'bill', total: 139000,
    guest_name: 'В зале, стол 3', guest_phone: '', comment: 'без лука', channel: 'table', table_id: '3', table_zone: 'hall',
    items: [{ name: 'Борщ', qty: 1, options: [] }] };

  it('карточка заказа со стола: стол, без телефона и без оплаты по QR', () => {
    const t = staffOrderText(o);
    expect(t).toContain('В зале, стол 3');
    expect(t).toContain('по счёту в конце');
    expect(t).not.toContain('Оплата:');
    expect(staffButtons(o)[0].map((b) => b.text)).toEqual(['✅ Принять']);
    expect(staffButtons({ ...o, status: 'ready' })[0].map((b) => b.text)).toEqual(['✔️ Подано']);
  });

  it('кнопки вызова и счёта', () => {
    expect(parseTableCallback('c:5')).toEqual({ kind: 'call', id: 5 });
    expect(parseTableCallback('b:7:all')).toEqual({ kind: 'bill', id: 7, code: 'all' });
    expect(parseTableCallback('b:7:zz')).toBeNull();
    expect(billButtons({ id: 7, status: 'open' }, true).flat().map((b) => b.callback_data)).toEqual(['b:7:pq', 'b:7:pc', 'b:7:all']);
    expect(billButtons({ id: 7, status: 'paid' }, true)).toEqual([]);
    expect(waiterCallText('В зале, стол 3', 'Аня')).toContain('Идёт Аня');
    expect(billText('В зале, стол 3', { id: 7, status: 'open', payment_status: 'reported', total: 1000 })).toContain('проверьте поступление');
  });
});
