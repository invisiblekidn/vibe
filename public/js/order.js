// Страница заказа гостя: номер, сумма, QR, «Я оплатил», статус.
const token = new URLSearchParams(location.search).get('t') || '';
const root = $('#order');
let order = null;
let timer = null;

const STEPS = ['awaiting_payment', 'payment_checking', 'confirmed', 'cooking', 'ready', 'completed'].map((id) => ({
  id,
  title: t('step_' + id),
  sub: I18N['step_' + id + '_sub'] ? t('step_' + id + '_sub') : '',
}));

function render() {
  const o = order;
  const idx = STEPS.findIndex((s) => s.id === o.status);
  const unpaid = o.paymentStatus === 'unpaid' && o.status !== 'cancelled';
  const readyText = o.type === 'visit' ? t('readyVisit') : t('readyPickup');
  root.innerHTML = `
    <div class="card" style="padding:16px;display:grid;gap:4px">
      <span class="muted">${esc(t('order'))}</span>
      <span class="ordno">${LANG === 'ru' ? '№' : '#'} ${o.number}</span>
      <span>${esc(typeLabel(o.type))} · ${esc(slotLabel(o.slot))}</span>
    </div>

    ${o.status === 'cancelled' ? `<p class="alert" style="margin:0">${esc(t('cancelledOrder'))}</p>` : ''}

    ${unpaid ? `<div class="card payblock">
      <span class="muted">${esc(t('toPay'))}</span>
      <span class="sum">${fmt(o.total)}</span>
      ${o.qrUrl ? `<img class="qr" src="${esc(o.qrUrl)}" alt="${esc(t('qrAlt'))}" id="qr">` : `<p class="alert warn">${esc(t('qrMissing'))}</p>`}
      <p class="hint" style="margin:0">${t('transferNote', { n: o.number })}</p>
      <div class="btns2">
        <a class="btn ghost small" href="${esc(o.qrUrl || '#')}" download="vibe-qr.svg">${esc(t('saveQr'))}</a>
        <button class="btn ghost small" type="button" id="copy">${esc(t('copyNo'))}</button>
      </div>
      <button class="btn block" type="button" id="paid">${esc(t('iPaid'))}</button>
      <p class="muted" style="margin:0;font-size:13px">${esc(t('iPaidHint'))}</p>
    </div>` : ''}

    ${o.status === 'payment_checking' ? `<p class="alert warn" style="margin:0">${esc(t('reported', { sum: fmt(o.total) }))}</p>` : ''}
    ${o.status === 'ready' ? `<p class="alert ok" style="margin:0">${esc(t('sayNumber', { x: readyText, n: o.number }))}</p>` : ''}

    ${o.status !== 'cancelled' ? `<div class="card steps">${STEPS.map((s, i) => {
      const cls = i < idx ? 'done' : i === idx ? 'now' : 'next';
      const sub = s.id === 'ready' ? readyText : s.sub;
      return `<div class="st ${o.status === 'completed' && i === idx ? 'done' : cls}"><i></i><div>${s.title}${i === idx && sub ? `<small>${esc(sub)}</small>` : ''}</div></div>`;
    }).join('')}</div>` : ''}

    <div class="card" style="padding:12px 14px">
      ${o.items.map((i) => `<div class="line"><span>${i.qty} × ${esc(i.name)}${i.options.length ? `<small class="muted" style="display:block">${esc(i.options.map((x) => x.name).join(', '))}</small>` : ''}</span><span>${fmt(i.lineTotal)}</span></div>`).join('')}
      <div class="line tot"><span>${esc(t('total'))}</span><span>${fmt(o.total)}</span></div>
      ${o.comment ? `<p class="muted" style="margin:8px 0 0;font-size:14px">${esc(t('commentIs', { x: o.comment }))}</p>` : ''}
    </div>
    ${o.tgLink && !TGW && !['completed', 'cancelled'].includes(o.status) ? `<a class="btn ghost block" href="${esc(o.tgLink)}" target="_blank" rel="noopener">${esc(t('followTg'))}</a>` : ''}
    <p class="muted" style="text-align:center;font-size:13px;margin:0">${esc(o.inTelegram ? t('statusInTg') : t('statusHere'))}</p>`;

  const paid = $('#paid');
  if (paid) paid.onclick = reportPaid;
  const copy = $('#copy');
  if (copy) copy.onclick = async () => {
    try { await navigator.clipboard.writeText(String(o.number)); copy.textContent = t('copied'); } catch { copy.textContent = (LANG === 'ru' ? '№ ' : '#') + o.number; }
  };
}

async function reportPaid() {
  const b = $('#paid');
  b.disabled = true;
  b.textContent = t('sending');
  try {
    await api(`/api/orders/${encodeURIComponent(token)}/report-payment`, { method: 'POST' });
  } catch (e) {
    if (e.code === 'NETWORK') { b.disabled = false; b.textContent = t('noNetRetry'); return; }
  }
  await refresh();
}

async function refresh() {
  try {
    const fresh = await api('/api/orders/' + encodeURIComponent(token) + '?lang=' + LANG);
    const changed = JSON.stringify(fresh) !== JSON.stringify(order);
    order = fresh;
    if (changed) render();
  } catch (e) {
    if (e.status === 404) root.innerHTML = `<p class="alert">${esc(t('orderNotFound'))}</p>`;
  }
  clearTimeout(timer);
  if (!order || !['completed', 'cancelled'].includes(order.status)) timer = setTimeout(refresh, 10000);
}

if (!token) root.innerHTML = `<p class="alert">${esc(t('orderNotFound'))}</p>`;
else tgReady().then(refresh);
