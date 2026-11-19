// Заказ со стола: названия столов, правила счёта. Чистые функции, без базы.

export type Zone = 'hall' | 'outdoor';

export interface TableRow {
  id: string;
  zone: Zone | string;
}

/** «В зале, стол 3» / «На улице, стол У2». */
export function tableTitle(t: TableRow | null | undefined): string {
  if (!t) return 'Стол';
  return `${t.zone === 'outdoor' ? 'На улице' : 'В зале'}, стол ${t.id}`;
}

export const DEVICE_RE = /^[A-Za-z0-9-]{16,80}$/;
export const TABLE_CODE_RE = /^[a-z0-9]{4,16}$/;

/** Открытый счёт старше этого считаем забытым: следующий заказ с телефона откроет новый. */
export const BILL_STALE_MS = 16 * 3600_000;

export type BillStatus = 'open' | 'merged' | 'paid' | 'closed';
export type BillPayment = 'unpaid' | 'reported' | 'confirmed';

export interface BillState {
  status: BillStatus;
  payment_status: BillPayment;
}

export type BillAction = 'report_payment' | 'paid_qr' | 'paid_cash' | 'merge_all';

export type BillCheck = { ok: true; noop?: boolean } | { ok: false; reason: string };

/** Можно ли выполнить действие со счётом. «Я оплатил» гостя и подтверждение сотрудника разделены. */
export function checkBillAction(b: BillState, action: BillAction, total: number): BillCheck {
  if (b.status === 'merged') return { ok: false, reason: 'BILL_MERGED' };
  if (b.status === 'paid' || b.status === 'closed') {
    return action === 'paid_qr' || action === 'paid_cash' ? { ok: true, noop: true } : { ok: false, reason: 'BILL_CLOSED' };
  }
  switch (action) {
    case 'report_payment':
      if (total <= 0) return { ok: false, reason: 'BILL_EMPTY' };
      if (b.payment_status !== 'unpaid') return { ok: true, noop: true };
      return { ok: true };
    case 'paid_qr':
    case 'paid_cash':
      return { ok: true };
    case 'merge_all':
      // Пока гость оплачивает свой счёт, сумму не меняем: иначе он переведёт не ту сумму.
      if (b.payment_status !== 'unpaid') return { ok: false, reason: 'BILL_PAYMENT_PENDING' };
      return { ok: true };
  }
}

/** Что видит гость по своему заказу со стола. */
export function tableOrderStatus(status: string): string {
  switch (status) {
    case 'new':
      return 'sent';
    case 'cooking':
      return 'cooking';
    case 'ready':
      return 'ready';
    case 'completed':
      return 'served';
    case 'cancelled':
      return 'cancelled';
    default:
      return status;
  }
}

/** Можно ли сейчас заказать со стола: только в часы работы. */
export function tableOpenNow(localMinutes: number, open: number, close: number): boolean {
  return localMinutes >= open && localMinutes < close;
}
