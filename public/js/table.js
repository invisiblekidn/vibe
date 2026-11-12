// Гость за столом (QR на столе): заказ без входа и без выбора времени, вызов официанта, свой счёт.
// Каждый телефон получает свой ключ (vibe_device): по нему сервер находит счёт этого телефона за столом.

// Тексты ошибок стола — в i18n.js (err_<КОД>).
const tableErr = (code) => (I18N['err_' + code] ? t('err_' + code) : null);

const ORDER_STATUS = {
  sent: 'warn',
  cooking: 'ok',
  ready: 'ok',
  served: 'mute',
  cancelled: 'bad',
};

const tableState = { info: null, timer: null, sureMerge: false };

function deviceKey() {
  let k = load('vibe_device', null);
  if (!k || !/^[A-Za-z0-9-]{16,80}$/.test(k)) {
    k = crypto.randomUUID();
    save('vibe_device', k);
  }
  return k;
}

const tableApi = (path, body) =>
  api(`/api/table/${encodeURIComponent(TABLE_CODE)}${path}`, body ? { method: 'POST', body: { device: deviceKey(), ...body } } : {});

async function tableInit() {
  document.body.classList.add('at-table');
  $('#hero').hidden = true;
  $('#facts').hidden = true;
  await refreshTable();
  if (!tableState.info) return;
  $('#tablebar').hidden = false;
  $('#tb-waiter').onclick = callWaiter;
  $('#tb-bill').onclick = openBill;
  const tick = () => {
    tableState.timer = setTimeout(async () => {
      if (!document.hidden) await refreshTable();
      tick();
    }, 10000);
  };
  tick();
}

async function refreshTable() {
  try {
    tableState.info = await api(`/api/table/${encodeURIComponent(TABLE_CODE)}?d=${encodeURIComponent(deviceKey())}&lang=${LANG}`);
  } catch (e) {
    if (e.code === 'TABLE_NOT_FOUND') {
      $('#cats').insertAdjacentHTML('beforebegin', `<p class="alert">${esc(t('err_TABLE_NOT_FOUND'))}</p>`);
      tableState.info = null;
    }
    return;
  }
  renderTablebar();
  if ($('#bill-sheet').open) renderBill();
}

function renderTablebar() {
  const info = tableState.info;
  $('#tb-name').textContent = tableName(info.table);
  const w = $('#tb-waiter');
  w.setAttribute('aria-busy', String(info.calls.waiter));
  w.textContent = info.calls.waiter ? t('waiterComing') : t('callWaiter');
  const b = info.bill && info.bill.status === 'open' && info.bill.total > 0 ? info.bill : null;
  $('#tb-bill').textContent = b ? t('myBillSum', { sum: fmt(b.total) }) : t('myBill');
}

async function callWaiter() {
  const w = $('#tb-waiter');
  if (tableState.info?.calls.waiter) return;
  w.disabled = true;
  try {
    await tableApi('/call', { kind: 'waiter' });
    tableState.info.calls.waiter = true;
    renderTablebar();
  } catch (e) {
    w.textContent = e.code === 'NETWORK' ? t('noNetRetry') : t('failed');
  } finally {
    w.disabled = false;
  }
}

// ---------- Корзина за столом ----------

function openTableCart() {
  const dlg = $('#cart-sheet');
  dlg.innerHTML = `<div class="sheet-inner">
    <div class="sheet-head"><h2 id="cart-title">${esc(t('yourOrder'))}</h2><button class="icon-btn" type="button" data-close aria-label="${esc(t('close'))}">×</button></div>
    <div class="sheet-scroll" id="cart-body"></div>
    <div class="sheet-foot"><button class="btn block" type="button" id="submit"></button></div>
  </div>`;
  dlg.querySelector('[data-close]').onclick = () => dlg.close();
  $('#submit', dlg).onclick = submitTable;
  renderTableCart();
  dlg.showModal();
}

function renderTableCart() {
  const dlg = $('#cart-sheet');
  const body = $('#cart-body', dlg);
  const title = tableName(tableState.info && tableState.info.table);
  body.innerHTML = `
    <div class="card">${state.cart
      .map(
        (i, idx) => `<div class="cart-item">
          <div><b>${esc(tr(state.dishes.get(i.dishId).name))}</b>
            ${i.optionIds.length ? `<small>${esc(optionNames(i))}</small>` : ''}<small>${fmt(unitPrice(i))}</small></div>
          <div class="qty"><button type="button" data-ci="${idx}" data-d="-1" aria-label="${esc(t('less'))}">−</button>${i.qty}<button type="button" data-ci="${idx}" data-d="1" aria-label="${esc(t('more'))}">+</button></div>
        </div>`,
      )
      .join('')}</div>
    <div class="line tot"><span>${esc(t('total'))}</span><span>${fmt(cartTotal())}</span></div>
    <p class="hint" style="margin:0"><b>${esc(title)}</b><br>${esc(t('tableHint'))}</p>
    <div class="field"><label for="g-comment">${esc(t('comment'))}</label><textarea id="g-comment" maxlength="300" placeholder="${esc(t('tableCommentPh'))}">${esc(state.comment)}</textarea></div>
    ${tableState.info && !tableState.info.open ? `<p class="alert warn" style="margin:0">${esc(t('err_TABLE_CLOSED'))}</p>` : ''}
    <p class="alert" id="cart-err" hidden style="margin:0"></p>`;
  const sub = $('#submit', dlg);
  sub.textContent = t('sendOrder', { sum: fmt(cartTotal()) });
  sub.disabled = state.cart.length === 0 || !tableState.info;
  body.onclick = (e) => {
    const q = e.target.closest('[data-ci]');
    if (!q) return;
    const it = state.cart[Number(q.dataset.ci)];
    it.qty += Number(q.dataset.d);
    if (it.qty <= 0) state.cart.splice(Number(q.dataset.ci), 1);
    if (it.qty > 20) it.qty = 20;
    saveCart();
    if (!state.cart.length) return dlg.close();
    renderTableCart();
  };
  body.oninput = (e) => {
    if (e.target.id === 'g-comment') state.comment = e.target.value;
  };
}

let tableSending = false;
async function submitTable() {
  if (tableSending) return;
  // Один ключ на одну попытку: повторное нажатие или повтор после обрыва связи не создаст второй заказ.
  let key = sessionStorage.getItem('vibe_idem');
  if (!key) { key = crypto.randomUUID(); sessionStorage.setItem('vibe_idem', key); }
  tableSending = true;
  const btn = $('#submit');
  btn.disabled = true;
  btn.textContent = t('sending');
  try {
    await tableApi('/orders', {
      idempotencyKey: key,
      items: state.cart.map((i) => ({ dishId: i.dishId, qty: i.qty, optionIds: i.optionIds })),
      comment: state.comment,
      lang: LANG,
    });
    state.cart = [];
    state.comment = '';
    save(CART_KEY, []);
    sessionStorage.removeItem('vibe_idem');
    renderCartbar();
    $('#cart-sheet').close();
    await refreshTable();
    openBill();
  } catch (e) {
    if (e.code !== 'NETWORK') sessionStorage.removeItem('vibe_idem');
    const el = $('#cart-err');
    el.textContent = tableErr(e.code) || t('tableErr');
    el.hidden = false;
    btn.disabled = false;
    btn.textContent = t('sendOrder', { sum: fmt(cartTotal()) });
  } finally {
    tableSending = false;
  }
}

// ---------- Мой счёт ----------

function openBill() {
  const dlg = $('#bill-sheet');
  tableState.sureMerge = false;
  dlg.innerHTML = `<div class="sheet-inner">
    <div class="sheet-head"><h2 id="bill-title">${esc(t('myBill'))}</h2><button class="icon-btn" type="button" data-close aria-label="${esc(t('close'))}">×</button></div>
    <div class="sheet-scroll" id="bill-body"></div>
  </div>`;
  dlg.querySelector('[data-close]').onclick = () => dlg.close();
  $('#bill-body', dlg).onclick = onBillClick;
  renderBill();
  dlg.showModal();
}

function renderBill() {
  const info = tableState.info;
  const body = $('#bill-body');
  if (!info || !body) return;
  const b = info.bill;
  if (!b || (!b.orders.length && b.status === 'open')) {
    body.innerHTML = `<p class="muted" style="margin:0">${esc(t('billEmpty'))}</p>
      ${info.others.count ? `<p class="hint" style="margin:0">${esc(t('otherBills', { n: info.others.count, sum: fmt(info.others.total) }))}</p>` : ''}`;
    return;
  }
  if (b.status === 'paid') {
    body.innerHTML = `<p class="alert ok" style="margin:0">${esc(t(b.paymentMethod === 'cash' ? 'billPaidCash' : 'billPaid', { n: b.id, sum: fmt(b.paidTotal ?? b.total) }))}</p>
      <p class="muted" style="margin:0">${esc(t('billAgain'))}</p>`;
    return;
  }
  const open = b.status === 'open';
  const canMerge = open && b.paymentStatus === 'unpaid' && info.others.count > 0;
  body.innerHTML = `
    <div class="card" style="padding:12px 14px;display:grid;gap:2px">
      <span class="muted">${esc(tableName(info.table))} · ${esc(t('billNo', { n: b.id }))}${b.shared ? ' · ' + esc(t('wholeTable')) : ''}</span>
      <span class="sum">${fmt(b.total)}</span>
    </div>
    ${b.shared ? `<p class="hint" style="margin:0">${esc(t('sharedHint'))}</p>` : ''}
    ${b.orders
      .map((o) => {
        const cls = ORDER_STATUS[o.status] || 'mute';
        const label = I18N['st_' + o.status] ? t('st_' + o.status) : o.status;
        return `<div class="card bill-order${o.status === 'cancelled' ? ' cancelled' : ''}">
          <div class="hd"><span>${esc(t('orderNo', { n: o.number }))}</span><span class="pill ${cls}">${label}</span></div>
          <ul>${o.items.map((i) => `<li>${i.qty} × ${esc(i.name)}${i.options.length ? ` <span class="muted">(${esc(i.options.join(', '))})</span>` : ''}</li>`).join('')}</ul>
          <div class="line" style="padding:0"><span class="muted">${esc(t('sum'))}</span><span>${fmt(o.total)}</span></div>
        </div>`;
      })
      .join('')}
    ${canMerge ? `<div class="card" style="padding:12px 14px;display:grid;gap:8px">
        <span>${esc(info.others.count === 1 ? t('othersOne', { sum: fmt(info.others.total) }) : t('othersMany', { n: info.others.count, sum: fmt(info.others.total) }))}</span>
        <button class="btn ghost block" type="button" data-merge>${esc(tableState.sureMerge ? t('payAllSure', { sum: fmt(b.total + info.others.total) }) : t('payAll'))}</button>
        ${tableState.sureMerge ? `<span class="muted" style="font-size:13px">${esc(t('payAllNote'))}</span>` : ''}
      </div>` : ''}
    ${!b.requested && open ? `<button class="btn block" type="button" data-ask>${esc(t('askBill'))}</button>` : ''}
    ${b.requested && open && b.paymentStatus === 'unpaid' ? `<div class="card payblock">
        <span class="muted">${esc(t('waiterSoon'))}</span>
        <span class="sum">${fmt(b.total)}</span>
        ${info.qrUrl ? `<img class="qr" src="${esc(info.qrUrl)}" alt="${esc(t('qrAlt'))}">` : ''}
        <p class="hint" style="margin:0">${t('tableTransferNote', { t: esc(info.table.id), n: b.id })}</p>
        <button class="btn block" type="button" data-paid>${esc(t('paidQr'))}</button>
      </div>` : ''}
    ${b.paymentStatus === 'reported' && open ? `<p class="alert warn" style="margin:0">${esc(t('billReported', { sum: fmt(b.total) }))}</p>` : ''}
    <p class="alert" id="bill-err" hidden style="margin:0"></p>`;
}

async function onBillClick(e) {
  const btn = e.target.closest('[data-ask],[data-paid],[data-merge]');
  if (!btn) return;
  if (btn.hasAttribute('data-merge') && !tableState.sureMerge) {
    tableState.sureMerge = true;
    return renderBill();
  }
  btn.disabled = true;
  try {
    if (btn.hasAttribute('data-ask')) await tableApi('/call', { kind: 'bill' });
    if (btn.hasAttribute('data-paid')) await tableApi('/bill/report-payment', {});
    if (btn.hasAttribute('data-merge')) await tableApi('/bill/merge', {});
    tableState.sureMerge = false;
    await refreshTable();
  } catch (err) {
    tableState.sureMerge = false;
    await refreshTable();
    const el = $('#bill-err');
    if (el) {
      el.textContent = tableErr(err.code) || t('billFailed');
      el.hidden = false;
    }
  }
}
