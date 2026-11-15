// Подключение тестового бота к опубликованному сайту: node scripts/tg-setup.mjs
// Берёт TG_BOT_TOKEN, TG_WEBHOOK_SECRET и PUBLIC_URL из окружения или .dev.vars. Токен никуда не записывает.
import { readFileSync, existsSync } from 'node:fs';

const vars = Object.fromEntries(
  (existsSync('.dev.vars') ? readFileSync('.dev.vars', 'utf8') : '')
    .split('\n')
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim()]),
);
const get = (k) => process.env[k] || vars[k];
const token = get('TG_BOT_TOKEN');
const secret = get('TG_WEBHOOK_SECRET');
const url = (get('PUBLIC_URL') || '').replace(/\/$/, '');
if (!token || !secret || !url.startsWith('https://')) {
  console.error('Нужны TG_BOT_TOKEN, TG_WEBHOOK_SECRET и PUBLIC_URL (https://…)');
  process.exit(1);
}
const call = async (method, body) => {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json();
  console.log(`${d.ok ? '✓' : '✗'} ${method}${d.ok ? '' : ': ' + d.description}`);
  return d;
};
await call('setWebhook', { url: `${url}/tg/webhook`, secret_token: secret, allowed_updates: ['message', 'callback_query', 'widget_query'] });
// Список команд у кнопки «/» в чате: те же быстрые действия, что и кнопки под приветствием. На языке Telegram гостя.
const CMDS = {
  ru: [['start', 'Меню и заказ'], ['day', 'Блюдо дня'], ['quick', 'Быстрый заказ'], ['repeat', 'Повторить прошлый заказ'], ['orders', 'Мои заказы']],
  vi: [['start', 'Thực đơn và đặt món'], ['day', 'Món của ngày'], ['quick', 'Đặt nhanh'], ['repeat', 'Đặt lại đơn trước'], ['orders', 'Đơn của tôi']],
  en: [['start', 'Menu and order'], ['day', 'Dish of the day'], ['quick', 'Quick order'], ['repeat', 'Repeat last order'], ['orders', 'My orders']],
};
const cmds = (l) => CMDS[l].map(([command, description]) => ({ command, description }));
await call('setMyCommands', { scope: { type: 'all_private_chats' }, commands: cmds('ru') });
await call('setMyCommands', { scope: { type: 'all_private_chats' }, language_code: 'vi', commands: cmds('vi') });
await call('setMyCommands', { scope: { type: 'all_private_chats' }, language_code: 'en', commands: cmds('en') });
const group = get('TG_STAFF_CHAT_ID');
if (group) await call('setMyCommands', { scope: { type: 'chat', chat_id: Number(group) }, commands: [{ command: 'guests', description: 'Выбрать гостя и написать ему' }, { command: 'id', description: 'Показать id группы и ваш' }] });
await call('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Меню', web_app: { url: `${url}/?tg=1` } } });
await call('setMyDescription', { description: 'Семейный ресторан VIBE в Нячанге. Закажите заранее: самовывоз или к вашему приходу.' });
