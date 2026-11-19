// Панель сотрудника, вкладка «Бот»: хит продаж и 5–7 позиций быстрого заказа для чата бота.
// Блюда выбираются из общего меню. Цена всегда из меню; блюдо из стоп-листа гость в боте не увидит.
// Изменения сохраняются кнопкой «Сохранить»; кто и что поменял — в журнале и в группе сотрудников.

const bot = { data: null, draft: null, saved: '', search: { day: '', quick: '' }, picking: false, msg: '' };

const botDirty = () => !!bot.draft && JSON.stringify(bot.draft) !== bot.saved;

async function botLoad(msg = '') {
  try {
    bot.data = await api('/api/staff/bot');
  } catch (err) {
    if (err.status === 401) return renderLogin('Смена закончилась, войдите снова.');
    root.querySelector('#bot').innerHTML = '<p class="alert">Не удалось загрузить. Обновите страницу.</p>';
    return;
  }
  const d = bot.data.day;
  bot.draft = { day: d ? { dishId: d.dishId, note: { ru: d.note.ru || '', vi: d.note.vi || '', en: d.note.en || '' } } : null, quick: [...bot.data.quick] };
  bot.saved = JSON.stringify(bot.draft);
  bot.picking = !d;
  bot.msg = msg;
  botRender();
}

const dishById = (id) => bot.data.dishes.find((d) => d.id === id);

function dishChips(d, inQuick) {
  const c = [];
  if (inQuick && bot.draft.day && bot.draft.day.dishId === d.id) c.push('<span class="pill ok">хит продаж</span>');
  if (d.soldOut) c.push('<span class="pill bad">в стоп-листе, гость не видит</span>');
  if (d.choice) c.push('<span class="pill mute">выбор начинки/соуса в чате</span>');
  if (d.alcohol) c.push('<span class="pill warn">только к визиту</span>');
  return c.join(' ');
}

function searchResults(kind) {
  const q = bot.search[kind].trim().toLowerCase();
  if (!q) return '';
  const taken = kind === 'quick' ? new Set(bot.draft.quick) : new Set();
  const found = bot.data.dishes.filter((d) => !taken.has(d.id) && (d.name.toLowerCase().includes(q) || d.category.toLowerCase().includes(q))).slice(0, 8);
  if (!found.length) return '<p class="muted" style="margin:0">Ничего не нашлось.</p>';
  return found
    .map((d) => `<button class="bot-res" type="button" data-pick="${kind}" data-dish="${esc(d.id)}"><span><b>${esc(d.name)}</b> <span class="muted">· ${esc(d.category)}</span>${d.soldOut ? ' <span class="pill bad">стоп-лист</span>' : ''}</span><span class="price">${fmt(d.price)}</span></button>`)
    .join('');
}

function botRender() {
  const box = root.querySelector('#bot');
  if (!box || !bot.data) return;
  const dr = bot.draft;
  const day = dr.day && dishById(dr.day.dishId);
  const n = dr.quick.length;
  const quickRows = dr.quick
    .map((id, i) => {
      const d = dishById(id);
      if (!d) return '';
      return `<li><span class="n">${i + 1}</span><span class="nm">${esc(d.name)} ${dishChips(d, true)}</span><span class="price">${fmt(d.price)}</span>
        <span class="ctl"><button type="button" class="btn small ghost" data-mv="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Выше">↑</button><button type="button" class="btn small ghost" data-mv="${i}" data-dir="1" ${i === n - 1 ? 'disabled' : ''} aria-label="Ниже">↓</button><button type="button" class="btn small ghost" data-rm="${i}" aria-label="Убрать">✕</button></span></li>`;
    })
    .join('');
  const visible = dr.quick.map(dishById).filter((d) => d && !d.soldOut);
  box.innerHTML = `
    ${bot.msg ? `<p class="alert ok" style="margin:0">${esc(bot.msg)}</p>` : ''}
    <div class="bot-grid">
      <div class="bot-col">
        <section class="card bot-sec">
          <h3>Главный хит</h3>
          <p class="muted" style="margin:0;font-size:13.5px">Гость видит его по кнопке «⭐ Хит продаж» в боте и карточкой вверху окна меню.</p>
          ${day ? `<div class="bot-day">
              ${day.photo ? `<img src="${esc(day.photo)}" alt="" width="64" height="64">` : '<span class="ph"></span>'}
              <div class="t"><b>${esc(day.name)}</b><div><span class="price">${fmt(day.price)}</span> <span class="muted">${esc(day.category)} · ${day.soldOut ? 'в стоп-листе сегодня' : 'в наличии'}</span></div></div>
              <div class="acts"><button type="button" class="btn small ghost" data-day="replace">Заменить</button><button type="button" class="btn small ghost" data-day="clear">Снять</button></div>
            </div>
            ${day.soldOut ? '<p class="hint" style="margin:0">Блюдо сегодня в стоп-листе. Гость увидит «Хит продаж сегодня закончился» и кнопку быстрого заказа.</p>' : ''}`
          : '<p class="muted" style="margin:0">Главный хит не выбран. Гость увидит «Хит продаж пока не выбран» и кнопку быстрого заказа.</p>'}
          ${bot.picking || !day ? `<div class="field"><label for="bot-s-day">Выбрать главный хит</label><input id="bot-s-day" placeholder="Начните вводить название…" value="${esc(bot.search.day)}" autocomplete="off"></div><div class="bot-results" id="bot-r-day">${searchResults('day')}</div>` : ''}
          ${day ? `<div class="field"><label for="bot-n-ru">Комментарий шефа (RU)</label><textarea id="bot-n-ru" data-note="ru" maxlength="300" placeholder="Например: варим с утра, подаём со сметаной">${esc(dr.day.note.ru)}</textarea></div>
            <details><summary class="muted">Комментарий на вьетнамском и английском (можно оставить пустым)</summary>
              <div class="field"><label for="bot-n-vi">VI</label><textarea id="bot-n-vi" data-note="vi" maxlength="300">${esc(dr.day.note.vi)}</textarea></div>
              <div class="field"><label for="bot-n-en">EN</label><textarea id="bot-n-en" data-note="en" maxlength="300">${esc(dr.day.note.en)}</textarea></div>
              <p class="muted" style="margin:0;font-size:13.5px">Если пусто, гость на этом языке увидит описание блюда из меню.</p>
            </details>` : ''}
        </section>
        <section class="card bot-sec">
          <h3>Быстрый заказ — хиты <small class="muted">${n} из ${bot.data.max}</small></h3>
          <p class="muted" style="margin:0;font-size:13.5px">Эти блюда — хиты: на сайте, в окне меню и в боте у них значок «⭐ Хит».</p>
          ${n ? `<ol class="bot-list">${quickRows}</ol>` : '<p class="muted" style="margin:0">Список пуст. Гость увидит «Быстрый заказ пока не настроен» и кнопку меню.</p>'}
          ${n && n < bot.data.recommended ? `<p class="hint" style="margin:0">Сейчас ${n} поз. Лучше ${bot.data.recommended}–${bot.data.max}, но можно и меньше.</p>` : ''}
          ${n < bot.data.max ? `<div class="field"><label for="bot-s-quick">Добавить блюдо</label><input id="bot-s-quick" placeholder="Начните вводить название…" value="${esc(bot.search.quick)}" autocomplete="off"></div><div class="bot-results" id="bot-r-quick">${searchResults('quick')}</div>` : '<p class="muted" style="margin:0">Это максимум. Чтобы добавить другое блюдо, сначала уберите одно.</p>'}
        </section>
        <div class="acts" style="display:flex;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn" id="bot-save" ${botDirty() ? '' : 'disabled'}>Сохранить</button>
          <button type="button" class="btn ghost" id="bot-undo" ${botDirty() ? '' : 'disabled'}>Отменить изменения</button>
        </div>
        <p class="muted" style="margin:0;font-size:13.5px">Цена в боте всегда из меню: поменяли цену в меню — она поменяется и здесь. Гости видят изменения сразу после сохранения.</p>
      </div>
      <div class="bot-col">
        <section class="card bot-sec bot-prev">
          <h3>Так увидит гость</h3>
          <div class="tg-msg"><b>Быстрый заказ</b><br>Нажмите на блюдо, чтобы добавить.</div>
          ${visible.length ? visible.map((d) => `<div class="tg-btn">⭐ ${esc(d.name)} · ${fmt(d.price).replace(/\s?₫$/, '')}</div>`).join('') : '<div class="tg-msg">Быстрый заказ пока не настроен.</div>'}
          <div class="tg-btn">🍽 Открыть меню</div>
        </section>
        <section class="card bot-sec">
          <h3>Журнал</h3>
          ${bot.data.log.length ? `<ul class="bot-log">${bot.data.log.map((l) => `<li>${esc(new Date(l.at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))} · <b>${esc(l.actor)}</b> · ${esc(l.change)}</li>`).join('')}</ul>` : '<p class="muted" style="margin:0">Изменений пока не было.</p>'}
        </section>
        <p class="muted" style="margin:0;font-size:13.5px">Заказ из быстрых кнопок приходит в «Заказы» и в группу сотрудников как обычный предзаказ, с пометкой «⚡ из чата бота». Кухня начинает после подтверждения оплаты.</p>
      </div>
    </div>`;
}

function botTab() {
  return '<div id="bot"><p class="muted">Загружаем…</p></div>';
}

root.addEventListener('input', (e) => {
  if (!bot.draft) return;
  const s = e.target.closest('#bot-s-day, #bot-s-quick');
  if (s) {
    const kind = s.id === 'bot-s-day' ? 'day' : 'quick';
    bot.search[kind] = s.value;
    root.querySelector(`#bot-r-${kind}`).innerHTML = searchResults(kind);
    return;
  }
  const note = e.target.closest('[data-note]');
  if (note && bot.draft.day) {
    bot.draft.day.note[note.dataset.note] = note.value;
    root.querySelector('#bot-save').disabled = !botDirty();
    root.querySelector('#bot-undo').disabled = !botDirty();
  }
});

root.addEventListener('click', async (e) => {
  if (!bot.draft || !e.target.closest('#bot')) return;
  bot.msg = '';
  const pick = e.target.closest('[data-pick]');
  if (pick) {
    const id = pick.dataset.dish;
    if (pick.dataset.pick === 'day') {
      bot.draft.day = { dishId: id, note: bot.draft.day && bot.draft.day.dishId === id ? bot.draft.day.note : { ru: '', vi: '', en: '' } };
      bot.picking = false;
      bot.search.day = '';
    } else if (!bot.draft.quick.includes(id) && bot.draft.quick.length < bot.data.max) {
      bot.draft.quick.push(id);
      bot.search.quick = '';
    }
    botRender();
    const next = root.querySelector(pick.dataset.pick === 'quick' ? '#bot-s-quick' : '#bot-n-ru');
    if (next) next.focus();
    return;
  }
  const dayBtn = e.target.closest('[data-day]');
  if (dayBtn) {
    if (dayBtn.dataset.day === 'clear') { bot.draft.day = null; bot.picking = true; }
    else bot.picking = true;
    botRender();
    const s = root.querySelector('#bot-s-day');
    if (s) s.focus();
    return;
  }
  const mv = e.target.closest('[data-mv]');
  if (mv) {
    const i = Number(mv.dataset.mv);
    const j = i + Number(mv.dataset.dir);
    const q = bot.draft.quick;
    if (j >= 0 && j < q.length) [q[i], q[j]] = [q[j], q[i]];
    return botRender();
  }
  const rm = e.target.closest('[data-rm]');
  if (rm) {
    bot.draft.quick.splice(Number(rm.dataset.rm), 1);
    return botRender();
  }
  if (e.target.closest('#bot-undo')) return botLoad();
  if (e.target.closest('#bot-save')) {
    const b = root.querySelector('#bot-save');
    b.disabled = true;
    b.textContent = 'Сохраняем…';
    try {
      const r = await api('/api/staff/bot', { method: 'PUT', body: bot.draft });
      await botLoad(r.changes.length ? 'Сохранено. Гости в боте уже видят новый выбор.' : 'Изменений не было.');
    } catch (err) {
      if (err.status === 401) return renderLogin('Смена закончилась, войдите снова.');
      bot.msg = '';
      botRender();
      const t = { DISH_UNAVAILABLE: 'Одного из блюд больше нет в меню. Обновите страницу.', TOO_MANY: `Не больше ${bot.data.max} позиций.` }[err.code] || 'Не получилось сохранить. Попробуйте ещё раз.';
      root.querySelector('#bot').insertAdjacentHTML('afterbegin', `<p class="alert" style="margin:0">${esc(t)}</p>`);
    }
  }
});
