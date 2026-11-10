import { describe, expect, it } from 'vitest';
import { checkSlot, daySlotTimes, orderableDays, slotsForDay, toLocal, type ScheduleSettings } from '../src/lib/time';

const S: ScheduleSettings = {
  tz_offset_min: 420,
  open_min: 540,
  close_min: 1320,
  slot_minutes: 30,
  slot_capacity: 5,
  max_days_ahead: 7,
  lead_pickup_min: 30,
  lead_visit_min: 30,
  lead_delivery_min: 40,
};

// 10.11.2026 14:52 по Нячангу = 07:52 UTC
const NOW = Date.UTC(2026, 10, 10, 7, 52);

describe('время ресторана', () => {
  it('переводит UTC в местное время Нячанга', () => {
    expect(toLocal(NOW, 420)).toMatchObject({ day: '2026-11-10' });
    expect(Math.floor(toLocal(NOW, 420).minutes)).toBe(14 * 60 + 52);
    // 23:30 UTC — уже следующий день во Вьетнаме
    expect(toLocal(Date.UTC(2026, 10, 10, 23, 30), 420).day).toBe('2026-11-11');
  });

  it('интервалы с 9:30 до 21:30 шагом 30 минут', () => {
    const t = daySlotTimes(S);
    expect(t[0]).toBe(570);
    expect(t.at(-1)).toBe(1290);
    expect(t.length).toBe(25);
  });

  it('можно заказать на сегодня и ещё 7 дней', () => {
    const d = orderableDays(NOW, S);
    expect(d).toHaveLength(8);
    expect(d[0]).toBe('2026-11-10');
    expect(d[7]).toBe('2026-11-17');
  });

  it('самовывоз не раньше чем через 30 минут, доставка через 40', () => {
    const pickup = slotsForDay('2026-11-10', NOW, S, 'pickup', {});
    expect(pickup.find((s) => s.time === '15:00')!.state).toBe('too_soon');
    expect(pickup.find((s) => s.time === '15:30')!.state).toBe('free'); // 14:52 + 30 = 15:22
    const delivery = slotsForDay('2026-11-10', NOW, S, 'delivery', {});
    expect(delivery.find((s) => s.time === '15:30')!.state).toBe('too_soon'); // 14:52 + 40 = 15:32
    expect(delivery.find((s) => s.time === '16:00')!.state).toBe('free');
  });

  it('заполненный интервал помечается занятым', () => {
    const s = slotsForDay('2026-11-11', NOW, S, 'pickup', { '12:00': 5, '12:30': 4 });
    expect(s.find((x) => x.time === '12:00')).toMatchObject({ state: 'full', left: 0 });
    expect(s.find((x) => x.time === '12:30')).toMatchObject({ state: 'free', left: 1 });
  });

  it('проверка выбранного времени на сервере', () => {
    expect(checkSlot('2026-11-10 16:00', NOW, S, 'pickup')).toBeNull();
    expect(checkSlot('2026-11-10 15:00', NOW, S, 'pickup')).toBe('SLOT_TOO_SOON');
    expect(checkSlot('2026-11-10 16:15', NOW, S, 'pickup')).toBe('SLOT_INVALID');
    expect(checkSlot('2026-11-10 22:00', NOW, S, 'pickup')).toBe('SLOT_INVALID');
    expect(checkSlot('2026-11-18 12:00', NOW, S, 'pickup')).toBe('SLOT_OUT_OF_RANGE');
    expect(checkSlot('2026-11-09 12:00', NOW, S, 'pickup')).toBe('SLOT_OUT_OF_RANGE');
    expect(checkSlot('завтра', NOW, S, 'pickup')).toBe('SLOT_INVALID');
  });
});
