// Доставка в корзине: только по зданию «Наполеон» (Napoleon Castle 1). Гость указывает этаж и квартиру.
// Цену и минимум здесь только показываем заранее; при оформлении сервер проверяет их сам (src/lib/delivery.ts).

const DLV_KEY = 'vibe_apt';
const dlv = {
  apt: (() => { try { return JSON.parse(localStorage.getItem(DLV_KEY)) || {}; } catch { return {}; } })(),
};
if (typeof dlv.apt.floor !== 'string') dlv.apt.floor = '';
if (typeof dlv.apt.apt !== 'string') dlv.apt.apt = '';

function dlvSave() {
  try { localStorage.setItem(DLV_KEY, JSON.stringify(dlv.apt)); } catch { /* приватный режим */ }
}

const dlvConf = () => state.menu && state.menu.location.delivery;

/** Этаж и квартира, как их проверит сервер: null — не заполнено или неверно. */
function dlvApt() {
  const d = dlvConf();
  const floor = Number(String(dlv.apt.floor).trim());
  const apt = String(dlv.apt.apt).trim();
  if (!d || !Number.isInteger(floor) || floor < d.floorMin || floor > d.floorMax) return null;
  if (!/^\d{1,2}$/.test(apt) || Number(apt) === 0) return null;
  return { floor, apt: apt.padStart(2, '0') };
}

/** Можно ли оформлять доставку: текст проблемы или null. */
function dlvProblem(subtotal) {
  const d = dlvConf();
  if (!d) return t('err_DELIVERY_OFF');
  const f = String(dlv.apt.floor).trim();
  if (f && (!/^\d+$/.test(f) || Number(f) < d.floorMin || Number(f) > d.floorMax)) return t('aptBadFloor', { a: d.floorMin, b: d.floorMax });
  if (!dlvApt()) return t('aptNeed');
  if (d.minOrder > 0 && subtotal < d.minOrder) return t('minOrderProblem', { x: fmt(d.minOrder), y: fmt(d.minOrder - subtotal) });
  return null;
}

/** Блок «Ваша квартира в «Наполеоне»» в корзине. */
function dlvHtml() {
  const d = dlvConf();
  return `
    <h3 style="font-size:16px">${esc(t('aptTitle'))}</h3>
    <div class="dlv-apt">
      <div class="field"><label for="d-floor">${esc(t('aptFloor'))}</label>
        <input id="d-floor" inputmode="numeric" pattern="[0-9]*" maxlength="2" placeholder="${d.floorMin}–${d.floorMax}" value="${esc(dlv.apt.floor)}"></div>
      <div class="field"><label for="d-apt">${esc(t('aptNumber'))}</label>
        <input id="d-apt" inputmode="numeric" pattern="[0-9]*" maxlength="2" autocomplete="off" placeholder="${esc(t('aptNumberPh'))}" value="${esc(dlv.apt.apt)}"></div>
    </div>
    <p class="dlv-terms">${esc(t(d.fee ? 'aptTermsPaid' : 'aptTermsFree', { fee: fmt(d.fee) }))}${d.minOrder > 0 ? ' ' + esc(t('aptTermsMin', { x: fmt(d.minOrder) })) : ''}</p>
    <p class="muted" style="margin:0;font-size:13px">${esc(t('aptOnly'))}</p>`;
}

/** Строки «Блюда / Доставка / Итого». */
function dlvTotalsHtml(subtotal) {
  const d = dlvConf();
  const fee = d ? d.fee : 0;
  return `<div class="line"><span>${esc(t('dishesSum'))}</span><span>${fmt(subtotal)}</span></div>
    <div class="line"><span>${esc(t('deliveryFee'))}</span><span>${esc(fee ? fmt(fee) : t('deliveryFree'))}</span></div>
    <div class="line tot"><span>${esc(t('total'))}</span><span>${fmt(subtotal + fee)}</span></div>`;
}

/** После перерисовки корзины: подключаем поля этажа и квартиры. Проблемы показываем, когда гость ушёл с поля. */
function dlvMount(rerender) {
  for (const [id, k] of [['d-floor', 'floor'], ['d-apt', 'apt']]) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.oninput = () => { dlv.apt[k] = el.value; dlvSave(); sessionStorage.removeItem('vibe_idem'); };
    el.onchange = () => rerender();
  }
}

/** Что отправить на сервер вместе с заказом. */
function dlvPayload() {
  return { floor: String(dlv.apt.floor).trim(), apt: String(dlv.apt.apt).trim() };
}
