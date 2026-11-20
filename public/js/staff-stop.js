// Панель сотрудника, вкладка «Стоп-лист»: всё меню по разделам, у каждого блюда переключатель «на стопе».
// Блюдо на стопе не удаляется из меню: гость видит его с пометкой «на стопе», но заказать не может.
// Стоп держится, пока сотрудник сам его не снимет. Каждое изменение сохраняется сразу и уходит в группу сотрудников.

const stop = { data: null, q: '', busy: new Set(), msg: '' };

async function stopLoad() {
  try {
    stop.data = await api('/api/staff/stop');
  } catch (err) {
    if (err.status === 401) return renderLogin('Смена закончилась, войдите снова.');
    const box = root.querySelector('#stop');
    if (box) box.innerHTML = '<p class="alert">Не удалось загрузить меню. Обновите страницу.</p>';
    return;
  }
  stopRender();
}

function stopTab() {
  return '<div id="stop"><p class="muted">Загружаем меню…</p></div>';
}

const stopTime = (iso) => (iso ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

function stopRow(d) {
  const busy = stop.busy.has(d.id);
  const who = d.stopped && (d.by || d.at) ? `<small class="stop-who">на стопе${d.by ? ` · ${esc(d.by)}` : ''}${d.at ? `, ${esc(stopTime(d.at))}` : ''}</small>` : '';
  return `<label class="stop-row${d.stopped ? ' on' : ''}" data-row="${esc(d.id)}">
    <span class="stop-ph">${d.photo ? `<img src="${esc(d.photo)}" alt="" loading="lazy" width="44" height="44">` : ''}</span>
    <span class="stop-t"><b>${esc(d.name)}</b><small class="muted">${fmt(d.price)}</small>${who}</span>
    <span class="stop-sw"><input type="checkbox" role="switch" data-stop="${esc(d.id)}" ${d.stopped ? 'checked' : ''} ${busy ? 'disabled' : ''} aria-label="${esc(d.name)} на стопе"><i aria-hidden="true"></i></span>
  </label>`;
}

function stopRender() {
  const box = root.querySelector('#stop');
  if (!box || !stop.data) return;
  const { categories, sections, dishes } = stop.data;
  const q = stop.q.trim().toLowerCase();
  const match = (d) => !q || d.name.toLowerCase().includes(q);
  const stopped = dishes.filter((d) => d.stopped);
  const cats = categories
    .map((c) => {
      const items = dishes.filter((d) => d.category_id === c.id && match(d));
      if (!items.length) return '';
      const secs = sections.filter((x) => x.category_id === c.id);
      const n = items.filter((d) => d.stopped).length;
      let body;
      if (secs.length) {
        const parts = secs
          .map((x) => {
            const its = items.filter((d) => d.section_id === x.id);
            return its.length ? `<h4 class="stop-sub">${esc(x.name)}</h4>${its.map(stopRow).join('')}` : '';
          })
          .join('');
        const loose = items.filter((d) => !secs.some((x) => x.id === d.section_id));
        body = parts + loose.map(stopRow).join('');
      } else body = items.map(stopRow).join('');
      return `<section class="card stop-cat" id="stop-cat-${esc(c.id)}">
        <h3>${esc(c.name)} <small class="muted">${items.length}${n ? ` · <span class="stop-n">на стопе ${n}</span>` : ''}</small></h3>
        ${body}
      </section>`;
    })
    .join('');
  box.innerHTML = `
    <div class="stop-head card">
      <div class="stop-top">
        <h3>Стоп-лист</h3>
        <span class="pill ${stopped.length ? 'bad' : 'ok'}">${stopped.length ? `на стопе: ${stopped.length}` : 'всё в наличии'}</span>
      </div>
      <input id="stop-q" type="search" placeholder="Найти блюдо…" value="${esc(stop.q)}" autocomplete="off" enterkeyhint="search">
      <nav class="stop-jump">${categories
        .filter((c) => dishes.some((d) => d.category_id === c.id && match(d)))
        .map((c) => `<a class="chip" href="#stop-cat-${esc(c.id)}">${esc(c.name)}</a>`)
        .join('')}</nav>
    </div>
    ${stop.msg ? `<p class="alert" style="margin:0">${esc(stop.msg)}</p>` : ''}
    <p class="muted stop-help">Включите переключатель, и блюдо встанет на стоп. Оно останется в меню, гость увидит пометку «на стопе», но заказать его не сможет: ни на сайте, ни в боте, ни со стола. Стоп держится, пока его не снимут здесь.</p>
    ${!q && stopped.length ? `<section class="card stop-cat stop-now"><h3>Сейчас на стопе <small class="muted">${stopped.length}</small></h3>${stopped.map(stopRow).join('')}</section>` : ''}
    ${cats || '<p class="muted">Ничего не нашлось.</p>'}`;
}

root.addEventListener('input', (e) => {
  if (e.target.id !== 'stop-q') return;
  stop.q = e.target.value;
  const pos = e.target.selectionStart;
  stopRender();
  const s = root.querySelector('#stop-q');
  s.focus();
  try { s.setSelectionRange(pos, pos); } catch { /* type=search в некоторых браузерах */ }
});

root.addEventListener('change', async (e) => {
  const sw = e.target.closest('[data-stop]');
  if (!sw || !stop.data) return;
  const id = sw.dataset.stop;
  const d = stop.data.dishes.find((x) => x.id === id);
  if (!d) return;
  const want = sw.checked;
  stop.msg = '';
  stop.busy.add(id);
  // Сразу показываем новое состояние; если сервер не принял — возвращаем как было.
  Object.assign(d, { stopped: want, by: want ? me : null, at: want ? new Date().toISOString() : null });
  stopRender();
  try {
    await api('/api/staff/stop', { method: 'POST', body: { dishId: id, stopped: want } });
    stop.busy.delete(id);
    await stopLoad();
  } catch (err) {
    stop.busy.delete(id);
    if (err.status === 401) return renderLogin('Смена закончилась, войдите снова.');
    d.stopped = !want;
    stop.msg = `Не получилось сохранить «${d.name}». Проверьте связь и попробуйте ещё раз.`;
    stopRender();
  }
});
