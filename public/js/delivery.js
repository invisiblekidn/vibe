// Доставка в корзине: адрес, точка на карте, расстояние и цена.
// Цену здесь только показываем заранее; при оформлении сервер считает её сам по тем же правилам (src/lib/delivery.ts).
// Карта — Leaflet (лежит у нас в /vendor/leaflet) с картой OpenStreetMap, поиск адреса — Nominatim (OpenStreetMap). Оба бесплатны.

const DLV_KEY = 'vibe_addr';
const dlv = {
  addr: (() => { try { return JSON.parse(localStorage.getItem(DLV_KEY)) || {}; } catch { return {}; } })(),
  map: null,
  pin: null,
  el: null, // контейнер карты живёт между перерисовками корзины
  leaflet: null, // промис загрузки Leaflet
  failed: false,
  note: '', // подсказка под картой (нашли адрес / не нашли)
  busy: false,
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
      <button type="button" class="btn small ghost" data-dlv="me">${esc(t('addrMe'))}</button>
    </div>
    <div id="dmap-slot"></div>
    <p class="muted dlv-note" id="dlv-note">${esc(dlv.failed ? t('mapFailed') : dlv.note || t('addrMapHint'))}</p>
    ${q && !q.tooFar ? `<p class="dlv-dist">🛵 ${esc(t('dist', { km: kmText(q.km) }))}</p>` : ''}
    ${q && q.tooFar ? `<p class="alert warn" style="margin:0">${esc(t('tooFar', { km: kmText(q.km), r: kmText(d.radiusKm) }))}</p>` : ''}
    <p class="muted" style="margin:0;font-size:13px">${esc(tariff)}</p>`;
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
    b.onclick = () => (b.dataset.dlv === 'find' ? dlvFind(rerender) : dlvLocate(rerender));
  });
  if (dlv.map) { dlv.map.invalidateSize(); return; }
  if (dlv.failed) return;
  dlvLoadLeaflet().then((L) => dlvInitMap(L, rerender)).catch(() => { dlv.failed = true; dlv.el.innerHTML = ''; dlv.el.hidden = true; rerender(); });
}

function dlvInitMap(L, rerender) {
  if (dlv.map) return;
  const d = dlvConf();
  const home = [d.lat, d.lng];
  const p = dlvPoint();
  dlv.el.innerHTML = '';
  L.Icon.Default.imagePath = '/vendor/leaflet/images/';
  dlv.map = L.map(dlv.el, { zoomControl: true, attributionControl: true, tap: true }).setView(p ? [p.lat, p.lng] : home, p ? 15 : 13);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  }).addTo(dlv.map);
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
    // Ищем только в районе Нячанга.
    const u = new URL('https://nominatim.openstreetmap.org/search');
    u.search = new URLSearchParams({ format: 'jsonv2', limit: '1', countrycodes: 'vn', viewbox: '108.95,12.50,109.40,12.00', bounded: '1', 'accept-language': LANG, q }).toString();
    const r = await fetch(u.toString());
    const list = r.ok ? await r.json() : [];
    dlv.busy = false;
    if (!list.length) { dlv.note = t('addrNotFound'); return rerender(); }
    const name = String(list[0].display_name || '').split(',').slice(0, 3).join(',');
    dlvSet(Number(list[0].lat), Number(list[0].lon), t('addrFound', { x: name }), rerender, true);
  } catch {
    dlv.busy = false;
    dlv.note = t('addrNotFound');
    rerender();
  }
}

function dlvLocate(rerender) {
  if (!navigator.geolocation) { dlv.note = t('addrGeoFail'); return rerender(); }
  navigator.geolocation.getCurrentPosition(
    (pos) => dlvSet(pos.coords.latitude, pos.coords.longitude, '', rerender, true),
    () => { dlv.note = t('addrGeoFail'); rerender(); },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
  );
}

/** Что отправить на сервер вместе с заказом. */
function dlvPayload() {
  const p = dlvPoint();
  return { address: (dlv.addr.address || '').trim(), lat: p ? p.lat : undefined, lng: p ? p.lng : undefined };
}
