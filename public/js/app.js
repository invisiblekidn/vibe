// Сайт гостя: меню → карточка блюда → корзина → время → оформление.
// Цену, наличие и время проверяет сервер; здесь только удобный показ.

// Тексты ошибок по кодам сервера — в i18n.js (err_<КОД>).
const errText = (code) => (I18N['err_' + code] ? t('err_' + code) : null);

// Гость открыл QR на столе: /?table=<код>. Заказ идёт на этот стол, без входа и выбора времени (см. table.js).
const TABLE_CODE = (new URLSearchParams(location.search).get('table') || '').toLowerCase().replace(/[^a-z0-9]/g, '') || null;
const CART_KEY = TABLE_CODE ? 'vibe_cart_table' : 'vibe_cart';

const state = {
  menu: null,
  dishes: new Map(),
  cart: load(CART_KEY, []), // [{key, dishId, qty, optionIds}]
  type: 'pickup',
  day: null,
  slot: null,
  slotsData: null,
  guest: load('vibe_guest', { name: '', phone: '' }),
  comment: '',
};

function load(k, d) {
  try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; }
}
function save(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* приватный режим */ }
}

function unitPrice(item) {
  const d = state.dishes.get(item.dishId);
  if (!d) return 0;
  let p = d.price;
  for (const g of d.groups) for (const o of g.options) if (item.optionIds.includes(o.id)) p += o.price_delta;
  return p;
}
const cartTotal = () => state.cart.reduce((s, i) => s + unitPrice(i) * i.qty, 0);
const cartCount = () => state.cart.reduce((s, i) => s + i.qty, 0);

function saveCart() {
  save(CART_KEY, state.cart);
  // Корзина изменилась — следующее оформление будет новым заказом.
  sessionStorage.removeItem('vibe_idem');
  renderCartbar();
}

// ---------- Меню ----------

async function init() {
  await tgReady();
  const tgUser = TGW && TGW.initDataUnsafe && TGW.initDataUnsafe.user;
  if (tgUser && !state.guest.name) state.guest.name = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ');
  try {
    state.menu = await api('/api/menu');
  } catch {
    $('#cats').innerHTML = `<p class="alert">${esc(t('menuFailed'))}</p>`;
    return;
  }
  const m = state.menu;
  for (const d of m.dishes) state.dishes.set(d.id, d);
  state.cart = state.cart.filter((i) => state.dishes.has(i.dishId));
  const hh = (v) => `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
  $('#f-hours').textContent = t('factHoursVal', { from: hh(m.location.open), to: hh(m.location.close) });
  $('#f-addr').textContent = m.location.address;
  renderMenu();
  renderCartbar();
  if (TABLE_CODE) tableInit();
}

function renderMenu() {
  const m = state.menu;
  const soldOut = new Set(m.soldOutToday);
  const cats = m.categories.filter((c) => m.dishes.some((d) => d.category_id === c.id));
  $('#tabs').innerHTML = cats.map((c) => `<a class="chip" href="#cat-${c.id}">${esc(tr(c.name))}</a>`).join('');
  $('#cats').innerHTML = cats
    .map((c) => {
      const items = m.dishes.filter((d) => d.category_id === c.id);
      return `<section class="cat" id="cat-${c.id}">
        <h2 class="brush">${esc(tr(c.name))}</h2>
        <div class="dishes">${items
          .map((d) => {
            const out = soldOut.has(d.id);
            return `<button type="button" class="card dish${out ? ' out' : ''}" data-dish="${d.id}">
              <div class="ph">${d.photo ? `<img src="${esc(d.photo)}" alt="" loading="lazy" width="92" height="92">` : ''}${out ? `<span class="tag-out">${esc(t('soldOutToday'))}</span>` : ''}</div>
              <div class="body">
                <div><h3>${esc(tr(d.name))}${d.is_kids ? `<span class="tag-kids">${esc(t('kidsTag'))}</span>` : ''}</h3>
                ${tr(d.description) ? `<p>${esc(tr(d.description))}</p>` : ''}</div>
                <div class="row"><span class="price">${d.groups.some((g) => g.options.some((o) => o.price_delta > 0)) ? t('priceFrom', { p: fmt(d.price) }) : fmt(d.price)}</span>
                ${d.is_alcohol && !TABLE_CODE ? `<small class="muted">${esc(t('visitOnly'))}</small>` : ''}${out ? '' : '<span class="add" aria-hidden="true">+</span>'}</div>
              </div>
            </button>`;
          })
          .join('')}</div>
      </section>`;
    })
    .join('');
  $('#cats').addEventListener('click', (e) => {
    const b = e.target.closest('[data-dish]');
    if (b) openDish(b.dataset.dish);
  });
}

function renderCartbar() {
  const n = cartCount();
  $('#cartbar').hidden = n === 0;
  $('#open-cart').textContent = t('cartBar', { n, sum: fmt(cartTotal()) });
}

// ---------- Карточка блюда ----------

function openDish(id) {
  const d = state.dishes.get(id);
  const dlg = $('#dish-sheet');
  const soldToday = state.menu.soldOutToday.includes(id);
  let qty = 1;
  dlg.innerHTML = `<form method="dialog" class="sheet-inner">
    <div class="sheet-head"><h2 id="dish-title">${esc(tr(d.name))}</h2><button class="icon-btn" value="close" aria-label="${esc(t('close'))}">×</button></div>
    <div class="sheet-scroll">
      ${d.photo ? `<div class="ph"><img src="${esc(d.photo)}" alt="${esc(tr(d.name))}"></div>` : ''}
      ${tr(d.description) ? `<p style="margin:0">${esc(tr(d.description))}</p>` : ''}
      ${d.weight ? `<p class="muted" style="margin:0">${esc(weightText(d.weight))}</p>` : ''}
      ${soldToday ? `<p class="alert warn" style="margin:0">${esc(t('dishSoldToday'))}</p>` : ''}
      ${d.is_alcohol && !TABLE_CODE ? `<p class="hint" style="margin:0">${esc(t('alcoholVisit'))}</p>` : ''}
      ${d.groups
        .map((g) => {
          const radio = g.max_select === 1;
          const need = g.min_select > 0 ? t('optRequired') : g.max_select > 1 ? t('optUpTo', { n: g.max_select }) : t('optOptional');
          return `<fieldset data-group="${g.id}" data-min="${g.min_select}" data-max="${g.max_select}">
            <legend>${esc(tr(g.name))} <span class="muted" style="font-weight:600">· ${need}</span></legend>
            ${g.options
              .map(
                (o) => `<div class="opt"><label><input type="${radio ? 'radio' : 'checkbox'}" name="g-${g.id}" value="${o.id}">${esc(tr(o.name))}</label>
                ${o.price_delta ? `<span>+${fmt(o.price_delta)}</span>` : ''}</div>`,
              )
              .join('')}
          </fieldset>`;
        })
        .join('')}
      <p class="alert" id="dish-err" hidden style="margin:0"></p>
    </div>
    <div class="sheet-foot">
      <div class="qty"><button type="button" data-q="-1" aria-label="${esc(t('less'))}">−</button><span id="dq">1</span><button type="button" data-q="1" aria-label="${esc(t('more'))}">+</button></div>
      <button class="btn" style="flex:1" value="add" id="dish-add"></button>
    </div>
  </form>`;
  const chosen = () => [...dlg.querySelectorAll('input:checked')].map((i) => i.value);
  const refresh = () => {
    $('#dq', dlg).textContent = qty;
    $('#dish-add', dlg).textContent = t('addToCart', { sum: fmt(unitPrice({ dishId: id, optionIds: chosen() }) * qty) });
  };
  dlg.onclick = (e) => {
    const q = e.target.closest('[data-q]');
    if (q) { qty = Math.min(20, Math.max(1, qty + Number(q.dataset.q))); refresh(); }
  };
  dlg.onchange = (e) => {
    const fs = e.target.closest('fieldset');
    const max = Number(fs.dataset.max);
    if (max > 1 && fs.querySelectorAll('input:checked').length > max) e.target.checked = false;
    refresh();
  };
  $('#dish-add', dlg).addEventListener('click', (e) => {
    const ids = chosen();
    for (const fs of dlg.querySelectorAll('fieldset')) {
      if (fs.querySelectorAll('input:checked').length < Number(fs.dataset.min)) {
        e.preventDefault();
        const err = $('#dish-err', dlg);
        err.textContent = t('choose', { x: fs.querySelector('legend').firstChild.textContent.trim() });
        err.hidden = false;
        fs.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }
    }
    const key = id + '|' + [...ids].sort().join(',');
    const same = state.cart.find((i) => i.key === key);
    if (same) same.qty = Math.min(20, same.qty + qty);
    else state.cart.push({ key, dishId: id, qty, optionIds: ids });
    saveCart();
  });
  refresh();
  dlg.showModal();
}

// ---------- Корзина и оформление ----------

function optionNames(item) {
  const d = state.dishes.get(item.dishId);
  const names = [];
  for (const g of d.groups) for (const o of g.options) if (item.optionIds.includes(o.id)) names.push(tr(o.name));
  return names.join(', ');
}

function openCart() {
  const dlg = $('#cart-sheet');
  dlg.innerHTML = `<div class="sheet-inner">
    <div class="sheet-head"><h2 id="cart-title">${esc(t('yourOrder'))}</h2><button class="icon-btn" type="button" data-close aria-label="${esc(t('close'))}">×</button></div>
    <div class="sheet-scroll" id="cart-body"></div>
    <div class="sheet-foot"><button class="btn block" type="button" id="submit"></button></div>
  </div>`;
  dlg.querySelector('[data-close]').onclick = () => dlg.close();
  $('#submit', dlg).onclick = submit;
  renderCart();
  dlg.showModal();
  if (!state.day) loadSlots();
}

function renderCart() {
  const dlg = $('#cart-sheet');
  const body = $('#cart-body', dlg);
  if (!body) return;
  const types = state.menu.location.orderTypes;
  const daySold = new Set(state.slotsData?.soldOut || []);
  const hasAlcohol = state.cart.some((i) => state.dishes.get(i.dishId).is_alcohol);
  const today = state.menu.today;
  const problems = [];
  if (hasAlcohol && state.type !== 'visit') problems.push(t('alcoholProblem'));
  if (state.cart.some((i) => daySold.has(i.dishId))) problems.push(t('soldProblem'));

  body.innerHTML = `
    <div class="card">${state.cart
      .map(
        (i, idx) => `<div class="cart-item">
          <div><b>${esc(tr(state.dishes.get(i.dishId).name))}</b>${daySold.has(i.dishId) ? ` <span class="pill bad">${esc(t('soldOutPill'))}</span>` : ''}
            ${i.optionIds.length ? `<small>${esc(optionNames(i))}</small>` : ''}<small>${fmt(unitPrice(i))}</small></div>
          <div class="qty"><button type="button" data-ci="${idx}" data-d="-1" aria-label="${esc(t('less'))}">−</button>${i.qty}<button type="button" data-ci="${idx}" data-d="1" aria-label="${esc(t('more'))}">+</button></div>
        </div>`,
      )
      .join('')}</div>
    <div class="line tot"><span>${esc(t('total'))}</span><span>${fmt(cartTotal())}</span></div>

    <h3 style="font-size:16px">${esc(t('howGet'))}</h3>
    <div class="seg">${types.map((t) => `<button type="button" data-type="${t}" aria-pressed="${state.type === t}">${esc(typeLabel(t))}</button>`).join('')}</div>
    <p class="muted" style="margin:0;font-size:13.5px">${
      state.type === 'visit'
        ? esc(t('visitHint'))
        : esc(t('pickupHint'))
    }</p>

    <h3 style="font-size:16px">${esc(t('when'))}</h3>
    <div class="days" id="days">${(state.slotsData?.days || [])
      .map((d) => {
        const l = dayLabel(d, today);
        return `<button type="button" class="day" data-day="${d}" aria-pressed="${d === state.day}">${l.top}<br>${l.bottom}</button>`;
      })
      .join('')}</div>
    <div class="slots" id="slots">${
      state.slotsData
        ? state.slotsData.slots
            .map((s) => {
              const off = s.state !== 'free';
              const note = s.state === 'full' ? t('slotFull') : s.state === 'too_soon' ? t('slotSoon') : s.left <= 2 ? t('slotLeft', { n: s.left }) : '';
              return `<button type="button" class="slot" data-slot="${s.time}" ${off ? 'disabled' : ''} aria-pressed="${state.slot === state.day + ' ' + s.time}">${s.time}${note ? `<small>${note}</small>` : ''}</button>`;
            })
            .join('') || `<p class="muted">${esc(t('noSlots'))}</p>`
        : `<p class="muted">${esc(t('slotsLoading'))}</p>`
    }</div>

    <h3 style="font-size:16px">${esc(t('contacts'))}</h3>
    <div class="field"><label for="g-name">${esc(t('name'))}</label><input id="g-name" autocomplete="name" value="${esc(state.guest.name)}" maxlength="60"></div>
    <div class="field"><label for="g-phone">${esc(t('phone'))}</label><input id="g-phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="+84 …" value="${esc(state.guest.phone)}" maxlength="20"></div>
    <div class="field"><label for="g-comment">${esc(t('comment'))}</label><textarea id="g-comment" maxlength="300" placeholder="${esc(t('commentPh'))}">${esc(state.comment)}</textarea></div>
    <p class="hint" style="margin:0">${esc(t('payHint'))}</p>
    ${problems.map((p) => `<p class="alert warn" style="margin:0">${esc(p)}</p>`).join('')}
    <p class="alert" id="cart-err" hidden style="margin:0"></p>`;

  const sub = $('#submit', dlg);
  sub.textContent = state.slot ? t('submitFor', { when: slotLabel(state.slot, today) }) : t('chooseTime');
  sub.disabled = !state.slot || state.cart.length === 0;

  body.onclick = (e) => {
    const q = e.target.closest('[data-ci]');
    if (q) {
      const it = state.cart[Number(q.dataset.ci)];
      it.qty += Number(q.dataset.d);
      if (it.qty <= 0) state.cart.splice(Number(q.dataset.ci), 1);
      if (it.qty > 20) it.qty = 20;
      saveCart();
      if (!state.cart.length) return dlg.close();
      return renderCart();
    }
    const t = e.target.closest('[data-type]');
    if (t && t.dataset.type !== state.type) { state.type = t.dataset.type; state.slot = null; return loadSlots(); }
    const d = e.target.closest('[data-day]');
    if (d && d.dataset.day !== state.day) { state.day = d.dataset.day; state.slot = null; return loadSlots(); }
    const s = e.target.closest('[data-slot]');
    if (s && !s.disabled) { state.slot = state.day + ' ' + s.dataset.slot; sessionStorage.removeItem('vibe_idem'); return renderCart(); }
  };
  body.oninput = (e) => {
    if (e.target.id === 'g-name') state.guest.name = e.target.value;
    if (e.target.id === 'g-phone') state.guest.phone = e.target.value;
    if (e.target.id === 'g-comment') state.comment = e.target.value;
  };
}

async function loadSlots() {
  const q = new URLSearchParams({ type: state.type });
  if (state.day) q.set('day', state.day);
  try {
    state.slotsData = await api('/api/slots?' + q);
    state.day = state.slotsData.day;
    // Если сегодня мест уже нет, сразу предлагаем завтра.
    if (!state.slotsData.slots.some((s) => s.state === 'free') && state.slotsData.days[1] && state.day === state.slotsData.days[0]) {
      state.day = state.slotsData.days[1];
      state.slotsData = await api('/api/slots?' + new URLSearchParams({ type: state.type, day: state.day }));
    }
  } catch {
    state.slotsData = null;
  }
  renderCart();
}

function showErr(msg) {
  const el = $('#cart-err');
  el.textContent = msg;
  el.hidden = false;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

let sending = false;
async function submit() {
  if (sending) return;
  const name = state.guest.name.trim();
  const phone = state.guest.phone.trim();
  if (!name) return showErr(t('needName'));
  if (!/^\+?[0-9 ()-]{7,20}$/.test(phone)) return showErr(t('badPhone'));
  save('vibe_guest', { name, phone });

  // Один ключ на одну попытку оформления: повторное нажатие или повтор после обрыва связи вернёт тот же заказ.
  let key = sessionStorage.getItem('vibe_idem');
  if (!key) { key = crypto.randomUUID(); sessionStorage.setItem('vibe_idem', key); }

  sending = true;
  const btn = $('#submit');
  btn.disabled = true;
  btn.textContent = t('submitting');
  try {
    const r = await api('/api/orders', {
      method: 'POST',
      body: {
        idempotencyKey: key,
        type: state.type,
        slot: state.slot,
        items: state.cart.map((i) => ({ dishId: i.dishId, qty: i.qty, optionIds: i.optionIds })),
        guest: { name, phone },
        comment: state.comment,
        lang: LANG,
        tgInitData: TGW ? TGW.initData : undefined,
      },
    });
    state.cart = [];
    save('vibe_cart', []);
    sessionStorage.removeItem('vibe_idem');
    const mine = load('vibe_orders', []);
    if (!mine.includes(r.token)) save('vibe_orders', [r.token, ...mine].slice(0, 10));
    location.href = '/order?t=' + encodeURIComponent(r.token) + (TGW ? '&tg=1' : '');
    return;
  } catch (e) {
    if (e.code !== 'NETWORK') sessionStorage.removeItem('vibe_idem');
    showErr(errText(e.code) || t('genericErr'));
    if (e.code === 'SLOT_FULL' || e.code === 'SLOT_TOO_SOON' || e.code === 'DISH_SOLD_OUT') {
      state.slot = e.code === 'DISH_SOLD_OUT' ? state.slot : null;
      await loadSlots();
      showErr(errText(e.code));
    }
  } finally {
    sending = false;
    const b = $('#submit');
    if (b && b.textContent === t('submitting')) { b.disabled = !state.slot; b.textContent = state.slot ? t('submitFor', { when: slotLabel(state.slot, state.menu.today) }) : t('chooseTime'); }
  }
}

$('#open-cart').onclick = () => (TABLE_CODE ? openTableCart() : openCart());
init();
