// Общие помощники для страниц гостя и сотрудника.
// LANG, t() и строка выбора языка — в i18n.js (подключается раньше этого файла).
const fmt = (v) => new Intl.NumberFormat(LOCALE[LANG]).format(v).replace(/[\u00a0\u202f ]/g, LANG === 'vi' ? '.' : '\u00a0') + ' ₫';
const tr = (n) => (n && (n[LANG] || n.ru || n.en)) || '';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const $ = (sel, root = document) => root.querySelector(sel);

/** Вес/порция из меню («250 г», «2 шт.», «2 шарика / 100 г») на языке гостя. */
function weightText(w) {
  if (!w || LANG === 'ru') return w || '';
  const map = LANG === 'vi' ? [[/шарика?|шариков/g, 'viên'], [/шт\.?/g, 'cái'], [/г\b|г$/g, 'g'], [/мл/g, 'ml'], [/л\b|л$/g, 'l']]
    : [[/шарика?|шариков/g, 'scoops'], [/шт\.?/g, 'pcs'], [/г\b|г$/g, 'g'], [/мл/g, 'ml'], [/л\b|л$/g, 'l']];
  return map.reduce((s, [re, to]) => s.replace(re, to), w);
}

/** Название стола на языке гостя: «В зале, стол 3» / «На улице, стол У2». */
function tableName(tb) {
  if (!tb) return t('table');
  return t(tb.zone === 'outdoor' ? 'tableOut' : 'tableHall', { n: tb.id });
}

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

const typeLabel = (type) => t('type_' + type);

function dayLabel(day, today) {
  const d = new Date(day + 'T00:00:00Z');
  const loc = LOCALE[LANG];
  const wd = new Intl.DateTimeFormat(loc, { weekday: 'short', timeZone: 'UTC' }).format(d);
  const dm = LANG === 'vi'
    ? `${d.getUTCDate()}/${d.getUTCMonth() + 1}`
    : new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d).replace('.', '');
  if (day === today) return { top: t('today'), bottom: dm, rel: true };
  const tt = new Date(today + 'T00:00:00Z');
  if ((d - tt) / 864e5 === 1) return { top: t('tomorrow'), bottom: dm, rel: true };
  return { top: wd.charAt(0).toUpperCase() + wd.slice(1), bottom: dm, rel: false };
}

function slotLabel(slot, today) {
  const [day, time] = slot.split(' ');
  const d = new Date(day + 'T00:00:00Z');
  const long = LANG === 'vi'
    ? `ngày ${d.getUTCDate()}/${d.getUTCMonth() + 1}`
    : new Intl.DateTimeFormat(LOCALE[LANG], { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(d);
  let dayText = long;
  if (today) {
    const l = dayLabel(day, today);
    if (l.rel) dayText = `${l.top.toLowerCase()}, ${long}`;
  }
  return t('slotAt', { day: dayText, time });
}

// Telegram Mini App: сайт открыт кнопкой из бота (?tg=1). Скрипт Telegram грузим только тогда.
const IN_TG = /[?&]tg=1\b/.test(location.search) || location.hash.includes('tgWebAppData');
let TGW = null;
function tgReady() {
  return new Promise((resolve) => {
    if (!IN_TG) return resolve(null);
    const s = document.createElement('script');
    s.src = 'https://telegram.org/js/telegram-web-app.js';
    s.onload = () => {
      const w = window.Telegram && window.Telegram.WebApp;
      try {
        w.ready();
        w.expand();
        w.setHeaderColor('#f7ecda');
        w.setBackgroundColor('#f7ecda');
      } catch { /* старая версия Telegram */ }
      TGW = w && w.initData ? w : null;
      resolve(TGW);
    };
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
}
