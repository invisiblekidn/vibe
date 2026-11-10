// Панель сотрудника: вход, список заказов с сайта, подтверждение оплаты и статусы кухни.
const root = $('#root');
let me = null;
let orders = [];
let today = '';
let filter = 'active';
let timer = null;

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
  PAYMENT_NOT_CONFIRMED: 'Сначала подтвердите оплату: кухня готовит только оплаченные заказы.',
  CHANGED_MEANWHILE: 'Заказ только что изменил другой сотрудник. Список обновлён.',
  ORDER_CLOSED: 'Заказ уже закрыт.',
};

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
  const list = orders.filter((o) => (filter === 'active' ? isActive(o) : filter === 'check' ? o.paymentStatus === 'reported' && isActive(o) : true));
  const nCheck = orders.filter((o) => o.paymentStatus === 'reported' && isActive(o)).length;
  root.innerHTML = `<div class="staff">
    <div class="filters">
      <button class="chip" data-f="active" aria-pressed="${filter === 'active'}">Активные · ${orders.filter(isActive).length}</button>
      <button class="chip" data-f="check" aria-pressed="${filter === 'check'}">Проверить оплату · ${nCheck}</button>
      <button class="chip" data-f="all" aria-pressed="${filter === 'all'}">Все</button>
    </div>
    ${flash ? `<p class="alert warn" style="margin:0">${esc(flash)}</p>` : ''}
    ${list.length ? '' : '<p class="muted">Заказов нет.</p>'}
    ${list.map((o) => {
      const [pc, pt] = PAY[o.paymentStatus];
      const waited = o.paymentStatus === 'reported' ? minutesSince(o.paymentReportedAt) : 0;
      return `<article class="card ord${o.paymentStatus === 'reported' ? ' attn' : ''}">
        <div class="top"><span class="no">№ ${o.id}</span><span>${TYPE_LABEL[o.type]} · <b>${esc(slotLabel(o.slot, today))}</b></span></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap"><span class="pill ${pc}">${pt}</span><span class="pill mute">${KITCHEN[o.status]}</span><span class="pill mute">${o.channel === 'site' ? 'Сайт' : o.channel === 'telegram' ? 'Telegram' : esc(o.channel)}</span></div>
        ${o.paymentStatus === 'reported' ? `<p class="hint" style="margin:0">Гость нажал «Я оплатил» ${waited} мин назад. Подтверждайте, только когда увидите <b>${fmt(o.total)}</b> в банке (в комментарии должен быть № ${o.id}).${waited >= 30 ? ' <b>Прошло 30 минут: свяжитесь с гостем.</b>' : ''}</p>` : ''}
        <ul>${o.items.map((i) => `<li>${i.qty} × ${esc(i.name)}${i.options.length ? ` <span class="muted">(${esc(i.options.join(', '))})</span>` : ''}</li>`).join('')}</ul>
        <div class="line tot" style="margin:0"><span>Сумма</span><span>${fmt(o.total)}</span></div>
        <div class="muted" style="font-size:14px">${esc(o.guestName)} · <a href="tel:${esc(o.guestPhone)}">${esc(o.guestPhone)}</a>${o.comment ? `<br>«${esc(o.comment)}»` : ''}</div>
        <div class="acts">${actionsFor(o).map((a) => `<button class="btn small${a === 'cancel' ? ' ghost' : ''}" data-id="${o.id}" data-a="${a}">${ACTION_LABEL[a]}</button>`).join('')}</div>
      </article>`;
    }).join('')}
  </div>`;
}

root.addEventListener('click', async (e) => {
  const f = e.target.closest('[data-f]');
  if (f) { filter = f.dataset.f; return render(); }
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
    const r = await api('/api/staff/orders');
    orders = r.orders;
    today = r.today;
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
