// Гость за столом (QR на столе): заказ без входа и без выбора времени, вызов официанта, свой счёт.
// Каждый телефон получает свой ключ (vibe_device): по нему сервер находит счёт этого телефона за столом.

const TABLE_ERRORS = {
  TABLE_NOT_FOUND: 'Не узнали этот QR-код. Позовите официанта, пожалуйста.',
  TABLE_CLOSED: 'Сейчас ресторан закрыт, заказ со стола не принимаем.',
  BILL_EMPTY: 'В счёте пока ничего нет.',
  BILL_CLOSED: 'Этот счёт уже закрыт. Обновите страницу.',
  BILL_MERGED: 'Ваш счёт уже входит в общий счёт стола.',
  BILL_PAYMENT_PENDING: 'Счёт уже оплачивается, объединить сейчас нельзя. Позовите официанта.',
  NOTHING_TO_MERGE: 'За столом нет других счетов.',
};

const ORDER_STATUS = {
  sent: ['warn', 'Отправлен, ждём подтверждения'],
  cooking: ['ok', 'Принят, готовим'],
  ready: ['ok', 'Готово, несём'],
  served: ['mute', 'Подано'],
  cancelled: ['bad', 'Отменён'],
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
    tableState.info = await api(`/api/table/${encodeURIComponent(TABLE_CODE)}?d=${encodeURIComponent(deviceKey())}`);
  } catch (e) {
    if (e.code === 'TABLE_NOT_FOUND') {
      $('#cats').insertAdjacentHTML('beforebegin', `<p class="alert">${TABLE_ERRORS.TABLE_NOT_FOUND}</p>`);
      tableState.info = null;
    }
    return;
  }
  renderTablebar();
  if ($('#bill-sheet').open) renderBill();
}

function renderTablebar() {
  const t = tableState.info;
  $('#tb-name').textContent = t.table.title;
  const w = $('#tb-waiter');
  w.setAttribute('aria-busy', String(t.calls.waiter));
  w.textContent = t.calls.waiter ? 'Официант уже идёт' : 'Позвать официанта';
  const b = t.bill && t.bill.status === 'open' && t.bill.total > 0 ? t.bill : null;
  $('#tb-bill').textContent = b ? `Мой счёт · ${fmt(b.total)}` : 'Мой счёт';
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
    w.textContent = e.code === 'NETWORK' ? 'Нет связи, нажмите ещё раз' : 'Не получилось';
  } finally {
    w.disabled = false;
  }
}

// ---------- Корзина за столом ----------

function openTableCart() {
  const dlg = $('#cart-sheet');
  dlg.innerHTML = `<div class="sheet-inner">
    <div class="sheet-head"><h2 id="cart-title">Ваш заказ</h2><button class="icon-btn" type="button" data-close aria-label="Закрыть">×</button></div>
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
  const title = tableState.info ? tableState.info.table.title : 'Стол';
  body.innerHTML = `
    <div class="card">${state.cart
      .map(
        (i, idx) => `<div class="cart-item">
          <div><b>${esc(tr(state.dishes.get(i.dishId).name))}</b>
            ${i.optionIds.length ? `<small>${esc(optionNames(i))}</small>` : ''}<small>${fmt(unitPrice(i))}</small></div>
          <div class="qty"><button type="button" data-ci="${idx}" data-d="-1" aria-label="Меньше">−</button>${i.qty}<button type="button" data-ci="${idx}" data-d="1" aria-label="Больше">+</button></div>
        </div>`,
      )
      .join('')}</div>
    <div class="line tot"><span>Итого</span><span>${fmt(cartTotal())}</span></div>
    <p class="hint" style="margin:0"><b>${esc(title)}</b><br>Заказ увидит администратор и сразу передаст на кухню. Обычно готовим 15–20 минут. Оплата по счёту в конце, по QR или наличными.</p>
    <div class="field"><label for="g-comment">Комментарий</label><textarea id="g-comment" maxlength="300" placeholder="Например: без лука, сначала детям">${esc(state.comment)}</textarea></div>
    ${tableState.info && !tableState.info.open ? `<p class="alert warn" style="margin:0">${TABLE_ERRORS.TABLE_CLOSED}</p>` : ''}
    <p class="alert" id="cart-err" hidden style="margin:0"></p>`;
  const sub = $('#submit', dlg);
  sub.textContent = `Отправить заказ · ${fmt(cartTotal())}`;
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
  btn.textContent = 'Отправляем…';
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
    el.textContent = TABLE_ERRORS[e.code] || ERRORS[e.code] || 'Что-то пошло не так. Попробуйте ещё раз или позовите официанта.';
    el.hidden = false;
    btn.disabled = false;
    btn.textContent = `Отправить заказ · ${fmt(cartTotal())}`;
  } finally {
    tableSending = false;
  }
}

// ---------- Мой счёт ----------

function openBill() {
  const dlg = $('#bill-sheet');
  tableState.sureMerge = false;
  dlg.innerHTML = `<div class="sheet-inner">
    <div class="sheet-head"><h2 id="bill-title">Мой счёт</h2><button class="icon-btn" type="button" data-close aria-label="Закрыть">×</button></div>
    <div class="sheet-scroll" id="bill-body"></div>
  </div>`;
  dlg.querySelector('[data-close]').onclick = () => dlg.close();
  $('#bill-body', dlg).onclick = onBillClick;
  renderBill();
  dlg.showModal();
}

function renderBill() {
  const t = tableState.info;
  const body = $('#bill-body');
  if (!t || !body) return;
  const b = t.bill;
  if (!b || (!b.orders.length && b.status === 'open')) {
    body.innerHTML = `<p class="muted" style="margin:0">Вы ещё ничего не заказали с этого телефона. Выберите блюда в меню и нажмите «Отправить заказ».</p>
      ${t.others.count ? `<p class="hint" style="margin:0">За столом есть другие счета: ${t.others.count} на ${fmt(t.others.total)}.</p>` : ''}`;
    return;
  }
  if (b.status === 'paid') {
    body.innerHTML = `<p class="alert ok" style="margin:0">Счёт №${b.id} оплачен${b.paymentMethod === 'cash' ? ' наличными' : ''}: ${fmt(b.paidTotal ?? b.total)}. Спасибо, что были у нас!</p>
      <p class="muted" style="margin:0">Захотите что-то ещё — просто закажите из меню, откроется новый счёт.</p>`;
    return;
  }
  const open = b.status === 'open';
  const canMerge = open && b.paymentStatus === 'unpaid' && t.others.count > 0;
  body.innerHTML = `
    <div class="card" style="padding:12px 14px;display:grid;gap:2px">
      <span class="muted">${esc(t.table.title)} · счёт №${b.id}${b.shared ? ' · весь стол' : ''}</span>
      <span class="sum">${fmt(b.total)}</span>
    </div>
    ${b.shared ? '<p class="hint" style="margin:0">Это общий счёт стола: в нём заказы со всех телефонов, которые объединили.</p>' : ''}
    ${b.orders
      .map((o) => {
        const [cls, label] = ORDER_STATUS[o.status] || ['mute', o.status];
        return `<div class="card bill-order${o.status === 'cancelled' ? ' cancelled' : ''}">
          <div class="hd"><span>Заказ №${o.number}</span><span class="pill ${cls}">${label}</span></div>
          <ul>${o.items.map((i) => `<li>${i.qty} × ${esc(i.name)}${i.options.length ? ` <span class="muted">(${esc(i.options.join(', '))})</span>` : ''}</li>`).join('')}</ul>
          <div class="line" style="padding:0"><span class="muted">Сумма</span><span>${fmt(o.total)}</span></div>
        </div>`;
      })
      .join('')}
    ${canMerge ? `<div class="card" style="padding:12px 14px;display:grid;gap:8px">
        <span>За столом ещё ${t.others.count === 1 ? 'один счёт' : `${t.others.count} счёта`} на ${fmt(t.others.total)}.</span>
        <button class="btn ghost block" type="button" data-merge>${tableState.sureMerge ? `Да, оплачу весь стол · ${fmt(b.total + t.others.total)}` : 'Оплатить весь стол одним счётом'}</button>
        ${tableState.sureMerge ? '<span class="muted" style="font-size:13px">Счета других телефонов закроются и войдут в ваш.</span>' : ''}
      </div>` : ''}
    ${!b.requested && open ? `<button class="btn block" type="button" data-ask>Попросить счёт</button>` : ''}
    ${b.requested && open && b.paymentStatus === 'unpaid' ? `<div class="card payblock">
        <span class="muted">Официант скоро подойдёт. Можно оплатить наличными или по QR:</span>
        <span class="sum">${fmt(b.total)}</span>
        ${t.qrUrl ? `<img class="qr" src="${esc(t.qrUrl)}" alt="QR-код для оплаты">` : ''}
        <p class="hint" style="margin:0">В комментарии к переводу укажите: <b>стол ${esc(t.table.id)}, счёт ${b.id}</b>.</p>
        <button class="btn block" type="button" data-paid>Я оплатил по QR</button>
      </div>` : ''}
    ${b.paymentStatus === 'reported' && open ? `<p class="alert warn" style="margin:0">Спасибо! Вы сообщили об оплате ${fmt(b.total)}. Сотрудник проверит поступление и закроет счёт.</p>` : ''}
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
      el.textContent = TABLE_ERRORS[err.code] || (err.code === 'NETWORK' ? ERRORS.NETWORK : 'Не получилось. Позовите официанта.');
      el.hidden = false;
    }
  }
}
