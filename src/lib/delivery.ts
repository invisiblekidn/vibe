// Доставка только по зданию «Наполеон» (Napoleon Castle 1, 25–26 Nguyễn Đình Chiểu — там же, где ресторан).
// Решение Aleks 25.11.2026: гость указывает этаж и квартиру, карты и километров нет;
// доставка по зданию бесплатная, минимальная сумма блюд 100 000 ₫, привозим не раньше чем через 20 минут.
// Цену и минимум сотрудник меняет во вкладке «Доставка». Считается только на сервере; сайт показывает то же заранее.
import { OrderError } from './pricing';

export interface DeliverySettings {
  /** Цена доставки по зданию (0 — бесплатно). */
  fee: number;
  /** Минимальная сумма блюд для доставки (0 — без минимума). */
  min_order: number;
}

/** Здание, куда возим. */
export const BUILDING = 'Napoleon Castle 1';
export const BUILDING_RU = 'Наполеон';
/** Этажи здания: 1–3 — магазины и общие зоны, 4–40 — квартиры, 41 — крыша. */
export const FLOOR_MIN = 1;
export const FLOOR_MAX = 41;

export interface Apartment {
  floor: number;
  apt: string;
}

/** Проверяет этаж и номер квартиры от гостя. null — не заполнено или неверно. */
export function cleanApartment(v: unknown): Apartment | null {
  const o = (v ?? {}) as { floor?: unknown; apt?: unknown };
  const floor = typeof o.floor === 'string' ? Number(o.floor.trim()) : o.floor;
  if (!Number.isInteger(floor) || (floor as number) < FLOOR_MIN || (floor as number) > FLOOR_MAX) return null;
  const apt = typeof o.apt === 'string' ? o.apt.trim().replace(/\s+/g, ' ') : typeof o.apt === 'number' ? String(o.apt) : '';
  if (!/^[0-9A-Za-z][0-9A-Za-z.\-/ ]{0,9}$/.test(apt)) return null;
  return { floor: floor as number, apt };
}

/** Строка для курьера и чека: «Наполеон, этаж 12, кв. 1206». */
export const apartmentText = (a: Apartment) => `${BUILDING_RU}, этаж ${a.floor}, кв. ${a.apt}`;

export type DeliveryQuote = { fee: number };

/**
 * Проверяет квартиру и сумму блюд и считает цену доставки.
 * Ошибки: DELIVERY_NO_APT, DELIVERY_MIN_ORDER.
 */
export function quoteDelivery(s: DeliverySettings, to: Apartment | null, subtotal: number): DeliveryQuote {
  if (!to) throw new OrderError('DELIVERY_NO_APT');
  if (s.min_order > 0 && subtotal < s.min_order) throw new OrderError('DELIVERY_MIN_ORDER', { min: s.min_order });
  return { fee: s.fee };
}

export interface Point {
  lat: number;
  lng: number;
}

/** Ссылка на точку для курьера (у старых заказов с картой). */
export const mapLink = (p: Point) => `https://www.google.com/maps/search/?api=1&query=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

/** Настройки доставки из панели: проверка того, что ввёл сотрудник. null — ввод неверный. */
export function cleanSettings(v: any): (DeliverySettings & { enabled: boolean }) | null {
  if (!v || typeof v !== 'object') return null;
  const int = (x: unknown, max: number) => (Number.isInteger(x) && (x as number) >= 0 && (x as number) <= max ? (x as number) : null);
  const fee = int(v.fee, 2_000_000);
  const min = int(v.min_order, 100_000_000);
  if (fee === null || min === null) return null;
  return { enabled: !!v.enabled, fee, min_order: min };
}
