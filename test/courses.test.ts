import { describe, expect, it } from 'vitest';
import { applyCourseAction, courseSignature, nextWaiting, orderStatusFromCourses, planCourses } from '../src/lib/courses';
import { parseCourseCallback, staffAlertText, staffButtons, staffOrderText } from '../src/lib/telegram';

const items = [
  { dishId: 'cappuccino', qty: 2, optionIds: [], course: 1 },
  { dishId: 'borsch', qty: 1, optionIds: [], course: 2 },
  { dishId: 'kiev', qty: 1, optionIds: ['puree'], course: 3 },
];

describe('порядок подачи: проверка корзины', () => {
  it('без режима «по очереди» — всё сразу, одна подача', () => {
    expect(planCourses(items, undefined, undefined)).toEqual({ ok: true, mode: 'together', courses: [1, 1, 1], count: 1 });
  });
  it('по очереди с подтверждением этого же порядка', () => {
    expect(planCourses(items, 'courses', courseSignature(items))).toEqual({ ok: true, mode: 'courses', courses: [1, 2, 3], count: 3 });
  });
  it('без подтверждения гостя заказ не принимаем', () => {
    expect(planCourses(items, 'courses', undefined)).toEqual({ ok: false, reason: 'COURSES_NOT_CONFIRMED' });
  });
  it('корзину изменили после подтверждения — подтверждать заново', () => {
    const sig = courseSignature(items);
    const changed = items.map((i) => (i.dishId === 'borsch' ? { ...i, qty: 2 } : i));
    expect(planCourses(changed, 'courses', sig)).toEqual({ ok: false, reason: 'COURSES_NOT_CONFIRMED' });
    const moved = items.map((i) => (i.dishId === 'kiev' ? { ...i, course: 2 } : i));
    expect(planCourses(moved, 'courses', sig)).toMatchObject({ ok: false });
  });
  it('номера подач подряд с 1, целые, не больше 10', () => {
    const gap = [{ ...items[0], course: 1 }, { ...items[1], course: 3 }];
    expect(planCourses(gap, 'courses', courseSignature(gap))).toEqual({ ok: false, reason: 'BAD_COURSES' });
    const bad = [{ ...items[0], course: '1' as unknown }, items[1]];
    expect(planCourses(bad, 'courses', courseSignature(bad))).toEqual({ ok: false, reason: 'BAD_COURSES' });
    const big = [{ ...items[0], course: 11 }];
    expect(planCourses(big, 'courses', courseSignature(big))).toEqual({ ok: false, reason: 'BAD_COURSES' });
  });
  it('все блюда в одной подаче — обычный заказ «всё сразу»', () => {
    const one = items.map((i) => ({ ...i, course: 1 }));
    expect(planCourses(one, 'courses', undefined)).toMatchObject({ ok: true, mode: 'together' });
  });
});

describe('порядок подачи: статусы подач', () => {
  const c = (...st: string[]) => st.map((status, i) => ({ course: i + 1, status: status as any }));
  it('пока заказ не принят, подачи не трогаем', () => {
    expect(applyCourseAction('new', c('waiting', 'waiting'), 1, 'ready')).toEqual({ ok: false, reason: 'NOT_ACCEPTED' });
  });
  it('шеф запускает следующую подачу, перескочить нельзя', () => {
    const cs = c('served', 'waiting', 'waiting');
    expect(applyCourseAction('cooking', cs, 3, 'start')).toEqual({ ok: false, reason: 'EARLIER_COURSE_WAITING' });
    expect(applyCourseAction('cooking', cs, 2, 'start')).toEqual({ ok: true, next: 'cooking', event: 'course_started' });
    expect(nextWaiting(cs)).toBe(2);
  });
  it('шеф может начать следующую подачу заранее, пока предыдущая готовится', () => {
    expect(applyCourseAction('cooking', c('cooking', 'waiting'), 2, 'start')).toMatchObject({ ok: true, next: 'cooking' });
  });
  it('готово → подано, повторное нажатие ничего не меняет', () => {
    expect(applyCourseAction('cooking', c('cooking'), 1, 'ready')).toMatchObject({ next: 'ready', event: 'course_ready' });
    expect(applyCourseAction('ready', c('ready'), 1, 'ready')).toMatchObject({ event: 'noop' });
    expect(applyCourseAction('ready', c('ready'), 1, 'served')).toMatchObject({ next: 'served', event: 'course_served' });
    expect(applyCourseAction('cooking', c('served', 'cooking'), 1, 'served')).toMatchObject({ event: 'noop' });
    expect(applyCourseAction('cooking', c('cooking', 'waiting'), 2, 'served')).toEqual({ ok: false, reason: 'COURSE_NOT_READY' });
    expect(applyCourseAction('cooking', c('served', 'waiting'), 2, 'ready')).toEqual({ ok: false, reason: 'COURSE_NOT_STARTED' });
  });
  it('отменённый заказ закрыт', () => {
    expect(applyCourseAction('cancelled', c('cooking'), 1, 'ready')).toEqual({ ok: false, reason: 'ORDER_CLOSED' });
  });
  it('общий статус заказа по подачам', () => {
    expect(orderStatusFromCourses(c('served', 'waiting'))).toBe('cooking');
    expect(orderStatusFromCourses(c('ready', 'cooking'))).toBe('ready');
    expect(orderStatusFromCourses(c('served', 'served'))).toBe('completed');
  });
});

describe('порядок подачи: группа сотрудников', () => {
  const o = {
    id: 128, type: 'table', slot: null, status: 'cooking', table_id: '3', table_zone: 'hall',
    payment_status: 'unpaid', payment_method: 'bill', total: 727000, guest_name: '', guest_phone: '', channel: 'table',
    serve_mode: 'courses',
    courses: [{ course: 1, status: 'served' as const }, { course: 2, status: 'cooking' as const }, { course: 3, status: 'waiting' as const }],
    items: [
      { name: 'Капучино', qty: 2, options: [], course: 1 },
      { name: 'Борщ с говядиной', qty: 1, options: [], course: 2 },
      { name: 'Сырники', qty: 1, options: [], course: 3 },
    ],
  };
  it('карточка показывает блюда по подачам со статусом', () => {
    const t = staffOrderText(o);
    expect(t).toContain('Подача по очереди');
    expect(t).toContain('1️⃣ Подача 1</b> · ✔️ подано\n• Капучино ×2');
    expect(t).toContain('2️⃣ Подача 2</b> · 👩‍🍳 готовится\n• Борщ с говядиной ×1');
    expect(t).toContain('3️⃣ Подача 3</b> · ⏸ ждёт команды шефа');
    expect(t).not.toContain('Кухня:');
  });
  it('кнопки: готово у готовящейся, начать следующую, отмена', () => {
    const rows = staffButtons(o).map((r) => r.map((b) => b.callback_data));
    expect(rows).toEqual([['k:128:2:r'], ['k:128:3:s'], ['o:128:cx?']]);
    expect(parseCourseCallback('k:128:3:s')).toEqual({ orderId: 128, course: 3, action: 'start' });
    expect(parseCourseCallback('k:128:3:x')).toBeNull();
  });
  it('новый заказ по подачам принимают одной кнопкой, как обычно', () => {
    const rows = staffButtons({ ...o, status: 'new' }).map((r) => r.map((b) => b.callback_data));
    expect(rows[0]).toEqual(['o:128:sc']);
  });
  it('после подачи — напоминание шефу о следующей', () => {
    expect(staffAlertText('course_served:1', { ...o, courses: [{ course: 1, status: 'served' }, { course: 2, status: 'waiting' }] })).toContain('подача 2');
    expect(staffAlertText('course_served:3', { ...o, courses: [{ course: 1, status: 'served' }] })).toBeNull();
  });
});
