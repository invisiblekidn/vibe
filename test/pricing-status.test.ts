import { describe, expect, it } from 'vitest';
import { OrderError, priceCart, type MenuIndex } from '../src/lib/pricing';
import { applyAction, guestStatus, type OrderState } from '../src/lib/status';

const menu: MenuIndex = {
  dishes: new Map([
    ['syrniki', { id: 'syrniki', name: { ru: 'Сырники' }, price: 119000, active: true, is_alcohol: false }],
    ['omelette', { id: 'omelette', name: { ru: 'Омлет' }, price: 119000, active: true, is_alcohol: false }],
    ['mojito', { id: 'mojito', name: { ru: 'Мохито' }, price: 129000, active: true, is_alcohol: true }],
    ['old', { id: 'old', name: { ru: 'Старое' }, price: 1000, active: false, is_alcohol: false }],
  ]),
  groupsByDish: new Map([
    ['syrniki', [{ id: 'sauce', dish_id: 'syrniki', name: { ru: 'Соус' }, min_select: 1, max_select: 1 }]],
    ['omelette', [{ id: 'add', dish_id: 'omelette', name: { ru: 'Добавить' }, min_select: 0, max_select: 3 }]],
  ]),
  options: new Map([
    ['cond', { id: 'cond', group_id: 'sauce', name: { ru: 'Сгущёнка' }, price_delta: 0, active: true }],
    ['jam', { id: 'jam', group_id: 'sauce', name: { ru: 'Варенье' }, price_delta: 0, active: true }],
    ['salmon', { id: 'salmon', group_id: 'add', name: { ru: 'Лосось' }, price_delta: 60000, active: true }],
    ['bacon', { id: 'bacon', group_id: 'add', name: { ru: 'Бекон' }, price_delta: 35000, active: false }],
  ]),
};
const opts = { alcoholAllowed: false, lang: 'ru' };
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as OrderError).code;
  }
  return 'OK';
};

describe('расчёт корзины на сервере', () => {
  it('считает цену из меню с добавками', () => {
    const r = priceCart(
      [
        { dishId: 'syrniki', qty: 2, optionIds: ['cond'] },
        { dishId: 'omelette', qty: 1, optionIds: ['salmon'] },
      ],
      menu,
      new Set(),
      opts,
    );
    expect(r.lines[0].lineTotal).toBe(238000);
    expect(r.lines[1].unitPrice).toBe(179000);
    expect(r.subtotal).toBe(417000);
  });

  it('отклоняет пустую корзину, неверное количество и неизвестные блюда', () => {
    expect(code(() => priceCart([], menu, new Set(), opts))).toBe('EMPTY_CART');
    expect(code(() => priceCart([{ dishId: 'omelette', qty: 0 }], menu, new Set(), opts))).toBe('BAD_INPUT');
    expect(code(() => priceCart([{ dishId: 'omelette', qty: 1.5 }], menu, new Set(), opts))).toBe('BAD_INPUT');
    expect(code(() => priceCart([{ dishId: 'nope', qty: 1 }], menu, new Set(), opts))).toBe('DISH_UNAVAILABLE');
    expect(code(() => priceCart([{ dishId: 'old', qty: 1 }], menu, new Set(), opts))).toBe('DISH_UNAVAILABLE');
  });

  it('блюдо из стоп-листа нельзя заказать', () => {
    expect(code(() => priceCart([{ dishId: 'omelette', qty: 1 }], menu, new Set(['omelette']), opts))).toBe('DISH_SOLD_OUT');
  });

  it('обязательная опция и чужие опции', () => {
    expect(code(() => priceCart([{ dishId: 'syrniki', qty: 1 }], menu, new Set(), opts))).toBe('OPTION_REQUIRED');
    expect(code(() => priceCart([{ dishId: 'syrniki', qty: 1, optionIds: ['cond', 'jam'] }], menu, new Set(), opts))).toBe('OPTION_INVALID');
    expect(code(() => priceCart([{ dishId: 'omelette', qty: 1, optionIds: ['cond'] }], menu, new Set(), opts))).toBe('OPTION_INVALID');
    expect(code(() => priceCart([{ dishId: 'omelette', qty: 1, optionIds: ['bacon'] }], menu, new Set(), opts))).toBe('OPTION_INVALID');
  });

  it('алкоголь только к визиту', () => {
    expect(code(() => priceCart([{ dishId: 'mojito', qty: 1 }], menu, new Set(), opts))).toBe('ALCOHOL_NOT_ALLOWED');
    expect(code(() => priceCart([{ dishId: 'mojito', qty: 1 }], menu, new Set(), { ...opts, alcoholAllowed: true }))).toBe('OK');
  });
});

describe('статусы заказа', () => {
  const fresh: OrderState = { status: 'new', payment_status: 'unpaid', payment_method: 'qr' };

  it('«Я оплатил» не равно «оплата подтверждена»', () => {
    const r = applyAction(fresh, 'report_payment');
    expect(r.ok && r.next.payment_status).toBe('reported');
    expect(guestStatus(r.ok ? r.next : fresh)).toBe('payment_checking');
  });

  it('кухня не начинает, пока оплату не подтвердил сотрудник', () => {
    expect(applyAction(fresh, 'start_cooking')).toEqual({ ok: false, reason: 'PAYMENT_NOT_CONFIRMED' });
    const reported: OrderState = { ...fresh, payment_status: 'reported' };
    expect(applyAction(reported, 'start_cooking')).toEqual({ ok: false, reason: 'PAYMENT_NOT_CONFIRMED' });
    const confirmed = applyAction(reported, 'confirm_payment');
    expect(confirmed.ok && guestStatus(confirmed.next)).toBe('confirmed');
    expect(confirmed.ok && applyAction(confirmed.next, 'start_cooking').ok).toBe(true);
  });

  it('повторное нажатие ничего не ломает', () => {
    const reported: OrderState = { ...fresh, payment_status: 'reported' };
    expect(applyAction(reported, 'report_payment')).toMatchObject({ ok: true, event: 'noop' });
    const confirmed: OrderState = { ...fresh, payment_status: 'confirmed' };
    expect(applyAction(confirmed, 'confirm_payment')).toMatchObject({ ok: true, event: 'noop' });
  });

  it('полный путь до выдачи', () => {
    let s: OrderState = fresh;
    for (const a of ['report_payment', 'confirm_payment', 'start_cooking', 'mark_ready', 'complete'] as const) {
      const r = applyAction(s, a);
      expect(r.ok).toBe(true);
      if (r.ok) s = r.next;
    }
    expect(guestStatus(s)).toBe('completed');
    expect(applyAction(s, 'cancel').ok).toBe(false);
  });
});
