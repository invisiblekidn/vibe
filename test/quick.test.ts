import { describe, expect, it } from 'vitest';
import type { MenuIndex } from '../src/lib/pricing';
import {
  addToCart,
  cartParam,
  cartTotal,
  confirmScreen,
  nextRequiredGroup,
  parseCart,
  parseQuickCallback,
  quickScreen,
  repeatCart,
  repeatScreen,
  timeScreen,
  typeScreen,
  undoLast,
} from '../src/lib/quick';
import type { SlotInfo } from '../src/lib/time';

const menu: MenuIndex = {
  dishes: new Map([
    ['borsch', { id: 'borsch', name: { ru: 'Борщ с говядиной', en: 'Borscht' } as Record<string, string>, price: 139000, active: true, is_alcohol: false }],
    ['syrniki', { id: 'syrniki', name: { ru: 'Сырники' }, price: 119000, active: true, is_alcohol: false }],
    ['blinchiki', { id: 'blinchiki', name: { ru: 'Блинчики' }, price: 139000, active: true, is_alcohol: false }],
    ['mojito', { id: 'mojito', name: { ru: 'Мохито' }, price: 129000, active: true, is_alcohol: true }],
    ['old', { id: 'old', name: { ru: 'Старое' }, price: 1000, active: false, is_alcohol: false }],
  ]),
  groupsByDish: new Map([
    ['syrniki', [{ id: 'sauce', dish_id: 'syrniki', name: { ru: 'Соус' }, min_select: 1, max_select: 1 }]],
    ['blinchiki', [{ id: 'fill', dish_id: 'blinchiki', name: { ru: 'Начинка' }, min_select: 1, max_select: 1 }]],
  ]),
  options: new Map([
    ['cond', { id: 'cond', group_id: 'sauce', name: { ru: 'Сгущёнка' }, price_delta: 0, active: true }],
    ['tvorog', { id: 'tvorog', group_id: 'fill', name: { ru: 'с творогом' }, price_delta: 0, active: true }],
    ['meat', { id: 'meat', group_id: 'fill', name: { ru: 'с мясом' }, price_delta: 20000, active: true }],
  ]),
};
const menuBtn = { text: '🍽 Открыть меню', web_app: { url: 'https://x/?tg=1' } };
const allData = (rows: { callback_data?: string }[][]) => rows.flat().map((b) => b.callback_data).filter(Boolean);

describe('корзина в чате бота', () => {
  it('повторное нажатие добавляет порцию, «убрать последнее» снимает одну', () => {
    let c = addToCart([], 'borsch');
    c = addToCart(c, 'syrniki', ['cond']);
    c = addToCart(c, 'syrniki', ['cond']);
    expect(c).toEqual([
      { dishId: 'borsch', qty: 1, optionIds: [] },
      { dishId: 'syrniki', qty: 2, optionIds: ['cond'] },
    ]);
    expect(cartTotal(menu, c)).toBe(377000);
    c = undoLast(c);
    expect(c[1].qty).toBe(1);
    c = undoLast(undoLast(c));
    expect(c).toEqual([]);
  });

  it('то же блюдо с другой опцией — отдельная строка, не больше 20 порций', () => {
    let c = addToCart([], 'blinchiki', ['tvorog']);
    c = addToCart(c, 'blinchiki', ['meat']);
    expect(c.length).toBe(2);
    for (let i = 0; i < 30; i++) c = addToCart(c, 'borsch');
    expect(c.find((i) => i.dishId === 'borsch')!.qty).toBe(20);
  });

  it('сохранённая корзина читается безопасно', () => {
    expect(parseCart('not json')).toEqual([]);
    expect(parseCart('[{"dishId":"borsch","qty":2,"optionIds":["x"]},{"dishId":"<script>","qty":1}]')).toEqual([{ dishId: 'borsch', qty: 2, optionIds: ['x'] }]);
  });

  it('корзина передаётся в окно меню короткой строкой', () => {
    expect(cartParam([{ dishId: 'borsch', qty: 1, optionIds: [] }, { dishId: 'blinchiki', qty: 2, optionIds: ['tvorog'] }])).toBe('borsch*1,blinchiki*2*tvorog');
  });

  it('обязательный выбор спрашивается, пока не выбран', () => {
    const g = menu.groupsByDish.get('blinchiki')!;
    expect(nextRequiredGroup(g, [], menu.options)?.id).toBe('fill');
    expect(nextRequiredGroup(g, ['tvorog'], menu.options)).toBeNull();
    expect(nextRequiredGroup(menu.groupsByDish.get('borsch') ?? [], [], menu.options)).toBeNull();
  });
});

describe('кнопки', () => {
  it('разбираются только свои короткие коды', () => {
    expect(parseQuickCallback('q:a:borsch')).toEqual({ k: 'a', id: 'borsch' });
    expect(parseQuickCallback('q:t:v')).toEqual({ k: 't', type: 'visit' });
    expect(parseQuickCallback('q:s:1230')).toEqual({ k: 's', time: '12:30' });
    expect(parseQuickCallback('q:d:2026-11-16')).toEqual({ k: 'd', day: '2026-11-16' });
    expect(parseQuickCallback('q:ok')).toEqual({ k: 'ok' });
    expect(parseQuickCallback('q:a:bad id')).toBeNull();
    expect(parseQuickCallback('o:1:cp')).toBeNull();
  });

  it('все callback_data укладываются в 64 байта', () => {
    const long = 'x'.repeat(40);
    for (const d of [`q:a:${long}`, `q:da:${long}`, `q:o:${long}`, 'q:d:2026-11-16', 'q:sp:12', 'q:s:2130']) expect(new TextEncoder().encode(d).length).toBeLessThanOrEqual(64);
  });
});

describe('экраны', () => {
  const dishes = [
    { id: 'borsch', name: 'Борщ с говядиной', price: 139000, isDay: true },
    { id: 'syrniki', name: 'Сырники', price: 119000, isDay: false },
  ];

  it('быстрый заказ: блюда с ценой и отметкой количества, «Оформить» только с корзиной', () => {
    const empty = quickScreen('ru', dishes, [], menu, menuBtn);
    expect(empty.rows[0][0].text).toBe('⭐ Борщ с говядиной · 139 000');
    expect(allData(empty.rows)).not.toContain('q:go');
    const full = quickScreen('ru', dishes, [{ dishId: 'borsch', qty: 1, optionIds: [] }, { dishId: 'syrniki', qty: 2, optionIds: ['cond'] }], menu, menuBtn);
    expect(full.rows[1][0].text).toBe('⭐ Сырники · 119 000 ✓2');
    expect(full.text).toContain('Борщ с говядиной ×1, Сырники (Сгущёнка) ×2');
    expect(full.text).toContain('377 000 ₫');
    expect(allData(full.rows)).toEqual(expect.arrayContaining(['q:undo', 'q:clr', 'q:go']));
    expect(full.rows.at(-1)![0].web_app).toBeTruthy();
  });

  it('блюдо на стопе остаётся в списке с пометкой, без цены', () => {
    const s = quickScreen('ru', [dishes[0], { ...dishes[1], stopped: true }], [], menu, menuBtn);
    expect(s.rows[1][0].text).toBe('🚫 Сырники · на стопе');
    expect(s.rows[1][0].callback_data).toBe('q:a:syrniki');
    expect(quickScreen('en', [{ ...dishes[1], stopped: true }], [], menu, menuBtn).rows[0][0].text).toBe('🚫 Сырники · unavailable');
  });

  it('пустой список — подсказка и кнопка меню', () => {
    const s = quickScreen('vi', [], [], menu, menuBtn);
    expect(s.text).toContain('Đặt nhanh');
    expect(s.rows).toEqual([[menuBtn]]);
  });

  it('с алкоголем остаётся только «К визиту»', () => {
    expect(allData(typeScreen('ru', false, null).rows)).toEqual(['q:t:p', 'q:t:v', 'q:l']);
    const a = typeScreen('ru', true, null);
    expect(allData(a.rows)).toEqual(['q:t:v', 'q:l']);
    expect(a.text).toContain('только к визиту');
  });

  it('время: только свободные интервалы, по 8 на страницу, ближайшее в заголовке', () => {
    const slots: SlotInfo[] = ['09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00'].map((time, i) => ({
      time,
      state: i < 2 ? 'too_soon' : i === 5 ? 'full' : 'free',
      left: i === 5 ? 0 : 5,
    }));
    const days = ['2026-11-15', '2026-11-16', '2026-11-17'];
    const p0 = timeScreen('ru', 'pickup', '2026-11-15', days, slots, 0);
    expect(p0.text).toContain('сегодня 10:30');
    const times = p0.rows.slice(1).flat().map((b) => b.text);
    expect(times).not.toContain('12:00');
    expect(times).not.toContain('09:30');
    expect(times.filter((t) => /^\d\d:\d\d$/.test(t)).length).toBe(8);
    expect(allData(p0.rows)).toContain('q:sp:1');
    const p1 = timeScreen('ru', 'pickup', '2026-11-15', days, slots, 1);
    expect(p1.rows.flat().map((b) => b.text)).toContain('15:00');
    const none = timeScreen('ru', 'visit', '2026-11-15', days, slots.map((s) => ({ ...s, state: 'full' as const })), 0);
    expect(none.text).toContain('свободного времени уже нет');
  });

  it('проверка заказа: позиции, вид, время, итог и кнопка «Подтвердить»', () => {
    const s = confirmScreen('ru', [{ name: 'Борщ с говядиной', qty: 1, lineTotal: 139000 }], 139000, '🥡 Самовывоз', '2026-11-15 12:00', '2026-11-15', menuBtn);
    expect(s.text).toContain('Борщ с говядиной ×1 — 139 000 ₫');
    expect(s.text).toContain('сегодня в 12:00');
    expect(s.rows[0][0].callback_data).toBe('q:ok');
    expect(s.rows[2][0].callback_data).toBe('q:d:2026-11-15');
  });
});

describe('повтор прошлого заказа', () => {
  const past = [
    { dish_id: 'borsch', name: 'Борщ с говядиной', qty: 2, unit_price: 135000, options: [] },
    { dish_id: 'blinchiki', name: 'Блинчики', qty: 1, unit_price: 139000, options: [{ id: 'tvorog', name: 'с творогом' }] },
    { dish_id: 'syrniki', name: 'Сырники', qty: 1, unit_price: 119000, options: [{ id: 'gone-opt', name: 'Старый соус' }] },
    { dish_id: 'mojito', name: 'Мохито', qty: 1, unit_price: 129000, options: [] },
    { dish_id: 'old', name: 'Старое', qty: 1, unit_price: 1000, options: [] },
  ];

  it('берёт сегодняшние цены, убирает недоступное и объясняет почему', () => {
    const r = repeatCart(past, menu, new Set(['mojito']), 'ru');
    expect(r.items).toEqual([
      { dishId: 'borsch', qty: 2, optionIds: [] },
      { dishId: 'blinchiki', qty: 1, optionIds: ['tvorog'] },
    ]);
    expect(r.notes).toEqual(
      expect.arrayContaining([
        { kind: 'price', name: 'Борщ с говядиной', was: 135000, now: 139000 },
        { kind: 'gone', name: 'Сырники', qty: 1, why: 'changed' },
        { kind: 'gone', name: 'Мохито', qty: 1, why: 'sold_out' },
        { kind: 'gone', name: 'Старое', qty: 1, why: 'unavailable' },
      ]),
    );
    const s = repeatScreen('ru', 7, '10.11', r.items, r.notes, menu, menuBtn);
    expect(s.text).toContain('Ваш заказ №7 от 10.11');
    expect(s.text).toContain('<s>Мохито ×1</s> <i>сейчас на стопе</i>');
    expect(s.text).toContain('Итого сейчас <b>417 000 ₫</b>');
    expect(s.text).toContain('было 135 000 ₫, сейчас 139 000 ₫');
    expect(s.rows[0][0]).toEqual({ text: 'Оформить · 417 000 ₫', callback_data: 'q:go' });
  });

  it('если сегодня ничего нельзя — без кнопки «Оформить»', () => {
    const r = repeatCart([past[3]], menu, new Set(['mojito']), 'ru');
    const s = repeatScreen('en', 3, '01.11', r.items, r.notes, menu, menuBtn);
    expect(allData(s.rows)).not.toContain('q:go');
    expect(s.text).toContain('None of the dishes');
  });
});
