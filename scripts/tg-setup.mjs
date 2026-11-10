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
await call('setWebhook', { url: `${url}/tg/webhook`, secret_token: secret, allowed_updates: ['message', 'callback_query'] });
await call('setMyCommands', { commands: [{ command: 'start', description: 'Меню и заказ' }, { command: 'orders', description: 'Мои заказы' }] });
await call('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Меню', web_app: { url: `${url}/?tg=1` } } });
await call('setMyDescription', { description: 'Семейный ресторан VIBE в Нячанге. Закажите заранее: самовывоз или к вашему приходу.' });
