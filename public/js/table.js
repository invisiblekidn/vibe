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
// Порядок подачи: «Всё сразу» (как было) или «По очереди». Во втором случае у каждой строки корзины
// есть номер подачи (course). Блюда одной подачи приносят вместе. Перед отправкой гость обязательно
// подтверждает порядок; сервер сверяет подпись (courseSignature) с корзиной.

const SERVE_KEY = 'vibe_serve_mode';
tableState.serveMode = load(SERVE_KEY, 'together') === 'courses' ? 'courses' : 'together';
tableState.view = 'cart'; // cart | confirm

const isDrink = (i) => state.dishes.get(i.dishId)?.category_id === 'bar';
const courseCount = () => state.cart.reduce((m, i) => Math.max(m, i.course || 1), 0);

/** Подпись порядка — как на сервере (src/lib/courses.ts). */
function courseSignature(items) {
  return items.map((i) => `${i.dishId}*${i.qty}[${(i.optionIds || []).join(',')}]@${i.course}`).join('|');
}

/** Новому блюду — подача по умолчанию: напитки в первую, еда — в последнюю подачу с едой (или во вторую после напитков). */
function defaultCourse(it) {
  if (isDrink(it)) return 1;
  const food = state.cart.filter((x) => x !== it && !isDrink(x) && Number.isInteger(x.course));
  if (food.length) return Math.max(...food.map((x) => x.course));
  return state.cart.some((x) => x !== it && isDrink(x)) ? 2 : 1;
}

/** Номера подач подряд с 1, без пустых. */
function normalizeCourses() {
  for (const i of state.cart) if (!Number.isInteger(i.course) || i.course < 1) i.course = defaultCourse(i);
  const used = [...new Set(state.cart.map((i) => i.course))].sort((a, b) => a - b);
  for (const i of state.cart) i.course = used.indexOf(i.course) + 1;
}

function setServeMode(mode) {
  tableState.serveMode = mode;
  save(SERVE_KEY, mode);
  if (mode === 'courses') {
    for (const i of state.cart) delete i.course;
    normalizeCourses();
  }
  saveCart();
}

function moveCourse(idx, d) {
  const it = state.cart[idx];
  const k = courseCount();
  const alone = state.cart.filter((x) => x.course === it.course).length === 1;
  const target = it.course + d;
  if (target < 1) {
    if (alone) return;
    for (const x of state.cart) x.course += 1;
    it.course = 1;
  } else if (target > k) {
    if (alone) return;
    it.course = k + 1;
  } else it.course = target;
  normalizeCourses();
  saveCart();
}

function openTableCart() {
  const dlg = $('#cart-sheet');
  tableState.view = 'cart';
  dlg.innerHTML = `<div class="sheet-inner">
    <div class="sheet-head"><h2 id="cart-title">${esc(t('yourOrder'))}</h2><button class="icon-btn" type="button" data-close aria-label="${esc(t('close'))}">×</button></div>
    <div class="sheet-scroll" id="cart-body"></div>
    <div class="sheet-foot" id="cart-foot"></div>
  </div>`;
  dlg.querySelector('[data-close]').onclick = () => dlg.close();
  $('#cart-body', dlg).onclick = onCartClick;
  $('#cart-body', dlg).oninput = (e) => {
    if (e.target.id === 'g-comment') state.comment = e.target.value;
  };
  $('#cart-foot', dlg).onclick = onCartFoot;
  $('#cart-body', dlg).addEventListener('pointerdown', onDragStart);
  renderTableCart();
  dlg.showModal();
}

function lineHtml(i, idx, courses) {
  const name = esc(tr(state.dishes.get(i.dishId).name));
  const qty = `<div class="qty"><button type="button" data-ci="${idx}" data-d="-1" aria-label="${esc(t('less'))}">−</button>${i.qty}<button type="button" data-ci="${idx}" data-d="1" aria-label="${esc(t('more'))}">+</button></div>`;
  const info = `<div><b>${name}</b>${i.optionIds.length ? `<small>${esc(optionNames(i))}</small>` : ''}<small>${fmt(unitPrice(i))}</small></div>`;
  if (!courses) return `<div class="cart-item">${info}${qty}</div>`;
  const k = courseCount();
  const alone = state.cart.filter((x) => x.course === i.course).length === 1;
  return `<div class="cart-item ci-course" data-idx="${idx}">
    <button class="grip" type="button" data-grip="${idx}" aria-label="${esc(t('courseDrag', { x: tr(state.dishes.get(i.dishId).name) }))}">
      <svg viewBox="0 0 14 20" aria-hidden="true"><g fill="currentColor"><circle cx="4" cy="4" r="1.8"/><circle cx="10" cy="4" r="1.8"/><circle cx="4" cy="10" r="1.8"/><circle cx="10" cy="10" r="1.8"/><circle cx="4" cy="16" r="1.8"/><circle cx="10" cy="16" r="1.8"/></g></svg>
    </button>
    ${info}${qty}
    <div class="mv">
      <button type="button" data-mv="-1" data-ci="${idx}" ${i.course === 1 && alone ? 'disabled' : ''}>${esc(t('courseEarlier'))}</button>
      <button type="button" data-mv="1" data-ci="${idx}" ${i.course === k && alone ? 'disabled' : ''}>${esc(t('courseLater'))}</button>
    </div>
  </div>`;
}

function renderTableCart() {
  const dlg = $('#cart-sheet');
  const body = $('#cart-body', dlg);
  const foot = $('#cart-foot', dlg);
  if (!body) return;
  const seq = tableState.serveMode === 'courses';
  if (seq) normalizeCourses();
  const k = seq ? courseCount() : 1;
  if (tableState.view === 'confirm' && seq && k > 1) return renderCourseConfirm(body, foot, k);
  tableState.view = 'cart';
  $('#cart-title', dlg).textContent = t('yourOrder');
  const title = tableName(tableState.info && tableState.info.table);
  const list = seq
    ? `<div class="courses">${Array.from({ length: k }, (_, n) => `<section class="course" data-course="${n + 1}">
          <div class="course-h"><span class="cnum">${n + 1}</span><b>${esc(t('course', { n: n + 1 }))}</b><span class="muted">${esc(n === 0 ? t('courseFirst') : t('courseThen'))}</span></div>
          ${state.cart.map((i, idx) => (i.course === n + 1 ? lineHtml(i, idx, true) : '')).join('')}
        </section>`).join('')}
        <div class="course-new" data-course="new">${esc(t('courseNew'))}</div></div>`
    : `<div class="card">${state.cart.map((i, idx) => lineHtml(i, idx, false)).join('')}</div>`;
  body.innerHTML = `
    <div class="serve-seg" role="group" aria-label="${esc(t('serveSeq'))}">
      <button type="button" data-serve="together" aria-pressed="${!seq}"><b>${esc(t('serveAll'))}</b><small>${esc(t('serveAllSub'))}</small></button>
      <button type="button" data-serve="courses" aria-pressed="${seq}"><b>${esc(t('serveSeq'))}</b><small>${esc(t('serveSeqSub'))}</small></button>
    </div>
    <p class="hint" style="margin:0">${esc(seq ? t('serveHintSeq') : t('serveHintAll'))}</p>
    ${list}
    <div class="line tot"><span>${esc(t('total'))}</span><span>${fmt(cartTotal())}</span></div>
    <p class="hint" style="margin:0"><b>${esc(title)}</b><br>${esc(t('tableHint'))}</p>
    <div class="field"><label for="g-comment">${esc(t('comment'))}</label><textarea id="g-comment" maxlength="300" placeholder="${esc(t('tableCommentPh'))}">${esc(state.comment)}</textarea></div>
    ${tableState.info && !tableState.info.open ? `<p class="alert warn" style="margin:0">${esc(t('err_TABLE_CLOSED'))}</p>` : ''}
    <p class="alert" id="cart-err" ${tableState.err ? '' : 'hidden'} style="margin:0">${esc(tableState.err || '')}</p>`;
  tableState.err = '';
  foot.innerHTML = `<button class="btn block" type="button" id="submit">${esc(t('sendOrder', { sum: fmt(cartTotal()) }))}</button>`;
  $('#submit', foot).disabled = state.cart.length === 0 || !tableState.info;
}

/** Экран «Проверьте порядок подачи»: без «Да» заказ по подачам не уходит. */
function renderCourseConfirm(body, foot, k) {
  $('#cart-title').textContent = t('chkTitle');
  body.innerHTML = `
    <p class="muted" style="margin:0">${esc(t('chkSub'))}</p>
    <ol class="chk-list">${Array.from({ length: k }, (_, n) => `<li><span class="cnum">${n + 1}</span><div><span class="muted">${esc(t('course', { n: n + 1 }))}</span>${state.cart
      .filter((i) => i.course === n + 1)
      .map((i) => `<b>${esc(tr(state.dishes.get(i.dishId).name))} ×${i.qty}</b>${i.optionIds.length ? `<small class="muted">${esc(optionNames(i))}</small>` : ''}`)
      .join('')}</div></li>`).join('')}</ol>
    <p class="alert warn" style="margin:0">${esc(t('chkNote'))}</p>
    <p class="alert" id="cart-err" hidden style="margin:0"></p>`;
  foot.innerHTML = `<div class="chk-btns">
    <button class="btn block" type="button" id="chk-yes">${esc(t('chkYes', { sum: fmt(cartTotal()) }))}</button>
    <button class="btn ghost block" type="button" id="chk-edit">${esc(t('chkEdit'))}</button></div>`;
  $('#chk-yes').focus();
}

function onCartClick(e) {
  const sv = e.target.closest('[data-serve]');
  if (sv) {
    if (sv.dataset.serve !== tableState.serveMode) setServeMode(sv.dataset.serve);
    return renderTableCart();
  }
  const mv = e.target.closest('[data-mv]');
  if (mv) {
    moveCourse(Number(mv.dataset.ci), Number(mv.dataset.mv));
    return renderTableCart();
  }
  const q = e.target.closest('[data-d]');
  if (!q) return;
  const idx = Number(q.dataset.ci);
  const it = state.cart[idx];
  it.qty += Number(q.dataset.d);
  if (it.qty <= 0) state.cart.splice(idx, 1);
  if (it.qty > 20) it.qty = 20;
  saveCart();
  if (!state.cart.length) return $('#cart-sheet').close();
  renderTableCart();
}

function onCartFoot(e) {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.id === 'submit') {
    const seq = tableState.serveMode === 'courses';
    if (seq && courseCount() > 1) {
      tableState.view = 'confirm';
      return renderTableCart();
    }
    return submitTable();
  }
  if (b.id === 'chk-edit') {
    tableState.view = 'cart';
    return renderTableCart();
  }
  if (b.id === 'chk-yes') return submitTable(true);
}

// Перетаскивание пальцем и мышью (Pointer Events, без библиотек). Стрелки «Раньше/Позже» дублируют его.
let drag = null;
function onDragStart(e) {
  const g = e.target.closest('[data-grip]');
  if (!g || drag) return;
  e.preventDefault();
  const dlg = $('#cart-sheet');
  const item = g.closest('.cart-item');
  const r = item.getBoundingClientRect();
  const ghost = item.cloneNode(true);
  ghost.classList.add('drag-ghost');
  Object.assign(ghost.style, { width: r.width + 'px', left: r.left + 'px', top: r.top + 'px' });
  dlg.appendChild(ghost); // в самом диалоге: он поверх страницы
  item.classList.add('dragging');
  drag = { idx: Number(g.dataset.grip), ghost, item, dx: e.clientX - r.left, dy: e.clientY - r.top, over: null, id: e.pointerId };
  try { TGW && TGW.disableVerticalSwipes && TGW.disableVerticalSwipes(); } catch { /* старый Telegram */ }
  g.setPointerCapture(e.pointerId);
  g.addEventListener('pointermove', onDragMove);
  g.addEventListener('pointerup', onDragEnd);
  g.addEventListener('pointercancel', onDragEnd);
}

function onDragMove(e) {
  if (!drag) return;
  drag.ghost.style.left = e.clientX - drag.dx + 'px';
  drag.ghost.style.top = e.clientY - drag.dy + 'px';
  // У края списка — прокручиваем, чтобы дотянуть до дальней подачи.
  const sc = $('#cart-body');
  const sr = sc.getBoundingClientRect();
  if (e.clientY < sr.top + 48) sc.scrollTop -= 12;
  else if (e.clientY > sr.bottom - 48) sc.scrollTop += 12;
  drag.ghost.hidden = true;
  const el = document.elementFromPoint(e.clientX, e.clientY);
  drag.ghost.hidden = false;
  const zone = el && el.closest('[data-course]');
  if (drag.over && drag.over !== zone) drag.over.classList.remove('over');
  if (zone) zone.classList.add('over');
  drag.over = zone;
}

function onDragEnd(e) {
  if (!drag) return;
  const g = e.currentTarget;
  g.removeEventListener('pointermove', onDragMove);
  g.removeEventListener('pointerup', onDragEnd);
  g.removeEventListener('pointercancel', onDragEnd);
  drag.ghost.remove();
  try { TGW && TGW.enableVerticalSwipes && TGW.enableVerticalSwipes(); } catch { /* старый Telegram */ }
  const { over, idx } = drag;
  drag = null;
  if (over && e.type === 'pointerup') {
    const it = state.cart[idx];
    it.course = over.dataset.course === 'new' ? courseCount() + 1 : Number(over.dataset.course);
    normalizeCourses();
    saveCart();
  }
  renderTableCart();
}

let tableSending = false;
async function submitTable(confirmed = false) {
  if (tableSending) return;
  // Один ключ на одну попытку: повторное нажатие или повтор после обрыва связи не создаст второй заказ.
  let key = sessionStorage.getItem('vibe_idem');
  if (!key) { key = crypto.randomUUID(); sessionStorage.setItem('vibe_idem', key); }
  tableSending = true;
  const btn = $(confirmed ? '#chk-yes' : '#submit');
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = t('sending');
  const seq = confirmed && tableState.serveMode === 'courses';
  const items = state.cart.map((i) => ({ dishId: i.dishId, qty: i.qty, optionIds: i.optionIds, ...(seq ? { course: i.course } : {}) }));
  try {
    await tableApi('/orders', {
      idempotencyKey: key,
      items,
      comment: state.comment,
      lang: LANG,
      ...(seq ? { serveMode: 'courses', serveConfirm: courseSignature(items) } : {}),
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
    const msg = tableErr(e.code) || t('tableErr');
    if (e.code === 'COURSES_NOT_CONFIRMED' || e.code === 'BAD_COURSES') {
      tableState.view = 'cart';
      tableState.err = msg;
      renderTableCart();
    } else {
      const el = $('#cart-err');
      el.textContent = msg;
      el.hidden = false;
      btn.disabled = false;
      btn.textContent = label;
    }
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
          ${billItems(o)}
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

const COURSE_PILL = { waiting: 'mute', cooking: 'ok', ready: 'ok', served: 'mute' };
const itemLi = (i) => `<li>${i.qty} × ${esc(i.name)}${i.options.length ? ` <span class="muted">(${esc(i.options.join(', '))})</span>` : ''}</li>`;

/** Блюда заказа в счёте: по подачам со статусом каждой, если гость выбрал «По очереди». */
function billItems(o) {
  if (o.serveMode !== 'courses' || !o.courses || o.courses.length < 2 || o.status === 'cancelled') return `<ul>${o.items.map(itemLi).join('')}</ul>`;
  return `<div class="bill-courses">${o.courses
    .map((c) => `<div class="bill-course${c.status === 'served' ? ' done' : ''}">
      <div class="hd"><span><span class="cnum${c.status === 'served' ? ' ok' : c.status === 'waiting' ? ' wait' : ''}">${c.status === 'served' ? '✓' : c.course}</span>${esc(t('course', { n: c.course }))}</span>
      ${o.status === 'sent' ? '' : `<span class="pill ${COURSE_PILL[c.status] || 'mute'}">${esc(t('cs_' + c.status))}</span>`}</div>
      <ul>${o.items.filter((i) => i.course === c.course).map(itemLi).join('')}</ul></div>`)
    .join('')}</div>`;
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
