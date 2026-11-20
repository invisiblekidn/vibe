// Доставка: расстояние, цена и проверки. Считается только на сервере; сайт показывает ту же цену заранее.
import { OrderError } from './pricing';

export interface DeliverySettings {
  /** Точка ресторана, от неё считаем километры. */
  lat: number | null;
  lng: number | null;
  radius_km: number;
  /** Базовая цена доставки и сколько километров в неё входит. */
  base_fee: number;
  base_km: number;
  /** Доплата за каждый начатый километр сверх base_km. */
  per_km: number;
  /** От этой суммы блюд доставка бесплатная (0 — бесплатной доставки нет). */
  free_from: number;
  /** Минимальная сумма блюд для доставки (0 — без минимума). */
  min_order: number;
}

export interface Point {
  lat: number;
  lng: number;
}

/** Расстояние по прямой в километрах. */
export function distanceKm(a: Point, b: Point): number {
  const R = 6371;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Округляем до 0,1 км: так же показываем гостю и сотруднику. */
export const roundKm = (km: number) => Math.round(km * 10) / 10;

/** Цена доставки по расстоянию, без учёта бесплатной доставки. 30 000 ₫ до 3 км, дальше +5 000 ₫ за каждый начатый км. */
export function feeForKm(s: DeliverySettings, km: number): number {
  const extra = Math.max(0, Math.ceil(roundKm(km) - s.base_km - 1e-9));
  return s.base_fee + extra * s.per_km;
}

export type DeliveryQuote = { km: number; fee: number; baseFee: number; free: boolean };

/**
 * Проверяет точку и сумму блюд и считает цену доставки.
 * Ошибки: DELIVERY_NO_POINT, DELIVERY_TOO_FAR, DELIVERY_MIN_ORDER.
 */
export function quoteDelivery(s: DeliverySettings, to: Point | null, subtotal: number): DeliveryQuote {
  if (!to || !validPoint(to)) throw new OrderError('DELIVERY_NO_POINT');
  if (s.lat == null || s.lng == null) throw new OrderError('DELIVERY_OFF');
  const km = roundKm(distanceKm({ lat: s.lat, lng: s.lng }, to));
  if (km > s.radius_km) throw new OrderError('DELIVERY_TOO_FAR', { km, radius: s.radius_km });
  if (s.min_order > 0 && subtotal < s.min_order) throw new OrderError('DELIVERY_MIN_ORDER', { min: s.min_order });
  const baseFee = feeForKm(s, km);
  const free = s.free_from > 0 && subtotal >= s.free_from;
  return { km, fee: free ? 0 : baseFee, baseFee, free };
}

export function validPoint(p: unknown): p is Point {
  const o = p as Point;
  return (
    !!o &&
    typeof o.lat === 'number' &&
    typeof o.lng === 'number' &&
    Number.isFinite(o.lat) &&
    Number.isFinite(o.lng) &&
    Math.abs(o.lat) <= 90 &&
    Math.abs(o.lng) <= 180
  );
}

/** Ссылка на точку для курьера: открывается в Google Картах (или в навигаторе телефона). */
export const mapLink = (p: Point) => `https://www.google.com/maps/search/?api=1&query=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

/** Настройки доставки для панели: проверка того, что ввёл сотрудник. null — ввод неверный. */
export function cleanSettings(v: any): (DeliverySettings & { enabled: boolean }) | null {
  if (!v || typeof v !== 'object') return null;
  const int = (x: unknown, max: number) => (Number.isInteger(x) && (x as number) >= 0 && (x as number) <= max ? (x as number) : null);
  const num = (x: unknown, max: number) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= max ? x : null);
  const out = {
    enabled: !!v.enabled,
    lat: num(Math.abs(v.lat), 90) === null ? null : (v.lat as number),
    lng: num(Math.abs(v.lng), 180) === null ? null : (v.lng as number),
    radius_km: num(v.radius_km, 50),
    base_fee: int(v.base_fee, 2_000_000),
    base_km: num(v.base_km, 50),
    per_km: int(v.per_km, 1_000_000),
    free_from: int(v.free_from, 100_000_000),
    min_order: int(v.min_order, 100_000_000),
  };
  if (out.lat === null || out.lng === null) return null;
  if (Object.values(out).some((x) => x === null)) return null;
  if ((out.radius_km as number) <= 0) return null;
  return out as DeliverySettings & { enabled: boolean };
}
