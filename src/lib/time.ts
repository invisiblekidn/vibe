// Время ресторана. Всё считаем в местном времени точки (Вьетнам: UTC+7, без летнего времени).

export interface ScheduleSettings {
  tz_offset_min: number;
  open_min: number;
  close_min: number;
  slot_minutes: number;
  slot_capacity: number;
  max_days_ahead: number;
  lead_pickup_min: number;
  lead_visit_min: number;
  lead_delivery_min: number;
}

export type OrderType = 'pickup' | 'visit' | 'delivery';

export interface LocalMoment {
  day: string; // YYYY-MM-DD
  minutes: number; // минуты от полуночи
}

const pad = (n: number) => String(n).padStart(2, '0');

export function toLocal(nowMs: number, offsetMin: number): LocalMoment {
  const d = new Date(nowMs + offsetMin * 60_000);
  return {
    day: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60,
  };
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function minutesToHHMM(min: number): string {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

export function hhmmToMinutes(s: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

export function leadFor(s: ScheduleSettings, type: OrderType): number {
  if (type === 'delivery') return s.lead_delivery_min;
  if (type === 'visit') return s.lead_visit_min;
  return s.lead_pickup_min;
}

/** Все возможные времена выдачи в течение дня: с открытия + один интервал (кухне нужно время) до закрытия − один интервал. */
export function daySlotTimes(s: ScheduleSettings): number[] {
  const out: number[] = [];
  for (let t = s.open_min + s.slot_minutes; t <= s.close_min - s.slot_minutes; t += s.slot_minutes) out.push(t);
  return out;
}

/** Дни, на которые можно заказать: сегодня и ещё max_days_ahead дней. */
export function orderableDays(nowMs: number, s: ScheduleSettings): string[] {
  const today = toLocal(nowMs, s.tz_offset_min).day;
  return Array.from({ length: s.max_days_ahead + 1 }, (_, i) => addDays(today, i));
}

export type SlotState = 'too_soon' | 'full' | 'free';

export interface SlotInfo {
  time: string; // HH:MM
  state: SlotState;
  left: number; // сколько заказов ещё можно принять
}

export function slotsForDay(
  day: string,
  nowMs: number,
  s: ScheduleSettings,
  type: OrderType,
  takenByTime: Record<string, number>,
): SlotInfo[] {
  const now = toLocal(nowMs, s.tz_offset_min);
  const lead = leadFor(s, type);
  return daySlotTimes(s).map((t) => {
    const time = minutesToHHMM(t);
    const taken = takenByTime[time] ?? 0;
    const left = Math.max(0, s.slot_capacity - taken);
    let state: SlotState = 'free';
    if (day === now.day && t < now.minutes + lead) state = 'too_soon';
    else if (left === 0) state = 'full';
    return { time, state, left };
  });
}

export type SlotError = 'SLOT_INVALID' | 'SLOT_OUT_OF_RANGE' | 'SLOT_TOO_SOON';

/** Проверка времени без учёта занятости (её проверяем атомарно при записи заказа). */
export function checkSlot(slot: string, nowMs: number, s: ScheduleSettings, type: OrderType): SlotError | null {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/.exec(slot);
  if (!m) return 'SLOT_INVALID';
  const [, day, hhmm] = m;
  const t = hhmmToMinutes(hhmm);
  if (t === null || !daySlotTimes(s).includes(t)) return 'SLOT_INVALID';
  if (!orderableDays(nowMs, s).includes(day)) return 'SLOT_OUT_OF_RANGE';
  const now = toLocal(nowMs, s.tz_offset_min);
  if (day === now.day && t < now.minutes + leadFor(s, type)) return 'SLOT_TOO_SOON';
  return null;
}
