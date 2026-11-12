// Порядок подачи при заказе со стола. Чистые функции, без базы.
// Гость раскладывает блюда по подачам 1, 2, 3…, блюда одной подачи приносят вместе.
// Подача 1 начинается, когда администратор принял заказ; следующие запускает шеф кнопкой.

export const MAX_COURSES = 10;

export type ServeMode = 'together' | 'courses';
export type CourseStatus = 'waiting' | 'cooking' | 'ready' | 'served';
export type CourseAction = 'start' | 'ready' | 'served';

export interface CourseRow {
  course: number;
  status: CourseStatus;
}

export interface CourseItemInput {
  dishId: string;
  qty: number;
  optionIds?: string[];
  course?: unknown;
}

/**
 * Подпись порядка подачи: что гость видел на экране «Проверьте порядок подачи».
 * Такая же функция есть на сайте (table.js). Сервер сверяет её с корзиной, чтобы
 * заказ не ушёл с порядком, который гость не подтверждал.
 */
export function courseSignature(items: CourseItemInput[]): string {
  return items.map((i) => `${i.dishId}*${i.qty}[${(i.optionIds ?? []).join(',')}]@${i.course}`).join('|');
}

export type CoursePlan = { ok: true; mode: ServeMode; courses: number[]; count: number } | { ok: false; reason: string };

/** Проверить подачи из корзины. Номера идут подряд с 1. Одна подача = «всё сразу». */
export function planCourses(items: CourseItemInput[], mode: unknown, confirm: unknown): CoursePlan {
  if (mode !== 'courses') return { ok: true, mode: 'together', courses: items.map(() => 1), count: 1 };
  const nums: number[] = [];
  for (const it of items) {
    const n = it?.course;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > MAX_COURSES) return { ok: false, reason: 'BAD_COURSES' };
    nums.push(n);
  }
  const count = Math.max(...nums);
  for (let k = 1; k <= count; k++) if (!nums.includes(k)) return { ok: false, reason: 'BAD_COURSES' };
  if (count === 1) return { ok: true, mode: 'together', courses: nums, count: 1 };
  if (typeof confirm !== 'string' || confirm !== courseSignature(items)) return { ok: false, reason: 'COURSES_NOT_CONFIRMED' };
  return { ok: true, mode: 'courses', courses: nums, count };
}

export type CourseTransition = { ok: true; next: CourseStatus; event: string } | { ok: false; reason: string };

/** Действие с подачей: «Начать подачу N» (шеф), «Подача N готова» (кухня), «Подача N подана» (официант). */
export function applyCourseAction(orderStatus: string, courses: CourseRow[], n: number, action: CourseAction): CourseTransition {
  if (orderStatus === 'cancelled' || orderStatus === 'completed') return { ok: false, reason: 'ORDER_CLOSED' };
  if (orderStatus === 'new') return { ok: false, reason: 'NOT_ACCEPTED' };
  const c = courses.find((x) => x.course === n);
  if (!c) return { ok: false, reason: 'NOT_FOUND' };
  const noop = { ok: true as const, next: c.status, event: 'noop' };
  switch (action) {
    case 'start':
      if (c.status !== 'waiting') return noop;
      // Нельзя перескочить через подачу: сначала запускают более раннюю.
      if (courses.some((x) => x.course < n && x.status === 'waiting')) return { ok: false, reason: 'EARLIER_COURSE_WAITING' };
      return { ok: true, next: 'cooking', event: 'course_started' };
    case 'ready':
      if (c.status === 'ready' || c.status === 'served') return noop;
      if (c.status !== 'cooking') return { ok: false, reason: 'COURSE_NOT_STARTED' };
      return { ok: true, next: 'ready', event: 'course_ready' };
    case 'served':
      if (c.status === 'served') return noop;
      if (c.status !== 'ready') return { ok: false, reason: 'COURSE_NOT_READY' };
      return { ok: true, next: 'served', event: 'course_served' };
  }
}

/** Общий статус заказа по подачам: все поданы — заказ закрыт; есть готовая — «готово, отнести»; иначе «готовится». */
export function orderStatusFromCourses(courses: CourseRow[]): 'cooking' | 'ready' | 'completed' {
  if (courses.length && courses.every((c) => c.status === 'served')) return 'completed';
  if (courses.some((c) => c.status === 'ready')) return 'ready';
  return 'cooking';
}

/** Следующая подача, которую шеф может запустить. */
export function nextWaiting(courses: CourseRow[]): number | null {
  const w = courses.filter((c) => c.status === 'waiting').map((c) => c.course);
  return w.length ? Math.min(...w) : null;
}
