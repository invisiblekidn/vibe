// Общие помощники для страниц гостя и сотрудника.
const LANG = 'ru';
const fmt = (v) => new Intl.NumberFormat('ru-RU').format(v).replace(/ /g, ' ') + ' ₫';
const tr = (n) => (n && (n[LANG] || n.ru || n.en)) || '';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const $ = (sel, root = document) => root.querySelector(sel);

async function api(path, opts = {}) {
  let res;
  try {
    res = await fetch(path, {
      ...opts,
      headers: { 'content-type': 'application/json', ...(opts.headers || {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    const err = new Error('NETWORK');
    err.code = 'NETWORK';
    err.data = {};
    throw err;
  }
  let data = null;
  try { data = await res.json(); } catch { /* пустой ответ */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || 'NETWORK');
    err.code = (data && data.error) || 'NETWORK';
    err.data = data || {};
    err.status = res.status;
    throw err;
  }
  return data;
}

const TYPE_LABEL = { pickup: 'Самовывоз', visit: 'К визиту', delivery: 'Доставка' };

function dayLabel(day, today) {
  const d = new Date(day + 'T00:00:00Z');
  const wd = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', timeZone: 'UTC' }).format(d);
  const dm = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d).replace('.', '');
  if (day === today) return { top: 'Сегодня', bottom: dm };
  const t = new Date(today + 'T00:00:00Z');
  if ((d - t) / 864e5 === 1) return { top: 'Завтра', bottom: dm };
  return { top: wd.charAt(0).toUpperCase() + wd.slice(1), bottom: dm };
}

function slotLabel(slot, today) {
  const [day, time] = slot.split(' ');
  const long = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(day + 'T00:00:00Z'));
  if (!today) return `${long} в ${time}`;
  const l = dayLabel(day, today);
  return `${l.top === 'Сегодня' || l.top === 'Завтра' ? l.top.toLowerCase() + ', ' + long : long} в ${time}`;
}
