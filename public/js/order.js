// Страница заказа гостя: номер, сумма, QR, «Я оплатил», статус.
const token = new URLSearchParams(location.search).get('t') || '';
const root = $('#order');
let order = null;
let timer = null;

const STEPS = [
  { id: 'awaiting_payment', title: 'Заказ принят', sub: 'Ждём оплату по QR' },
  { id: 'payment_checking', title: 'Проверяем оплату', sub: 'Сотрудник сверяет поступление, обычно до 10 минут' },
  { id: 'confirmed', title: 'Оплата подтверждена', sub: 'Скоро начнём готовить' },
  { id: 'cooking', title: 'Готовим', sub: '' },
  { id: 'ready', title: 'Готово', sub: '' },
  { id: 'completed', title: 'Выдано', sub: 'Приятного аппетита!' },
];

function render() {
  const o = order;
  const idx = STEPS.findIndex((s) => s.id === o.status);
  const unpaid = o.paymentStatus === 'unpaid' && o.status !== 'cancelled';
  const readyText = o.type === 'visit' ? 'Ждём вас, стол готов' : 'Можно забирать на кассе';
  root.innerHTML = `
    <div class="card" style="padding:16px;display:grid;gap:4px">
      <span class="muted">Заказ</span>
      <span class="ordno">№ ${o.number}</span>
      <span>${TYPE_LABEL[o.type]} · ${esc(slotLabel(o.slot))}</span>
    </div>

    ${o.status === 'cancelled' ? '<p class="alert" style="margin:0">Заказ отменён. Если это ошибка, напишите или позвоните нам.</p>' : ''}

    ${unpaid ? `<div class="card payblock">
      <span class="muted">Сумма к оплате</span>
      <span class="sum">${fmt(o.total)}</span>
      ${o.qrUrl ? `<img class="qr" src="${esc(o.qrUrl)}" alt="QR-код для оплаты" id="qr">` : '<p class="alert warn">QR-код временно недоступен. Покажите номер заказа сотруднику.</p>'}
      <p class="hint" style="margin:0">В комментарии к переводу укажите номер заказа <b>${o.number}</b>, так мы быстрее найдём ваш платёж.</p>
      <div class="btns2">
        <a class="btn ghost small" href="${esc(o.qrUrl || '#')}" download="vibe-qr.svg">Сохранить QR</a>
        <button class="btn ghost small" type="button" id="copy">Копировать №</button>
      </div>
      <button class="btn block" type="button" id="paid">Я оплатил</button>
      <p class="muted" style="margin:0;font-size:13px">Нажмите после перевода. Готовить начнём, когда сотрудник увидит деньги на счёте.</p>
    </div>` : ''}

    ${o.status === 'payment_checking' ? `<p class="alert warn" style="margin:0">Спасибо! Вы сообщили об оплате ${fmt(o.total)}. Сейчас сотрудник проверит поступление и подтвердит заказ.</p>` : ''}
    ${o.status === 'ready' ? `<p class="alert ok" style="margin:0">${readyText}. Назовите номер ${o.number}.</p>` : ''}

    ${o.status !== 'cancelled' ? `<div class="card steps">${STEPS.map((s, i) => {
      const cls = i < idx ? 'done' : i === idx ? 'now' : 'next';
      const sub = s.id === 'ready' ? readyText : s.sub;
      return `<div class="st ${o.status === 'completed' && i === idx ? 'done' : cls}"><i></i><div>${s.title}${i === idx && sub ? `<small>${esc(sub)}</small>` : ''}</div></div>`;
    }).join('')}</div>` : ''}

    <div class="card" style="padding:12px 14px">
      ${o.items.map((i) => `<div class="line"><span>${i.qty} × ${esc(i.name)}${i.options.length ? `<small class="muted" style="display:block">${esc(i.options.map((x) => x.name).join(', '))}</small>` : ''}</span><span>${fmt(i.lineTotal)}</span></div>`).join('')}
      <div class="line tot"><span>Итого</span><span>${fmt(o.total)}</span></div>
      ${o.comment ? `<p class="muted" style="margin:8px 0 0;font-size:14px">Комментарий: ${esc(o.comment)}</p>` : ''}
    </div>
    <p class="muted" style="text-align:center;font-size:13px;margin:0">Сохраните эту страницу: статус обновляется сам.</p>`;

  const paid = $('#paid');
  if (paid) paid.onclick = reportPaid;
  const copy = $('#copy');
  if (copy) copy.onclick = async () => {
    try { await navigator.clipboard.writeText(String(o.number)); copy.textContent = 'Скопировано'; } catch { copy.textContent = '№ ' + o.number; }
  };
}

async function reportPaid() {
  const b = $('#paid');
  b.disabled = true;
  b.textContent = 'Отправляем…';
  try {
    await api(`/api/orders/${encodeURIComponent(token)}/report-payment`, { method: 'POST' });
  } catch (e) {
    if (e.code === 'NETWORK') { b.disabled = false; b.textContent = 'Нет связи, нажмите ещё раз'; return; }
  }
  await refresh();
}

async function refresh() {
  try {
    const fresh = await api('/api/orders/' + encodeURIComponent(token));
    const changed = JSON.stringify(fresh) !== JSON.stringify(order);
    order = fresh;
    if (changed) render();
  } catch (e) {
    if (e.status === 404) root.innerHTML = '<p class="alert">Заказ не найден. Проверьте ссылку.</p>';
  }
  clearTimeout(timer);
  if (!order || !['completed', 'cancelled'].includes(order.status)) timer = setTimeout(refresh, 10000);
}

if (!token) root.innerHTML = '<p class="alert">Заказ не найден. Проверьте ссылку.</p>';
else refresh();
