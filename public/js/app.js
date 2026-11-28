// Сайт гостя: меню → карточка блюда → корзина → время → оформление.
// Цену, наличие и время проверяет сервер; здесь только удобный показ.

// Тексты ошибок по кодам сервера — в i18n.js (err_<КОД>).
// В ответе сервера бывает название блюда (name) — подставляем его в текст.
const errText = (code, data = {}) => (I18N['err_' + code] ? t('err_' + code, data) : null);

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
/** Обязательная группа, в которой у строки корзины не выбран вариант (или null). */
function missingGroup(item) {
  const d = state.dishes.get(item.dishId);
  if (!d) return null;
  for (const g of d.groups) {
    if (g.min_select < 1 || !g.options.length) continue;
    if (g.options.filter((o) => item.optionIds.includes(o.id)).length < g.min_select) return g;
  }
  return null;
}

const lineKey = (dishId, optionIds) => dishId + '|' + [...optionIds].sort().join(',');
function addLine(cart, dishId, optionIds, qty) {
  const key = lineKey(dishId, optionIds);
  const same = cart.find((i) => i.key === key);
  if (same) same.qty = Math.min(20, same.qty + qty);
  else cart.push({ key, dishId, qty, optionIds });
}

/** Корзина по текущему меню. Корзина хранится в браузере и может быть собрана по старому меню:
 *  блюда, которых больше нет, убираем, исчезнувшие варианты снимаем. Обязательный вариант
 *  сами не подставляем — такая строка в корзине подсвечивается и просит выбрать. */
function cleanCart(items) {
  const out = [];
  for (const i of Array.isArray(items) ? items : []) {
    const d = i && state.dishes.get(i.dishId);
    if (!d) continue;
    const ids = Array.isArray(i.optionIds) ? i.optionIds : [];
    const optionIds = d.groups.flatMap((g) => g.options.filter((o) => ids.includes(o.id)).slice(0, Math.max(1, g.max_select)).map((o) => o.id));
    addLine(out, d.id, optionIds, Math.min(20, Math.max(1, parseInt(i.qty, 10) || 1)));
  }
  return out;
}

/** Блюдо на стопе: есть в меню, но заказать нельзя (ставит сотрудник во вкладке «Стоп-лист»). */
const isStopped = (id) => !!state.menu && (state.menu.soldOutToday.includes(id) || !!(state.slotsData && state.slotsData.soldOut.includes(id)));

/** Перед оформлением: если в корзине блюдо на стопе — показываем его строку и не отправляем. */
function blockStopped() {
  if (!stopProblem()) return false;
  const row = document.querySelector('#cart-sheet .cart-item.stop');
  if (row) { row.scrollIntoView({ block: 'center', behavior: 'smooth' }); row.classList.remove('shake'); void row.offsetWidth; row.classList.add('shake'); }
  return true;
}

/** Строки корзины с блюдами на стопе — текст предупреждения или null. */
function stopProblem() {
  const names = [...new Set(state.cart.filter((i) => isStopped(i.dishId)).map((i) => tr(state.dishes.get(i.dishId).name)))];
  return names.length ? t('stopProblem', { names: names.join(', ') }) : null;
}

// Блюда на стопе в сумму не входят: заказать их нельзя.
const cartTotal = () => state.cart.reduce((s, i) => s + (isStopped(i.dishId) ? 0 : unitPrice(i) * i.qty), 0);
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
  // Пришли из чата бота («Изменить в меню»): корзина из быстрого заказа заменяет корзину окна меню.
  const fromBot = !TABLE_CODE && new URLSearchParams(location.search).get('cart');
  if (fromBot) {
    state.cart = botCart(fromBot);
    saveCart();
    const u = new URL(location.href);
    u.searchParams.delete('cart');
    history.replaceState(null, '', u.pathname + u.search);
  }
  state.cart = cleanCart(state.cart);
  save(CART_KEY, state.cart);
  const hh = (v) => `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
  // Обычные часы 9:00–22:00. Если на сегодня в базе другое закрытие (разовое исключение), показываем «…, сегодня до N».
  const REG_OPEN = 540, REG_CLOSE = 1320;
  const regular = t('factHoursVal', { from: hh(REG_OPEN), to: hh(REG_CLOSE) });
  $('#f-hours').textContent = m.location.open === REG_OPEN && m.location.close === REG_CLOSE
    ? regular
    : `${regular}, ${t('factHoursToday', { to: hh(m.location.close) })}`;
  $('#f-addr').textContent = m.location.address;
  renderMenu();
  renderCartbar();
  // Из чата бота «🛵 Доставка»: сразу корзина с выбранной доставкой.
  const wantType = !TABLE_CODE && new URLSearchParams(location.search).get('type');
  if (wantType && m.location.orderTypes.includes(wantType)) state.type = wantType;
  if (TABLE_CODE) tableInit();
  else if ((fromBot || wantType) && state.cart.length) openCart();
}

/** «dish*2*opt1.opt2,dish2*1» → строки корзины. Неизвестные блюда и опции отбрасываем, цены — из меню. */
function botCart(param) {
  const out = [];
  for (const part of String(param).split(',').slice(0, 40)) {
    const [dishId, q, opts] = part.split('*');
    const d = state.dishes.get(dishId);
    if (!d) continue;
    const valid = new Set(d.groups.flatMap((g) => g.options.map((o) => o.id)));
    const optionIds = (opts ? opts.split('.') : []).filter((id) => valid.has(id));
    addLine(out, dishId, optionIds, Math.min(20, Math.max(1, parseInt(q, 10) || 1)));
  }
  return out;
}

function renderMenu() {
  const m = state.menu;
  const soldOut = new Set(m.soldOutToday);
  const sections = m.sections || [];
  const cats = m.categories.filter((c) => m.dishes.some((d) => d.category_id === c.id));
  const hits = new Set(m.hits || []);
  const dishCard = (d) => {
    const out = soldOut.has(d.id);
    return `<button type="button" class="card dish${out ? ' out' : ''}" data-dish="${d.id}">
      <div class="ph">${d.photo ? `<img src="${esc(d.photo)}" alt="" loading="lazy" width="92" height="92">` : ''}${hits.has(d.id) ? `<span class="tag-hit">★ ${esc(t('hitTag'))}</span>` : ''}${out ? `<span class="tag-out">${esc(t('soldOutToday'))}</span>` : ''}</div>
      <div class="body">
        <div><h3>${esc(tr(d.name))}${d.is_kids ? `<span class="tag-kids">${esc(t('kidsTag'))}</span>` : ''}</h3>
        ${tr(d.description) ? `<p>${esc(tr(d.description))}</p>` : ''}</div>
        <div class="row"><span class="price">${d.groups.some((g) => g.options.some((o) => o.price_delta > 0)) ? t('priceFrom', { p: fmt(d.price) }) : fmt(d.price)}</span>
        ${d.is_alcohol && !TABLE_CODE ? `<small class="muted">${esc(t('visitOnly'))}</small>` : ''}${out ? '' : '<span class="add" aria-hidden="true">+</span>'}</div>
      </div>
    </button>`;
  };
  // «Хиты продаж» вверху меню: главный хит крупной карточкой, дальше все блюда из быстрого заказа.
  const dod = m.dishOfDay && state.dishes.get(m.dishOfDay.dishId);
  const hitList = [...hits].filter((id) => id !== dod?.id).map((id) => state.dishes.get(id)).filter(Boolean);
  const dodOut = !!dod && soldOut.has(dod.id);
  const dodCard = dod
    ? `<button type="button" class="card dod${dodOut ? ' out' : ''}" data-dish="${dod.id}">
        <span class="dod-ph">${dod.photo ? `<img src="${esc(dod.photo)}" alt="" width="112" height="112">` : ''}${dodOut ? `<span class="tag-out">${esc(t('soldOutToday'))}</span>` : ''}</span>
        <span class="dod-body">
          <span class="dod-tag">★ ${esc(t('topHit'))}</span>
          <b>${esc(tr(dod.name))}</b>
          ${tr(m.dishOfDay.note) ? `<span class="dod-note">«${esc(tr(m.dishOfDay.note))}» — ${esc(t('chef'))}</span>` : tr(dod.description) ? `<span class="dod-note">${esc(tr(dod.description))}</span>` : ''}
          <span class="row"><span class="price">${fmt(dod.price)}</span>${dodOut ? `<span class="pill bad">${esc(t('soldOutPill'))}</span>` : `<span class="btn small">${esc(t('dodAdd'))}</span>`}</span>
        </span>
      </button>`
    : '';
  const hasHits = !!dod || hitList.length > 0;
  $('#dish-of-day').innerHTML = hasHits
    ? `<section class="cat hits" id="cat-hits">
        <h2 class="brush">★ ${esc(t('hitsTitle'))}</h2>
        ${dodCard}
        ${hitList.length ? `<div class="dishes">${hitList.map(dishCard).join('')}</div>` : ''}
      </section>`
    : '';
  $('#tabs').innerHTML = (hasHits ? `<a class="chip chip-hit" href="#cat-hits">★ ${esc(t('hitsTitle'))}</a>` : '') + cats.map((c) => `<a class="chip" href="#cat-${c.id}">${esc(tr(c.name))}</a>`).join('');
  $('#cats').innerHTML = cats
    .map((c) => {
      const items = m.dishes.filter((d) => d.category_id === c.id);
      // Раздел с группами (например, «Бар»): сначала плитки групп, по нажатию — напитки группы.
      const secs = sections
        .filter((x) => x.category_id === c.id)
        .map((x) => ({ ...x, items: items.filter((d) => d.section_id === x.id) }))
        .filter((x) => x.items.length);
      if (!secs.length) {
        return `<section class="cat" id="cat-${c.id}">
          <h2 class="brush">${esc(tr(c.name))}</h2>
          <div class="dishes">${items.map(dishCard).join('')}</div>
        </section>`;
      }
      const loose = items.filter((d) => !secs.some((x) => x.id === d.section_id));
      return `<section class="cat has-secs" id="cat-${c.id}">
        <h2 class="brush">${esc(tr(c.name))}</h2>
        <div class="sec-tiles" data-tiles="${c.id}">${secs
          .map((x) => {
            const alco = x.items.every((d) => d.is_alcohol);
            const sample = x.items.slice(0, 3).map((d) => tr(d.name)).join(', ') + (x.items.length > 3 ? '…' : '');
            return `<a class="sec-tile" href="#sec-${x.id}" data-sec="${x.id}">
              <span class="sec-ph">${x.photo ? `<img src="${esc(x.photo)}" alt="" loading="lazy">` : ''}</span>
              <span class="sec-txt"><b>${esc(tr(x.name))}</b><small>${esc(sample)}</small>
              ${alco && !TABLE_CODE ? `<small class="sec-note">${esc(t('visitOnly'))}</small>` : ''}</span>
            </a>`;
          })
          .join('')}</div>
        ${secs
          .map(
            (x) => `<div class="sec" id="sec-${x.id}" data-cat="${c.id}" hidden>
              <div class="sec-nav">
                <a class="chip sec-back" href="#cat-${c.id}">← ${esc(t('secAll'))}</a>
                ${secs.map((y) => `<a class="chip${y.id === x.id ? ' on' : ''}" href="#sec-${y.id}">${esc(tr(y.name))}</a>`).join('')}
              </div>
              <h3 class="sec-title">${esc(tr(x.name))}</h3>
              <div class="dishes">${x.items.map(dishCard).join('')}</div>
            </div>`,
          )
          .join('')}
        ${loose.length ? `<div class="dishes" data-loose="${c.id}">${loose.map(dishCard).join('')}</div>` : ''}
      </section>`;
    })
    .join('');
  $('#dish-of-day').onclick = (e) => {
    const b = e.target.closest('[data-dish]');
    if (b) openDish(b.dataset.dish);
  };
  $('#cats').addEventListener('click', (e) => {
    const b = e.target.closest('[data-dish]');
    if (b) openDish(b.dataset.dish);
  });
  // Группы открываются по адресу #sec-<id>: работает кнопка «Назад» телефона и ссылки на группу.
  window.addEventListener('hashchange', () => showSection(true));
  showSection(false);
  menuTabs();
}

/**
 * Строка разделов меню: закреплена сверху (CSS sticky), подсвечивает раздел, блюда которого сейчас на экране,
 * и сама сдвигается вбок, чтобы подсвеченная вкладка была видна. Нажатие плавно прокручивает к разделу.
 */
let tabsReady = false;
let tabsLock = 0; // пока идёт прокрутка после нажатия, подсветку не пересчитываем (не «мигает» по пути)
function menuTabs() {
  const tabs = $('#tabs');
  const bar = $('#tabs-bar');
  const chips = () => [...tabs.querySelectorAll('a.chip')];
  const target = (a) => document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1)));
  // Нижний край закреплённой строки: всё, что выше, уже «прочитано».
  const line = () => parseFloat(getComputedStyle(bar).top) + bar.offsetHeight;
  // За столом сверху закреплена ещё и плашка стола: строка разделов встаёт сразу под неё.
  const fitTop = () => {
    const tb = $('#tablebar');
    bar.style.top = tb && !tb.hidden ? `${tb.offsetHeight}px` : '';
    // Переход к разделу по ссылке (#cat-…) тоже останавливается под строкой, а не под ней спрятанным.
    document.documentElement.style.setProperty('--tabs-line', `${Math.round(line())}px`);
  };
  const mark = (a) => {
    chips().forEach((c) => {
      const on = c === a;
      c.classList.toggle('on', on);
      if (on) c.setAttribute('aria-current', 'true');
      else c.removeAttribute('aria-current');
    });
    if (!a || tabs.scrollWidth <= tabs.clientWidth) return fades();
    // Сдвигаем только саму строку вбок (не страницу): подсвеченная вкладка встаёт по центру, по бокам видны соседние.
    const r = a.getBoundingClientRect();
    const left = Math.round(tabs.scrollLeft + r.left - tabs.getBoundingClientRect().left - (tabs.clientWidth - r.width) / 2);
    if (Math.abs(tabs.scrollLeft - left) > 4) tabs.scrollTo({ left, behavior: 'smooth' });
  };
  // Затухание края — только там, куда ещё можно пролистать.
  const fades = () => {
    const max = tabs.scrollWidth - tabs.clientWidth;
    tabs.classList.toggle('fade-l', max > 2 && tabs.scrollLeft > 2);
    tabs.classList.toggle('fade-r', max > 2 && tabs.scrollLeft < max - 2);
  };
  const spy = () => {
    if (Date.now() < tabsLock) return;
    const list = chips();
    if (!list.length) return;
    const y = line() + 24;
    let cur = list[0];
    for (const a of list) {
      const el = target(a);
      if (el && !el.hidden && el.offsetParent && el.getBoundingClientRect().top <= y) cur = a;
    }
    // Долистали до самого низа: последний раздел может быть короче экрана, подсвечиваем его.
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) cur = list[list.length - 1];
    if (!cur.classList.contains('on')) mark(cur);
  };
  fitTop();
  spy();
  fades();
  if (tabsReady) return;
  tabsReady = true;
  let raf = 0;
  window.addEventListener('scroll', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; spy(); });
  }, { passive: true });
  window.addEventListener('resize', () => { fitTop(); spy(); fades(); });
  tabs.addEventListener('scroll', fades, { passive: true });
  // Плашка стола появляется после загрузки и может занимать две строки — подстраиваемся под её высоту.
  if (window.ResizeObserver && $('#tablebar')) new ResizeObserver(() => { fitTop(); spy(); }).observe($('#tablebar'));
  tabs.addEventListener('click', (e) => {
    const a = e.target.closest('a.chip');
    if (!a) return;
    const el = target(a);
    if (!el) return;
    e.preventDefault();
    // «Бар» с открытой группой напитков: по вкладке возвращаемся к плиткам групп.
    const h = decodeURIComponent(location.hash.slice(1));
    if (h.startsWith('sec-') && document.getElementById(h)?.dataset.cat === el.id.slice(4)) {
      history.replaceState(null, '', `#${el.id}`);
      showSection(false);
    }
    mark(a);
    const top = el.getBoundingClientRect().top + window.scrollY - line() - 8;
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    const wait = smooth ? 900 : 100;
    tabsLock = Date.now() + wait;
    window.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
    setTimeout(spy, wait + 50);
  });
}

/** Показать группу из адреса (#sec-…) или плитки групп (#cat-… / без адреса). */
function showSection(scroll) {
  const h = decodeURIComponent(location.hash.slice(1));
  const open = h.startsWith('sec-') ? document.getElementById(h) : null;
  document.querySelectorAll('.cat.has-secs').forEach((cat) => {
    const mine = open && open.dataset.cat === cat.id.slice(4);
    cat.querySelectorAll('.sec').forEach((x) => { x.hidden = !(mine && x === open); });
    cat.querySelector('.sec-tiles').hidden = !!mine;
    cat.querySelectorAll('[data-loose]').forEach((x) => { x.hidden = !!mine; });
    if (scroll && (mine || h === cat.id)) cat.scrollIntoView({ block: 'start' });
  });
}

function renderCartbar() {
  const n = cartCount();
  $('#cartbar').hidden = n === 0;
  $('#open-cart').textContent = t('cartBar', { n, sum: fmt(cartTotal()) });
}

// ---------- Карточка блюда ----------

/** Карточка блюда. editIdx — номер строки корзины: тогда карточка меняет варианты этой строки. */
function openDish(id, editIdx = null) {
  const d = state.dishes.get(id);
  const dlg = $('#dish-sheet');
  const soldToday = isStopped(id);
  const editing = editIdx === null ? null : state.cart[editIdx] || null;
  const miss = editing && missingGroup(editing);
  let qty = editing ? editing.qty : 1;
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
                (o) => `<div class="opt"><label><input type="${radio ? 'radio' : 'checkbox'}" name="g-${g.id}" value="${o.id}"${editing && editing.optionIds.includes(o.id) ? ' checked' : ''}>${esc(tr(o.name))}</label>
                ${o.price_delta ? `<span>+${fmt(o.price_delta)}</span>` : ''}</div>`,
              )
              .join('')}
          </fieldset>`;
        })
        .join('')}
      <p class="alert" id="dish-err" ${miss ? '' : 'hidden'} style="margin:0">${miss ? esc(t('choose', { x: tr(miss.name) })) : ''}</p>
    </div>
    <div class="sheet-foot">
      <div class="qty"><button type="button" data-q="-1" aria-label="${esc(t('less'))}">−</button><span id="dq">1</span><button type="button" data-q="1" aria-label="${esc(t('more'))}">+</button></div>
      <button class="btn" style="flex:1" value="add" id="dish-add"></button>
    </div>
  </form>`;
  const chosen = () => [...dlg.querySelectorAll('input:checked')].map((i) => i.value);
  const refresh = () => {
    $('#dq', dlg).textContent = qty;
    // На стопе: блюдо видно, но добавить его нельзя.
    if (soldToday) { $('#dish-add', dlg).textContent = t('stopBtn'); $('#dish-add', dlg).disabled = true; return; }
    $('#dish-add', dlg).textContent = t(editing ? 'saveChoice' : 'addToCart', { sum: fmt(unitPrice({ dishId: id, optionIds: chosen() }) * qty) });
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
  if (soldToday) $('.qty', dlg).hidden = true;
  $('#dish-add', dlg).addEventListener('click', (e) => {
    if (soldToday) { e.preventDefault(); return; }
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
    if (editing && state.cart.includes(editing)) {
      // Меняем строку на месте; если такая же строка уже есть, сливаем их.
      const key = lineKey(id, ids);
      const twin = state.cart.find((i) => i !== editing && i.key === key);
      if (twin) {
        twin.qty = Math.min(20, twin.qty + qty);
        state.cart.splice(state.cart.indexOf(editing), 1);
      } else Object.assign(editing, { key, qty, optionIds: ids });
    } else addLine(state.cart, id, ids, qty);
    saveCart();
    rerenderCart();
  });
  refresh();
  dlg.showModal();
  if (miss) dlg.querySelector(`fieldset[data-group="${miss.id}"]`)?.scrollIntoView({ block: 'center' });
}

/** Корзина открыта под карточкой блюда — перерисовать её после изменения. */
function rerenderCart() {
  if ($('#cart-sheet').open) (TABLE_CODE ? renderTableCart() : renderCart());
}

// ---------- Корзина и оформление ----------

function optionNames(item) {
  const d = state.dishes.get(item.dishId);
  const names = [];
  for (const g of d.groups) for (const o of g.options) if (item.optionIds.includes(o.id)) names.push(tr(o.name));
  return names.join(', ');
}

/** Строка корзины (сайт и заказ со стола): выбранные варианты, а если обязательный не выбран —
 *  строка подсвечена и есть кнопка «Выбрать», которая открывает карточку блюда прямо из корзины. */
function cartLineHtml(i, idx, extra = '') {
  const d = state.dishes.get(i.dishId);
  if (isStopped(i.dishId)) {
    // Блюдо поставили на стоп, пока оно лежало в корзине: строка подсвечена, одна кнопка — убрать.
    return `<div class="cart-item need stop" data-line="${idx}">
      <div><b>${esc(tr(d.name))}</b> <span class="pill bad">${esc(t('soldOutPill'))}</span>
        <small>${esc(t('stopLine'))}</small></div>
      <button type="button" class="btn small ghost" data-rm="${idx}">${esc(t('remove'))}</button>
    </div>`;
  }
  const miss = missingGroup(i);
  const names = optionNames(i);
  const action = miss
    ? `<button type="button" class="need-opt" data-edit="${idx}">${esc(t('needOption', { x: tr(miss.name) }))}<span>${esc(t('pickOption'))} ›</span></button>`
    : d.groups.some((g) => g.options.length)
      ? ` · <button type="button" class="edit-opt" data-edit="${idx}">${esc(t('changeOption'))}</button>`
      : '';
  return `<div class="cart-item${miss ? ' need' : ''}" data-line="${idx}">
    <div><b>${esc(tr(d.name))}</b>${extra}
      ${names ? `<small class="ci-opts">${esc(names)}</small>` : ''}
      ${miss ? action : ''}<small>${fmt(unitPrice(i))}${miss ? '' : action}</small></div>
    <div class="qty"><button type="button" data-ci="${idx}" data-d="-1" aria-label="${esc(t('less'))}">−</button>${i.qty}<button type="button" data-ci="${idx}" data-d="1" aria-label="${esc(t('more'))}">+</button></div>
  </div>`;
}

/** Кнопка «Убрать» у блюда на стопе. true — строка убрана. */
function removeStopped(e) {
  const rm = e.target.closest('[data-rm]');
  if (!rm) return false;
  state.cart.splice(Number(rm.dataset.rm), 1);
  saveCart();
  renderCartbar();
  return true;
}

/** Строки, где не выбран обязательный вариант, — текст предупреждения или null. */
function optionProblem() {
  const names = state.cart.filter(missingGroup).map((i) => tr(state.dishes.get(i.dishId).name));
  return names.length ? t('optionProblem', { names: [...new Set(names)].join(', ') }) : null;
}

/** Перед оформлением: если вариант не выбран, называем блюдо и сразу открываем выбор. */
function askMissingOption(showError) {
  const idx = state.cart.findIndex(missingGroup);
  if (idx < 0) return false;
  const it = state.cart[idx];
  showError(t('err_OPTION_REQUIRED', { name: tr(state.dishes.get(it.dishId).name) }));
  openDish(it.dishId, idx);
  return true;
}

/** Сервер сказал, что варианты блюда не сходятся с меню: берём свежее меню и чистим корзину. */
async function refreshMenuData() {
  try {
    state.menu = await api('/api/menu');
    state.dishes = new Map(state.menu.dishes.map((d) => [d.id, d]));
    state.cart = cleanCart(state.cart);
    saveCart();
  } catch { /* остаёмся на старом меню */ }
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
  const hasAlcohol = state.cart.some((i) => state.dishes.get(i.dishId).is_alcohol);
  const today = state.menu.today;
  const problems = [];
  if (hasAlcohol && state.type !== 'visit') problems.push(t('alcoholProblem'));
  const stop = stopProblem();
  if (stop) problems.unshift(stop);
  const delivery = state.type === 'delivery' && !!state.menu.location.delivery;
  const subtotal = cartTotal();
  const dProblem = delivery ? dlvProblem(subtotal) : null;
  if (dProblem) problems.push(dProblem);
  const optProblem = optionProblem();
  if (optProblem) problems.unshift(optProblem);

  body.innerHTML = `
    <div class="card">${state.cart
      .map((i, idx) => cartLineHtml(i, idx))
      .join('')}</div>
    ${delivery ? dlvTotalsHtml(subtotal) : `<div class="line tot"><span>${esc(t('total'))}</span><span>${fmt(subtotal)}</span></div>`}

    <h3 style="font-size:16px">${esc(t('howGet'))}</h3>
    <div class="seg">${types.map((t) => `<button type="button" data-type="${t}" aria-pressed="${state.type === t}">${esc(typeLabel(t))}</button>`).join('')}</div>
    <p class="muted" style="margin:0;font-size:13.5px">${
      state.type === 'visit'
        ? esc(t('visitHint'))
        : state.type === 'delivery'
          ? esc(t('deliveryHint', { m: state.menu.location.delivery?.leadMin ?? 40 }))
          : esc(t('pickupHint'))
    }</p>
    ${delivery ? dlvHtml() : ''}

    <h3 style="font-size:16px">${esc(t(delivery ? 'whenDelivery' : 'when'))}</h3>
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
    <div class="field"><label for="g-phone">${esc(t(state.type === 'delivery' ? 'phoneOpt' : 'phone'))}</label><input id="g-phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="+84 …" value="${esc(state.guest.phone)}" maxlength="20"></div>
    ${state.type === 'delivery' && !TGW ? `<p class="muted" style="margin:-4px 0 0;font-size:13px">${esc(t('phoneOptHint'))}</p>` : ''}
    <div class="field"><label for="g-comment">${esc(t('comment'))}</label><textarea id="g-comment" maxlength="300" placeholder="${esc(t('commentPh'))}">${esc(state.comment)}</textarea></div>
    <p class="hint" style="margin:0">${esc(t('payHint'))}</p>
    ${problems.map((p) => `<p class="alert warn" style="margin:0">${esc(p)}</p>`).join('')}
    <p class="alert" id="cart-err" hidden style="margin:0"></p>`;

  const sub = $('#submit', dlg);
  sub.textContent = state.slot ? t('submitFor', { when: slotLabel(state.slot, today) }) : t('chooseTime');
  sub.disabled = !state.slot || state.cart.length === 0;
  if (delivery) dlvMount(renderCart);

  body.onclick = (e) => {
    const ed = e.target.closest('[data-edit]');
    if (ed) return openDish(state.cart[Number(ed.dataset.edit)].dishId, Number(ed.dataset.edit));
    if (removeStopped(e)) return state.cart.length ? renderCart() : dlg.close();
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
  if (blockStopped()) return;
  if (askMissingOption(showErr)) return;
  const name = state.guest.name.trim();
  const phone = state.guest.phone.trim();
  if (!name) return showErr(t('needName'));
  if (!(state.type === 'delivery' && !phone) && !/^\+?[0-9 ()-]{7,20}$/.test(phone)) return showErr(t('badPhone'));
  if (state.type === 'delivery') {
    const p = dlvProblem(cartTotal());
    if (p) return showErr(p);
  }
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
        delivery: state.type === 'delivery' ? dlvPayload() : undefined,
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
    if (e.code === 'OPTION_REQUIRED' || e.code === 'OPTION_INVALID' || e.code === 'DISH_SOLD_OUT') {
      await refreshMenuData();
      renderCart();
    }
    if (e.code === 'DELIVERY_OFF') { await refreshMenuData(); state.type = 'pickup'; state.slot = null; await loadSlots(); }
    const data = { ...e.data };
    if (typeof data.min === 'number') data.min = fmt(data.min);
    showErr(errText(e.code, data) || t('genericErr'));
    if (e.code === 'SLOT_FULL' || e.code === 'SLOT_TOO_SOON' || e.code === 'DISH_SOLD_OUT') {
      state.slot = e.code === 'DISH_SOLD_OUT' ? state.slot : null;
      await loadSlots();
      showErr(errText(e.code, e.data));
    }
  } finally {
    sending = false;
    const b = $('#submit');
    if (b && b.textContent === t('submitting')) { b.disabled = !state.slot; b.textContent = state.slot ? t('submitFor', { when: slotLabel(state.slot, state.menu.today) }) : t('chooseTime'); }
  }
}

$('#open-cart').onclick = () => (TABLE_CODE ? openTableCart() : openCart());
// Telegram и браузер держат окно меню открытым в фоне. Если гость вернулся спустя 5+ минут
// (или страница восстановлена из кэша), перезагружаем её, чтобы цены и стоп-лист были свежими.
// Корзина хранится в браузере и не теряется; открытую карточку блюда или корзину не трогаем.
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (hiddenAt && Date.now() - hiddenAt > 5 * 60 * 1000 && !document.querySelector('dialog[open]')) location.reload();
});
window.addEventListener('pageshow', (e) => { if (e.persisted) location.reload(); });

init();
