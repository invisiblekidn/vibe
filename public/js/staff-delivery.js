// Панель сотрудника, вкладка «Доставка»: заказы на доставку для курьера и настройки доставки.
// Включить/выключить доставку — сразу (например, кухня перегружена или курьера нет).
// Цена по зданию «Наполеон» и минимальная сумма — по кнопке «Сохранить». Изменения уходят в группу сотрудников.

const dset = { data: null, dirty: false, busy: false, msg: '' };

function deliveryTab(list) {
  return `<div id="dset" class="card dset"><p class="muted" style="margin:0">Загружаем настройки доставки…</p></div>
    <h3 style="margin:4px 2px 0;font-size:17px">Заказы на доставку${list.length ? ` · ${list.length}` : ''}</h3>
    ${list.length ? list.map((o) => orderCard(o)).join('') : '<p class="muted" style="margin:0">Активных заказов на доставку нет.</p>'}`;
}

async function deliveryMount() {
  if (dset.data) dsetRender();
  if (dset.dirty) return;
  try {
    dset.data = await api('/api/staff/delivery');
  } catch (err) {
    if (err.status === 401) return renderLogin('Смена закончилась, войдите снова.');
    const box = root.querySelector('#dset');
    if (box) box.innerHTML = '<p class="alert" style="margin:0">Не удалось загрузить настройки. Обновите страницу.</p>';
    return;
  }
  dsetRender();
}

const dTime = (iso) => (iso ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

function dField(id, label, value, unit, hint = '') {
  return `<div class="field dset-f"><label for="ds-${id}">${label}</label>
    <div class="dset-in"><input id="ds-${id}" data-k="${id}" inputmode="decimal" value="${esc(value)}"><span>${unit}</span></div>
    ${hint ? `<small class="muted">${hint}</small>` : ''}</div>`;
}

function dsetRender() {
  const box = root.querySelector('#dset');
  const d = dset.data;
  if (!box || !d) return;
  box.innerHTML = `
    <label class="dset-top">
      <span><b style="font-size:18px">Доставка ${d.enabled ? 'включена' : 'выключена'}</b><br>
        <small class="muted">${d.enabled ? 'Гости видят «Доставка» на сайте, в окне меню и в боте.' : 'Гости видят только «С собой» и «К визиту».'}</small></span>
      <span class="stop-sw dset-sw"><input type="checkbox" role="switch" id="ds-on" ${d.enabled ? 'checked' : ''} ${dset.busy ? 'disabled' : ''} aria-label="Доставка включена"><i aria-hidden="true"></i></span>
    </label>
    ${d.changedBy ? `<small class="muted">Последнее изменение: ${esc(String(d.changedBy))}, ${esc(dTime(d.changedAt))}</small>` : ''}
    <details ${dset.dirty ? 'open' : ''}><summary><b>Условия</b> <span class="muted">· по зданию «Наполеон», ${d.fee ? fmt(d.fee) : 'бесплатно'}, ${d.min_order ? `от ${fmt(d.min_order)}` : 'без минимума'}</span></summary>
      <div class="dset-grid">
        ${dField('fee', 'Цена доставки по зданию', d.fee, '₫', '0 — бесплатно.')}
        ${dField('min_order', 'Минимальная сумма блюд', d.min_order, '₫', '0 — без минимума.')}
      </div>
      <p class="muted" style="margin:8px 0 0;font-size:13.5px">Доставляем только жителям «Наполеона»: гость указывает этаж и квартиру. Привезти можно не раньше чем через ${d.lead_min} минут.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
        <button class="btn small" type="button" id="ds-save" ${dset.busy ? 'disabled' : ''}>Сохранить</button>
        ${dset.dirty ? '<button class="btn small ghost" type="button" id="ds-reset">Отменить изменения</button>' : ''}
      </div>
    </details>
    ${dset.msg ? `<p class="alert${dset.msg.startsWith('✓') ? ' ok' : ''}" style="margin:0">${esc(dset.msg)}</p>` : ''}`;
  box.oninput = (e) => { if (e.target.dataset.k) dset.dirty = true; };
  box.querySelector('#ds-on').onchange = (e) => dsetSave({ ...d, enabled: e.target.checked });
  box.querySelector('#ds-save').onclick = () => {
    const v = { ...d };
    for (const el of box.querySelectorAll('[data-k]')) {
      const n = Number(String(el.value).replace(/\s/g, '').replace(',', '.'));
      if (!Number.isFinite(n) || n < 0) { dset.msg = 'Проверьте поля: только числа.'; return dsetRender(); }
      v[el.dataset.k] = Math.round(n);
    }
    dsetSave(v);
  };
  const reset = box.querySelector('#ds-reset');
  if (reset) reset.onclick = () => { dset.dirty = false; dset.msg = ''; dsetRender(); };
}

async function dsetSave(v) {
  dset.busy = true;
  dset.msg = '';
  dsetRender();
  try {
    dset.data = await api('/api/staff/delivery', {
      method: 'PUT',
      body: { enabled: v.enabled, fee: v.fee, min_order: v.min_order },
    });
    dset.dirty = false;
    dset.msg = '✓ Сохранено. Гости уже видят новые условия.';
  } catch (err) {
    if (err.status === 401) return renderLogin('Смена закончилась, войдите снова.');
    dset.msg = err.code === 'BAD_INPUT' ? 'Проверьте поля: целые суммы от 0.' : 'Не получилось сохранить. Попробуйте ещё раз.';
  } finally {
    dset.busy = false;
    dsetRender();
  }
}
