// Доставка в корзине: адрес, точка на карте, расстояние и цена.
// Цену здесь только показываем заранее; при оформлении сервер считает её сам по тем же правилам (src/lib/delivery.ts).
// Карта — Leaflet (лежит у нас в /vendor/leaflet) с картой OpenStreetMap, поиск адреса — Nominatim (OpenStreetMap). Оба бесплатны.
// Плитки и поиск идут через наш сайт (/map/tile, /api/geocode): у части гостей сервера OSM напрямую не открываются.

const DLV_KEY = 'vibe_addr';
const dlv = {
  addr: (() => { try { return JSON.parse(localStorage.getItem(DLV_KEY)) || {}; } catch { return {}; } })(),
  map: null,
  pin: null,
  el: null, // контейнер карты живёт между перерисовками корзины
  leaflet: null, // промис загрузки Leaflet
  failed: false,
  tilesOk: false, // пришла хотя бы одна плитка карты
  tileWait: null, // таймер: ждём плитки, иначе считаем, что карта не загрузилась
  reported: false, // отчёт о загрузке карты уже отправили
  note: '', // подсказка под картой (нашли адрес / не нашли)
  busy: false,
  locating: false, // ждём местоположение от телефона
  photo: null, // фото места (сжатый JPEG), уйдёт сразу после оформления заказа
  photoUrl: '', // превью в корзине
  photoBusy: false,
};
if (typeof dlv.addr.address !== 'string') dlv.addr.address = '';

function dlvSave() {
  try { localStorage.setItem(DLV_KEY, JSON.stringify(dlv.addr)); } catch { /* приватный режим */ }
}

const dlvConf = () => state.menu && state.menu.location.delivery;
const dlvPoint = () => (typeof dlv.addr.lat === 'number' && typeof dlv.addr.lng === 'number' ? { lat: dlv.addr.lat, lng: dlv.addr.lng } : null);

function dlvKm(a, b) {
  const R = 6371;
  const rad = (x) => (x * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))) * 10) / 10;
}

/** Расчёт как на сервере: null — точки нет; иначе км, цена и что мешает оформить. */
function dlvQuote(subtotal) {
  const d = dlvConf();
  const p = dlvPoint();
  if (!d || !p) return null;
  const km = dlvKm({ lat: d.lat, lng: d.lng }, p);
  const extra = Math.max(0, Math.ceil(km - d.baseKm - 1e-9));
  const baseFee = d.baseFee + extra * d.perKm;
  const free = d.freeFrom > 0 && subtotal >= d.freeFrom;
  return { km, fee: free ? 0 : baseFee, free, tooFar: km > d.radiusKm, minShort: d.minOrder > 0 && subtotal < d.minOrder ? d.minOrder - subtotal : 0 };
}

const kmText = (km) => (LANG === 'en' ? String(km) : String(km).replace('.', ','));

/** Можно ли оформлять доставку: текст проблемы или null. */
function dlvProblem(subtotal) {
  const d = dlvConf();
  if (!d) return t('err_DELIVERY_OFF');
  const q = dlvQuote(subtotal);
  if (!q) return t('needPoint');
  if (q.tooFar) return t('tooFar', { km: kmText(q.km), r: kmText(d.radiusKm) });
  if (q.minShort) return t('minOrderProblem', { x: fmt(d.minOrder), y: fmt(q.minShort) });
  return null;
}

/** Блок «Куда привезти» в корзине. Карта вставляется после перерисовки (dlvMount). */
function dlvHtml(subtotal) {
  const d = dlvConf();
  const q = dlvQuote(subtotal);
  const tariff = d.freeFrom > 0
    ? t('tariffHint', { base: fmt(d.baseFee), bkm: kmText(d.baseKm), per: fmt(d.perKm), free: fmt(d.freeFrom) })
    : t('tariffHintNoFree', { base: fmt(d.baseFee), bkm: kmText(d.baseKm), per: fmt(d.perKm) });
  return `
    <h3 style="font-size:16px">${esc(t('addrTitle'))}</h3>
    <div class="field"><label for="d-addr">${esc(t('addrLabel'))}</label>
      <input id="d-addr" autocomplete="street-address" maxlength="200" placeholder="${esc(t('addrPh'))}" value="${esc(dlv.addr.address)}"></div>
    <div class="dlv-btns">
      <button type="button" class="btn small ghost" data-dlv="find"${dlv.busy ? ' disabled' : ''}>${esc(dlv.busy ? t('addrFinding') : t('addrFind'))}</button>
      <button type="button" class="btn small ghost" data-dlv="me"${dlv.locating ? ' disabled' : ''}>${esc(dlv.locating ? t('addrLocatingBtn') : t('addrMe'))}</button>
    </div>
    <div id="dmap-slot"></div>
    <p class="muted dlv-note" id="dlv-note">${esc(dlv.note || (dlv.failed ? t('mapFailed') : t('addrMapHint')))}</p>
    ${q && !q.tooFar ? `<p class="dlv-dist">🛵 ${esc(t('dist', { km: kmText(q.km) }))}</p>` : ''}
    ${q && q.tooFar ? `<p class="alert warn" style="margin:0">${esc(t('tooFar', { km: kmText(q.km), r: kmText(d.radiusKm) }))}</p>` : ''}
    <p class="muted" style="margin:0;font-size:13px">${esc(tariff)}</p>
    ${dlvPhotoHtml()}`;
}

/** Фото места для курьера (по желанию): вход, ворота, отель. */
function dlvPhotoHtml() {
  return `<div class="dlv-photo">
    <b style="font-size:15px">${esc(t('photoTitle'))}</b>
    <span class="muted" style="font-size:13px">${esc(t('photoHint'))}</span>
    ${dlv.photoUrl ? `<div class="dlv-photo-row"><img src="${esc(dlv.photoUrl)}" alt="${esc(t('photoTitle'))}"><button type="button" class="btn small ghost" data-dlv="photo-del">${esc(t('photoRemove'))}</button></div>` : ''}
    <label class="btn small ghost dlv-photo-btn"${dlv.photoBusy ? ' aria-disabled="true"' : ''}>${esc(dlv.photoBusy ? t('photoBusy') : dlv.photoUrl ? t('photoReplace') : t('photoAdd'))}
      <input type="file" accept="image/*" id="d-photo" hidden></label>
  </div>`;
}

async function dlvPickPhoto(file, rerender) {
  if (!file) return;
  dlv.photoBusy = true;
  rerender();
  try {
    const blob = await shrinkPhoto(file);
    if (dlv.photoUrl) URL.revokeObjectURL(dlv.photoUrl);
    dlv.photo = blob;
    dlv.photoUrl = URL.createObjectURL(blob);
  } catch {
    dlv.note = t('photoBad');
  }
  dlv.photoBusy = false;
  rerender();
}

function dlvDropPhoto(rerender) {
  if (dlv.photoUrl) URL.revokeObjectURL(dlv.photoUrl);
  dlv.photo = null;
  dlv.photoUrl = '';
  rerender();
}

/** После оформления: отправляем фото места к заказу. Не получилось — гость добавит его на странице заказа. */
async function dlvSendPhoto(token) {
  if (!dlv.photo) return true;
  try {
    await Promise.race([uploadPlacePhoto(token, dlv.photo), new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), 20000))]);
    dlvDropPhoto(() => {});
    return true;
  } catch {
    return false;
  }
}

/** Строки «Блюда / Доставка / Итого». */
function dlvTotalsHtml(subtotal) {
  const d = dlvConf();
  const q = dlvQuote(subtotal);
  const feeText = !q || q.tooFar ? t('deliveryTbd') : q.free ? t('deliveryFree') : fmt(q.fee);
  const left = d && d.freeFrom > 0 && q && !q.free && !q.tooFar ? d.freeFrom - subtotal : 0;
  return `<div class="line"><span>${esc(t('dishesSum'))}</span><span>${fmt(subtotal)}</span></div>
    <div class="line"><span>${esc(t('deliveryFee'))}</span><span>${esc(feeText)}</span></div>
    <div class="line tot"><span>${esc(t('total'))}</span><span>${fmt(subtotal + (q && !q.tooFar ? q.fee : 0))}</span></div>
    ${left > 0 ? `<p class="muted" style="margin:0;font-size:13px">${esc(t('freeFromHint', { x: fmt(left) }))}</p>` : ''}`;
}

function dlvLoadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (dlv.leaflet) return dlv.leaflet;
  dlv.leaflet = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = '/vendor/leaflet/leaflet.css';
    document.head.appendChild(css);
    const s = document.createElement('script');
    s.src = '/vendor/leaflet/leaflet.js';
    s.onload = () => resolve(window.L);
    s.onerror = () => reject(new Error('leaflet'));
    document.head.appendChild(s);
  });
  return dlv.leaflet;
}

/** После перерисовки корзины: ставим карту на место и подключаем кнопки. */
function dlvMount(rerender) {
  const slot = document.getElementById('dmap-slot');
  if (!slot) return;
  if (!dlv.el) {
    dlv.el = document.createElement('div');
    dlv.el.className = 'dlv-map';
    dlv.el.innerHTML = `<p class="muted" style="margin:0;padding:16px">${esc(t('mapLoading'))}</p>`;
  }
  slot.replaceWith(dlv.el);
  const addr = document.getElementById('d-addr');
  if (addr) {
    addr.oninput = () => { dlv.addr.address = addr.value; dlvSave(); };
    addr.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); dlvFind(rerender); } };
  }
  document.querySelectorAll('[data-dlv]').forEach((b) => {
    const k = b.dataset.dlv;
    b.onclick = () => (k === 'find' ? dlvFind(rerender) : k === 'photo-del' ? dlvDropPhoto(rerender) : dlvLocate(rerender));
  });
  const ph = document.getElementById('d-photo');
  if (ph) ph.onchange = () => dlvPickPhoto(ph.files && ph.files[0], rerender);
  if (dlv.map) { dlv.map.invalidateSize(); return; }
  if (dlv.failed) return;
  dlvLoadLeaflet().then((L) => dlvInitMap(L, rerender)).catch(() => { dlv.failed = true; dlv.el.innerHTML = ''; dlv.el.hidden = true; dlvReport(false, 0, 'leaflet'); rerender(); });
}

/** Один короткий отчёт на сервер: загрузилась ли карта у гостя (для проверки на реальных телефонах, в логах воркера). */
function dlvReport(ok, ms, what = 'tiles') {
  if (dlv.reported) return;
  dlv.reported = true;
  try {
    const w = window.Telegram && window.Telegram.WebApp;
    const body = JSON.stringify({ ok, ms, what, tg: w && w.initData ? (w.platform || 'tg') : '', online: navigator.onLine });
    if (!(navigator.sendBeacon && navigator.sendBeacon('/api/maplog', new Blob([body], { type: 'application/json' })))) {
      fetch('/api/maplog', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
    }
  } catch { /* отчёт не важен для гостя */ }
}

function dlvInitMap(L, rerender) {
  if (dlv.map) return;
  const d = dlvConf();
  const home = [d.lat, d.lng];
  const p = dlvPoint();
  dlv.el.innerHTML = '';
  L.Icon.Default.imagePath = '/vendor/leaflet/images/';
  dlv.map = L.map(dlv.el, { zoomControl: true, attributionControl: true, tap: true, minZoom: 11, maxBounds: [[11.9, 108.9], [12.6, 109.5]], maxBoundsViscosity: 1 }).setView(p ? [p.lat, p.lng] : home, p ? 15 : 13);
  const started = Date.now();
  const tiles = L.tileLayer('/map/tile/{z}/{x}/{y}.png', {
    maxZoom: 19,
    minZoom: 11,
    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  }).addTo(dlv.map);
  // Leaflet загрузился, но сами плитки карты могут не прийти (нет сети, блокировка).
  // Тогда серая сетка гостю бесполезна: прячем её и подсказываем «Найти на карте» и «Я здесь».
  tiles.on('tileload', () => {
    if (dlv.tilesOk) return;
    dlv.tilesOk = true;
    clearTimeout(dlv.tileWait);
    dlvReport(true, Date.now() - started);
    if (dlv.failed) { dlv.failed = false; dlv.el.hidden = false; rerender(); dlv.map.invalidateSize(); }
  });
  dlv.tileWait = setTimeout(() => {
    if (dlv.tilesOk) return;
    dlv.failed = true;
    dlv.el.hidden = true;
    dlvReport(false, Date.now() - started);
    rerender();
  }, 12000);
  dlv.map.attributionControl.setPrefix(false);
  L.circle(home, { radius: d.radiusKm * 1000, color: '#2f5233', weight: 1, fillOpacity: 0.04, interactive: false }).addTo(dlv.map);
  L.marker(home, {
    interactive: false,
    icon: L.divIcon({ className: 'dlv-home', html: '<span>VIBE</span>', iconSize: [44, 24], iconAnchor: [22, 12] }),
  }).addTo(dlv.map);
  dlv.map.on('click', (e) => dlvSet(e.latlng.lat, e.latlng.lng, '', rerender));
  if (p) dlvPin(L, p);
}

function dlvPin(L, p) {
  if (!dlv.map) return;
  if (dlv.pin) { dlv.pin.setLatLng([p.lat, p.lng]); return; }
  dlv.pin = L.marker([p.lat, p.lng], { draggable: true, autoPan: true }).addTo(dlv.map);
  dlv.pin.on('dragend', () => {
    const ll = dlv.pin.getLatLng();
    dlvSet(ll.lat, ll.lng, '', dlv.rerender);
  });
}

/** Новая точка доставки: сохраняем, двигаем метку, пересчитываем цену. */
function dlvSet(lat, lng, note, rerender, pan = false) {
  dlv.addr.lat = Math.round(lat * 1e6) / 1e6;
  dlv.addr.lng = Math.round(lng * 1e6) / 1e6;
  dlv.note = note;
  dlvSave();
  dlv.rerender = rerender;
  if (window.L && dlv.map) {
    dlvPin(window.L, dlvPoint());
    if (pan) dlv.map.setView([dlv.addr.lat, dlv.addr.lng], 16);
  }
  sessionStorage.removeItem('vibe_idem');
  rerender();
}

/** Поиск адреса по тексту (только по кнопке, не на каждую букву — так требует OpenStreetMap). */
async function dlvFind(rerender) {
  const q = (dlv.addr.address || '').trim();
  if (q.length < 3 || dlv.busy) { document.getElementById('d-addr')?.focus(); return; }
  dlv.busy = true;
  rerender();
  try {
    // Ищем через наш сайт (он спрашивает OpenStreetMap), только в районе Нячанга.
    const r = await fetch(`/api/geocode?${new URLSearchParams({ q, lang: LANG })}`);
    const res = r.ok ? await r.json() : { found: null };
    dlv.busy = false;
    if (!res.found) { dlv.note = t('addrNotFound'); return rerender(); }
    dlvSet(res.found.lat, res.found.lng, t('addrFound', { x: res.found.name }), rerender, true);
  } catch {
    dlv.busy = false;
    dlv.note = t('addrNotFound');
    rerender();
  }
}

/** «📍 Я здесь»: в Telegram — его собственный запрос местоположения, на сайте — геолокация браузера. */
function dlvLocate(rerender) {
  if (dlv.locating) return;
  const done = (lat, lng) => { dlv.locating = false; dlvSet(lat, lng, t('addrGeoOk'), rerender, true); };
  const fail = (key) => { dlv.locating = false; dlv.note = t(key); rerender(); };
  dlv.locating = true;
  dlv.note = t('addrLocating');
  rerender();
  const lm = typeof TGW !== 'undefined' && TGW && TGW.LocationManager;
  if (lm && TGW.isVersionAtLeast && TGW.isVersionAtLeast('8.0')) {
    const ask = () => {
      if (!lm.isLocationAvailable) return dlvBrowserLocate(done, fail);
      lm.getLocation((loc) => {
        if (loc && typeof loc.latitude === 'number') return done(loc.latitude, loc.longitude);
        // Гость запретил доступ боту: подсказываем и открываем настройки Telegram.
        if (lm.isAccessRequested && !lm.isAccessGranted) {
          fail('addrGeoTgDenied');
          try { lm.openSettings(); } catch { /* старая версия */ }
          return;
        }
        dlvBrowserLocate(done, fail);
      });
    };
    try { lm.isInited ? ask() : lm.init(ask); } catch { dlvBrowserLocate(done, fail); }
    return;
  }
  dlvBrowserLocate(done, fail);
}

function dlvBrowserLocate(done, fail) {
  if (!navigator.geolocation) return fail('addrGeoFail');
  const go = (high) => navigator.geolocation.getCurrentPosition(
    (pos) => done(pos.coords.latitude, pos.coords.longitude),
    (err) => {
      if (err && err.code === 1) return fail('addrGeoDenied');
      // В помещении точный GPS может не успеть: пробуем ещё раз по сети.
      if (high) return go(false);
      fail('addrGeoOff');
    },
    { enableHighAccuracy: high, timeout: high ? 10000 : 15000, maximumAge: 120000 },
  );
  go(true);
}

/** Что отправить на сервер вместе с заказом. */
function dlvPayload() {
  const p = dlvPoint();
  return { address: (dlv.addr.address || '').trim(), lat: p ? p.lat : undefined, lng: p ? p.lng : undefined };
}
