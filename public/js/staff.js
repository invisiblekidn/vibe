// Панель сотрудника: вход, список заказов с сайта, подтверждение оплаты и статусы кухни.
const root = $('#root');
let me = null;
let orders = [];
let today = '';
let filter = 'active';
let timer = null;
let tables = [];
let publicUrl = '';

const PAY = {
  unpaid: ['mute', 'Не оплачен'],
  reported: ['warn', 'Гость сообщил об оплате · проверьте поступление'],
  confirmed: ['ok', 'Оплата подтверждена'],
  refunded: ['bad', 'Возврат'],
};
const KITCHEN = { new: 'Новый', cooking: 'Готовится', ready: 'Готов', completed: 'Выдан', cancelled: 'Отменён' };
const ACTION_LABEL = {
  confirm_payment: 'Деньги пришли — подтвердить оплату',
  start_cooking: 'Начать готовить',
  mark_ready: 'Готово',
  complete: 'Выдан гостю',
  cancel: 'Отменить',
};
const ERR = {
  BILL_MERGED: 'Этот счёт уже вошёл в общий счёт стола.',
  BILL_CLOSED: 'Счёт уже закрыт.',
  BILL_PAYMENT_PENDING: 'Гость уже оплачивает свой счёт по QR, объединить нельзя.',
  NOTHING_TO_MERGE: 'За столом нет других открытых счетов.',
  PAYMENT_NOT_CONFIRMED: 'Сначала подтвердите оплату: кухня готовит только оплаченные заказы.',
  CHANGED_MEANWHILE: 'Заказ только что изменил другой сотрудник. Список обновлён.',
  ORDER_CLOSED: 'Заказ уже закрыт.',
};

// Заказ со стола: «Принять» (кухня готовит сразу), «Готово», «Подано». Оплата — по счёту стола.
const TABLE_ACTION_LABEL = { start_cooking: 'Принять', mark_ready: 'Готово', complete: 'Подано', cancel: 'Отменить' };
const TABLE_KITCHEN = { new: 'Ждёт, примите', cooking: 'Готовится', ready: 'Готово, отнести', completed: 'Подано', cancelled: 'Отменён' };
const actionLabel = (o, a) => (o.type === 'table' ? TABLE_ACTION_LABEL[a] : ACTION_LABEL[a]);

function actionsFor(o) {
  if (o.status === 'completed' || o.status === 'cancelled') return [];
  const a = [];
  if (o.paymentMethod === 'qr' && o.paymentStatus !== 'confirmed') a.push('confirm_payment');
  if (o.status === 'new' && (o.paymentMethod !== 'qr' || o.paymentStatus === 'confirmed')) a.push('start_cooking');
  if (o.status === 'cooking') a.push('mark_ready');
  if (o.status === 'ready') a.push('complete');
  a.push('cancel');
  return a;
}

function minutesSince(isoStr) {
  return isoStr ? Math.floor((Date.now() - Date.parse(isoStr)) / 60000) : 0;
}

function renderLogin(msg = '') {
  $('#who').textContent = '';
  root.innerHTML = `<form class="card login" id="login">
    <h2>Вход для сотрудников</h2>
    <div class="field"><label for="l-name">Ваше имя</label><input id="l-name" autocomplete="username" required maxlength="40"></div>
    <div class="field"><label for="l-pin">PIN</label><input id="l-pin" type="password" inputmode="numeric" autocomplete="current-password" required></div>
    ${msg ? `<p class="alert" style="margin:0">${esc(msg)}</p>` : ''}
    <button class="btn block">Войти</button>
  </form>`;
  $('#login').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await api('/api/staff/login', { method: 'POST', body: { name: $('#l-name').value, pin: $('#l-pin').value } });
      me = r.name;
      start();
    } catch (err) {
      renderLogin(err.code === 'WRONG_PIN' ? 'Неверный PIN.' : 'Не удалось войти.');
    }
  };
}

function render(flash = '') {
  $('#who').innerHTML = `${esc(me)} · <button class="btn small ghost" id="logout" type="button">Выйти</button>`;
  $('#logout').onclick = async () => { await api('/api/staff/logout', { method: 'POST' }).catch(() => {}); clearTimeout(timer); me = null; renderLogin(); };
  const isActive = (o) => !['completed', 'cancelled'].includes(o.status);
  const list = orders.filter((o) =>
    filter === 'active' ? isActive(o) : filter === 'check' ? o.paymentStatus === 'reported' && isActive(o) && o.type !== 'table' : filter === 'kitchen' ? o.status === 'cooking' : true,
  );
  const nCheck = orders.filter((o) => o.paymentStatus === 'reported' && isActive(o) && o.type !== 'table').length;
  const nCalls = tables.reduce((s, t) => s + t.calls.length, 0);
  const nBillCheck = tables.reduce((s, t) => s + t.bills.filter((b) => b.paymentStatus === 'reported').length, 0);
  root.innerHTML = `<div class="staff">
    <div class="filters">
      <button class="chip" data-f="active" aria-pressed="${filter === 'active'}">Активные · ${orders.filter(isActive).length}</button>
      <button class="chip" data-f="tables" aria-pressed="${filter === 'tables'}">Столы${nCalls + nBillCheck ? ` · 🔔 ${nCalls + nBillCheck}` : ''}</button>
      <button class="chip" data-f="kitchen" aria-pressed="${filter === 'kitchen'}">Кухня · ${orders.filter((o) => o.status === 'cooking').length}</button>
      <button class="chip" data-f="check" aria-pressed="${filter === 'check'}">Проверить оплату · ${nCheck}</button>
      <button class="chip" data-f="all" aria-pressed="${filter === 'all'}">Все</button>
    </div>
    ${flash ? `<p class="alert warn" style="margin:0">${esc(flash)}</p>` : ''}
    ${filter === 'tables' ? renderTables() : `
    ${list.length ? '' : '<p class="muted">Заказов нет.</p>'}
    ${list.map((o) => orderCard(o)).join('')}`}
  </div>`;
}

function orderCard(o, compact = false) {
  const isTable = o.type === 'table';
  const [pc, pt] = isTable ? ['mute', 'Оплата по счёту стола'] : PAY[o.paymentStatus];
  const waited = o.paymentStatus === 'reported' ? minutesSince(o.paymentReportedAt) : 0;
  const kitchenOnly = filter === 'kitchen';
  return `<article class="card ord${(!isTable && o.paymentStatus === 'reported') || (isTable && o.status === 'new') ? ' attn' : ''}">
    <div class="top"><span class="no">№ ${o.id}</span><span>${isTable ? `<b>${esc(o.table || 'Стол')}</b> · ${minutesSince(o.createdAt)} мин назад` : `${TYPE_LABEL[o.type]} · <b>${esc(slotLabel(o.slot, today))}</b>`}</span></div>
    ${compact ? '' : `<div style="display:flex;gap:6px;flex-wrap:wrap"><span class="pill ${pc}">${pt}</span><span class="pill ${isTable && o.status === 'new' ? 'warn' : 'mute'}">${(isTable ? TABLE_KITCHEN : KITCHEN)[o.status]}</span><span class="pill mute">${o.channel === 'site' ? 'Сайт' : o.channel === 'telegram' ? 'Telegram' : o.channel === 'table' ? 'QR на столе' : esc(o.channel)}</span></div>`}
    ${!isTable && o.paymentStatus === 'reported' ? `<p class="hint" style="margin:0">Гость нажал «Я оплатил» ${waited} мин назад. Подтверждайте, только когда увидите <b>${fmt(o.total)}</b> в банке (в комментарии должен быть № ${o.id}).${waited >= 30 ? ' <b>Прошло 30 минут: свяжитесь с гостем.</b>' : ''}</p>` : ''}
    <ul>${o.items.map((i) => `<li>${i.qty} × ${esc(i.name)}${i.options.length ? ` <span class="muted">(${esc(i.options.join(', '))})</span>` : ''}</li>`).join('')}</ul>
    ${kitchenOnly || compact ? '' : `<div class="line tot" style="margin:0"><span>Сумма</span><span>${fmt(o.total)}</span></div>`}
    ${isTable ? (o.comment ? `<div class="muted" style="font-size:14px">«${esc(o.comment)}»</div>` : '') : `<div class="muted" style="font-size:14px">${esc(o.guestName)} · <a href="tel:${esc(o.guestPhone)}">${esc(o.guestPhone)}</a>${o.comment ? `<br>«${esc(o.comment)}»` : ''}</div>`}
    <div class="acts">${actionsFor(o).filter((a) => !kitchenOnly || a === 'mark_ready').map((a) => `<button class="btn small${a === 'cancel' ? ' ghost' : ''}" data-id="${o.id}" data-a="${a}">${actionLabel(o, a)}</button>`).join('')}</div>
  </article>`;
}

// Столы: вызовы, счета каждого телефона, оплата и «Весь стол».
function renderTables() {
  const busy = tables.filter((t) => t.bills.length || t.calls.length);
  const free = tables.filter((t) => !t.bills.length && !t.calls.length);
  const byId = new Map(orders.map((o) => [o.id, o]));
  return `${busy.length ? '' : '<p class="muted">Сейчас за столами никто не заказывал.</p>'}
    ${busy.map((t) => {
      const calls = t.calls.map((c) => `<div class="hint" style="margin:0;display:flex;justify-content:space-between;gap:8px;align-items:center">
          <span>${c.kind === 'waiter' ? '🔔 Зовут официанта' : `🧾 Просят счёт №${c.bill_id}`} · ${minutesSince(c.created_at)} мин</span>
          <button class="btn small" data-call="${c.id}">${c.kind === 'waiter' ? 'Иду' : 'Несу счёт'}</button></div>`).join('');
      const bills = t.bills.map((b) => `<div class="card" style="padding:10px 12px;display:grid;gap:8px;background:var(--v-bg)">
          <div class="top" style="display:flex;justify-content:space-between;gap:8px"><b>Счёт №${b.id}${b.requested ? ' · попросили счёт' : ''}</b><b>${fmt(b.total)}</b></div>
          ${b.paymentStatus === 'reported' ? `<p class="hint" style="margin:0">⚠️ Гость нажал «Я оплатил» ${minutesSince(b.paymentReportedAt)} мин назад. Подтверждайте, только когда увидите <b>${fmt(b.total)}</b> в банке.</p>` : ''}
          ${b.orders.map((o) => (byId.get(o.number) ? orderCard(byId.get(o.number), true) : `<div class="muted">№ ${o.number}: ${o.items.map((i) => `${i.qty} × ${esc(i.name)}`).join(', ')}</div>`)).join('')}
          <div class="acts" style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn small" data-bill="${b.id}" data-ba="paid_qr">Деньги пришли (QR)</button>
            <button class="btn small" data-bill="${b.id}" data-ba="paid_cash">Оплачено наличными</button>
            ${t.bills.length > 1 && b.paymentStatus === 'unpaid' ? `<button class="btn small ghost" data-bill="${b.id}" data-ba="merge_all">Весь стол в этот счёт</button>` : ''}
          </div></div>`).join('');
      return `<article class="card ord${t.calls.length ? ' attn' : ''}">
        <div class="top"><span class="no">${esc(t.title)}</span><span class="muted">${t.bills.length ? `счетов: ${t.bills.length}` : ''}</span></div>
        ${calls}${bills}
      </article>`;
    }).join('')}
    ${free.length ? `<p class="muted" style="margin:0">Свободны: ${free.map((t) => esc(t.id)).join(', ')}</p>` : ''}
    <details class="card" style="padding:12px 14px"><summary><b>Ссылки для QR на столах</b></summary>
      <ul style="font-size:14px">${tables.map((t) => `<li>${esc(t.title)}: <a href="${esc(publicUrl)}/t/${esc(t.code)}" target="_blank">${esc(publicUrl)}/t/${esc(t.code)}</a></li>`).join('')}</ul>
    </details>`;
}

root.addEventListener('click', async (e) => {
  const f = e.target.closest('[data-f]');
  if (f) { filter = f.dataset.f; return render(); }
  const call = e.target.closest('[data-call]');
  if (call) {
    call.disabled = true;
    await api(`/api/staff/calls/${call.dataset.call}/done`, { method: 'POST' }).catch(() => {});
    return load();
  }
  const bb = e.target.closest('[data-bill]');
  if (bb) {
    const ba = bb.dataset.ba;
    // Оплату и объединение подтверждаем вторым нажатием, без системного окна.
    if (!bb.dataset.sure) { bb.dataset.sure = '1'; bb.textContent = 'Точно? Нажмите ещё раз'; bb.classList.add('danger'); bb.classList.remove('ghost'); return; }
    bb.disabled = true;
    try {
      await api(`/api/staff/bills/${bb.dataset.bill}/action`, { method: 'POST', body: { action: ba } });
      await load();
    } catch (err) {
      if (err.status === 401) return renderLogin('Смена закончилась, войдите снова.');
      await load(ERR[err.code] || 'Не получилось. Обновите список.');
    }
    return;
  }
  const b = e.target.closest('[data-a]');
  if (!b) return;
  const action = b.dataset.a;
  if (action === 'cancel' && !confirmCancel(b)) return;
  b.disabled = true;
  try {
    await api(`/api/staff/orders/${b.dataset.id}/action`, { method: 'POST', body: { action } });
    await load();
  } catch (err) {
    if (err.status === 401) return renderLogin('Смена закончилась, войдите снова.');
    await load(ERR[err.code] || 'Не получилось. Обновите список.');
  }
});

// Отмена в два нажатия, без системного окна.
function confirmCancel(b) {
  if (b.dataset.sure) return true;
  b.dataset.sure = '1';
  b.textContent = 'Точно отменить?';
  b.classList.add('danger');
  b.classList.remove('ghost');
  return false;
}

async function load(flash = '') {
  try {
    const [r, t] = await Promise.all([api('/api/staff/orders'), api('/api/staff/tables')]);
    orders = r.orders;
    today = r.today;
    tables = t.tables;
    publicUrl = t.publicUrl;
    render(flash);
  } catch (err) {
    if (err.status === 401) { clearTimeout(timer); return renderLogin(); }
  }
}

function start() {
  load();
  clearTimeout(timer);
  const tick = () => { timer = setTimeout(async () => { if (!document.querySelector('[data-sure]')) await load(); tick(); }, 15000); };
  tick();
}

(async () => {
  try { me = (await api('/api/staff/me')).name; start(); } catch { renderLogin(); }
})();
