// Чтение меню и настроек из D1.
import type { Dish, MenuIndex, Option, OptionGroup, I18n } from './lib/pricing';
import type { ScheduleSettings } from './lib/time';

export interface Location extends ScheduleSettings {
  id: string;
  name: string;
  address: string;
  accepting_orders: number;
  delivery_enabled: number;
  payment_qr_url: string | null;
}

const parse = (s: string | null | undefined): I18n => {
  try {
    return s ? (JSON.parse(s) as I18n) : {};
  } catch {
    return {};
  }
};

export async function getLocation(db: D1Database, id: string): Promise<Location | null> {
  return db.prepare('SELECT * FROM locations WHERE id = ?').bind(id).first<Location>();
}

export interface MenuData {
  categories: { id: string; sort: number; name: I18n }[];
  dishes: (Dish & { category_id: string; sort: number; description: I18n; photo: string | null; weight: string | null; is_kids: boolean })[];
  groups: OptionGroup[];
  options: Option[];
}

export async function loadMenu(db: D1Database): Promise<MenuData> {
  const [cats, dishes, groups, options] = await db.batch([
    db.prepare('SELECT id, sort, name FROM categories ORDER BY sort'),
    db.prepare('SELECT * FROM dishes WHERE active = 1 ORDER BY category_id, sort'),
    db.prepare('SELECT * FROM option_groups ORDER BY dish_id, sort'),
    db.prepare('SELECT * FROM options ORDER BY group_id, sort'),
  ]);
  return {
    categories: (cats.results as any[]).map((c) => ({ id: c.id, sort: c.sort, name: parse(c.name) })),
    dishes: (dishes.results as any[]).map((d) => ({
      id: d.id,
      category_id: d.category_id,
      sort: d.sort,
      name: parse(d.name),
      description: parse(d.description),
      price: d.price,
      photo: d.photo,
      weight: d.weight,
      is_kids: !!d.is_kids,
      is_alcohol: !!d.is_alcohol,
      active: !!d.active,
    })),
    groups: (groups.results as any[]).map((g) => ({
      id: g.id,
      dish_id: g.dish_id,
      name: parse(g.name),
      min_select: g.min_select,
      max_select: g.max_select,
    })),
    options: (options.results as any[]).map((o) => ({
      id: o.id,
      group_id: o.group_id,
      name: parse(o.name),
      price_delta: o.price_delta,
      active: !!o.active,
    })),
  };
}

export function indexMenu(m: MenuData): MenuIndex {
  const groupsByDish = new Map<string, OptionGroup[]>();
  for (const g of m.groups) {
    const arr = groupsByDish.get(g.dish_id) ?? [];
    arr.push(g);
    groupsByDish.set(g.dish_id, arr);
  }
  return {
    dishes: new Map(m.dishes.map((d) => [d.id, d])),
    groupsByDish,
    options: new Map(m.options.map((o) => [o.id, o])),
  };
}

export async function soldOutOn(db: D1Database, locationId: string, day: string): Promise<Set<string>> {
  const r = await db.prepare('SELECT dish_id FROM stop_list WHERE location_id = ? AND day = ?').bind(locationId, day).all<{ dish_id: string }>();
  return new Set(r.results.map((x) => x.dish_id));
}

export async function takenSlots(db: D1Database, locationId: string, day: string): Promise<Record<string, number>> {
  const r = await db
    .prepare(
      "SELECT substr(slot, 12, 5) AS t, COUNT(*) AS n FROM orders WHERE location_id = ? AND slot LIKE ? AND status != 'cancelled' GROUP BY t",
    )
    .bind(locationId, `${day} %`)
    .all<{ t: string; n: number }>();
  return Object.fromEntries(r.results.map((x) => [x.t, x.n]));
}
