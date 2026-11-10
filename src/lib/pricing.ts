// Расчёт корзины на сервере. Клиенту не доверяем: цены, опции и наличие берём только из меню.

export type I18n = Record<string, string>;

export interface Dish {
  id: string;
  name: I18n;
  price: number;
  active: boolean;
  is_alcohol: boolean;
}

export interface OptionGroup {
  id: string;
  dish_id: string;
  name: I18n;
  min_select: number;
  max_select: number;
}

export interface Option {
  id: string;
  group_id: string;
  name: I18n;
  price_delta: number;
  active: boolean;
}

export interface MenuIndex {
  dishes: Map<string, Dish>;
  groupsByDish: Map<string, OptionGroup[]>;
  options: Map<string, Option>;
}

export interface CartItemInput {
  dishId: string;
  qty: number;
  optionIds?: string[];
}

export interface PricedLine {
  dishId: string;
  name: string;
  qty: number;
  unitPrice: number;
  options: { id: string; name: string; price_delta: number }[];
  lineTotal: number;
}

export type CartErrorCode =
  | 'EMPTY_CART'
  | 'BAD_INPUT'
  | 'DISH_UNAVAILABLE'
  | 'DISH_SOLD_OUT'
  | 'OPTION_INVALID'
  | 'OPTION_REQUIRED'
  | 'ALCOHOL_NOT_ALLOWED';

export class OrderError extends Error {
  constructor(public code: string, public details: Record<string, unknown> = {}) {
    super(code);
  }
}

export const MAX_QTY = 20;
export const MAX_LINES = 40;

export function pickName(n: I18n, lang: string): string {
  return n[lang] || n.ru || n.en || Object.values(n)[0] || '';
}

export function priceCart(
  items: CartItemInput[],
  menu: MenuIndex,
  soldOut: Set<string>,
  opts: { alcoholAllowed: boolean; lang: string },
): { lines: PricedLine[]; subtotal: number } {
  if (!Array.isArray(items) || items.length === 0) throw new OrderError('EMPTY_CART');
  if (items.length > MAX_LINES) throw new OrderError('BAD_INPUT', { reason: 'too_many_lines' });

  const lines: PricedLine[] = [];
  for (const it of items) {
    if (!it || typeof it.dishId !== 'string' || !Number.isInteger(it.qty) || it.qty < 1 || it.qty > MAX_QTY) {
      throw new OrderError('BAD_INPUT', { dishId: it?.dishId });
    }
    const dish = menu.dishes.get(it.dishId);
    if (!dish || !dish.active) throw new OrderError('DISH_UNAVAILABLE', { dishId: it.dishId });
    if (soldOut.has(dish.id)) throw new OrderError('DISH_SOLD_OUT', { dishId: dish.id, name: pickName(dish.name, opts.lang) });
    if (dish.is_alcohol && !opts.alcoholAllowed) {
      throw new OrderError('ALCOHOL_NOT_ALLOWED', { dishId: dish.id, name: pickName(dish.name, opts.lang) });
    }

    const groups = menu.groupsByDish.get(dish.id) ?? [];
    const optionIds = Array.from(new Set(it.optionIds ?? []));
    const chosen: Option[] = [];
    for (const oid of optionIds) {
      const o = menu.options.get(oid);
      if (!o || !o.active || !groups.some((g) => g.id === o.group_id)) {
        throw new OrderError('OPTION_INVALID', { dishId: dish.id, optionId: oid });
      }
      chosen.push(o);
    }
    for (const g of groups) {
      const n = chosen.filter((o) => o.group_id === g.id).length;
      if (n < g.min_select) throw new OrderError('OPTION_REQUIRED', { dishId: dish.id, group: pickName(g.name, opts.lang) });
      if (n > g.max_select) throw new OrderError('OPTION_INVALID', { dishId: dish.id, group: g.id });
    }

    const unitPrice = dish.price + chosen.reduce((s, o) => s + o.price_delta, 0);
    lines.push({
      dishId: dish.id,
      name: pickName(dish.name, opts.lang),
      qty: it.qty,
      unitPrice,
      options: chosen.map((o) => ({ id: o.id, name: pickName(o.name, opts.lang), price_delta: o.price_delta })),
      lineTotal: unitPrice * it.qty,
    });
  }
  return { lines, subtotal: lines.reduce((s, l) => s + l.lineTotal, 0) };
}
