// Статусы заказа. Статус кухни и статус оплаты хранятся отдельно, чтобы
// «гость сообщил об оплате» никогда не смешивался с «оплата подтверждена».

export type KitchenStatus = 'new' | 'cooking' | 'ready' | 'completed' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'reported' | 'confirmed' | 'refunded';
export type PaymentMethod = 'qr' | 'cash' | 'on_site';

export interface OrderState {
  status: KitchenStatus;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod;
}

/** Статус, который видит гость. */
export type GuestStatus =
  | 'awaiting_payment'
  | 'payment_checking'
  | 'confirmed'
  | 'cooking'
  | 'ready'
  | 'completed'
  | 'cancelled';

export function guestStatus(o: OrderState): GuestStatus {
  if (o.status === 'cancelled') return 'cancelled';
  if (o.status === 'completed') return 'completed';
  if (o.status === 'ready') return 'ready';
  if (o.status === 'cooking') return 'cooking';
  if (o.payment_method === 'qr') {
    if (o.payment_status === 'unpaid') return 'awaiting_payment';
    if (o.payment_status === 'reported') return 'payment_checking';
  }
  return 'confirmed';
}

/** Можно ли передать заказ на кухню. Предзаказ с оплатой по QR — только после подтверждения сотрудником. */
export function kitchenMayStart(o: OrderState): boolean {
  if (o.status !== 'new') return false;
  if (o.payment_method === 'qr') return o.payment_status === 'confirmed';
  return true; // наличные и оплата на месте появятся на этапе 3 со своим подтверждением
}

export type Action = 'report_payment' | 'confirm_payment' | 'start_cooking' | 'mark_ready' | 'complete' | 'cancel';

export type Transition = { ok: true; next: OrderState; event: string } | { ok: false; reason: string };

export function applyAction(o: OrderState, action: Action): Transition {
  const done = o.status === 'completed' || o.status === 'cancelled';
  switch (action) {
    case 'report_payment':
      if (done) return { ok: false, reason: 'ORDER_CLOSED' };
      if (o.payment_method !== 'qr') return { ok: false, reason: 'NOT_QR' };
      if (o.payment_status !== 'unpaid') return { ok: true, next: o, event: 'noop' }; // повторное нажатие
      return { ok: true, next: { ...o, payment_status: 'reported' }, event: 'payment_reported' };
    case 'confirm_payment':
      if (done) return { ok: false, reason: 'ORDER_CLOSED' };
      if (o.payment_status === 'confirmed') return { ok: true, next: o, event: 'noop' };
      if (o.payment_status === 'refunded') return { ok: false, reason: 'REFUNDED' };
      return { ok: true, next: { ...o, payment_status: 'confirmed' }, event: 'payment_confirmed' };
    case 'start_cooking':
      if (o.status === 'cooking') return { ok: true, next: o, event: 'noop' };
      if (!kitchenMayStart(o)) return { ok: false, reason: 'PAYMENT_NOT_CONFIRMED' };
      return { ok: true, next: { ...o, status: 'cooking' }, event: 'cooking_started' };
    case 'mark_ready':
      if (o.status === 'ready') return { ok: true, next: o, event: 'noop' };
      if (o.status !== 'cooking') return { ok: false, reason: 'NOT_COOKING' };
      return { ok: true, next: { ...o, status: 'ready' }, event: 'ready' };
    case 'complete':
      if (o.status === 'completed') return { ok: true, next: o, event: 'noop' };
      if (o.status !== 'ready') return { ok: false, reason: 'NOT_READY' };
      return { ok: true, next: { ...o, status: 'completed' }, event: 'completed' };
    case 'cancel':
      if (o.status === 'cancelled') return { ok: true, next: o, event: 'noop' };
      if (o.status === 'completed') return { ok: false, reason: 'ORDER_CLOSED' };
      return { ok: true, next: { ...o, status: 'cancelled' }, event: 'cancelled' };
  }
}
