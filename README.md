# VIBE — сайт и предзаказ

Семейный ресторан VIBE, Нячанг. План и договорённости: [docs/project-plan.md](docs/project-plan.md).

## Запуск на своём компьютере (тестовые данные)

```bash
npm install
cp .dev.vars.example .dev.vars   # PIN сотрудника и секрет сессии, в репозиторий не попадает
npm run db:migrate:local
npm run db:seed:local
npm run dev                      # http://localhost:8787
```

- Сайт гостя: http://localhost:8787/
- Панель сотрудника: http://localhost:8787/staff (имя любое, PIN из `.dev.vars`)

## Проверки

```bash
npm test               # правила цены, времени и статусов
npm run typecheck
node scripts/smoke.mjs # сквозная проверка API на запущенном сервере
node scripts/tg-smoke.mjs # бот, Mini App и группа сотрудников на имитации Telegram (нужны TG_* в .dev.vars)
```

## Telegram (этап 2)

- Бот: `/start` — приветствие и кнопка «Открыть меню» (Mini App = этот же сайт с `?tg=1`), `/orders` — мои заказы, любое другое сообщение уходит администратору в группу.
- Заказ из Mini App подписан Telegram (`initData`), сервер проверяет подпись; статусы приходят гостю в чат.
- Заказ с сайта можно привязать к Telegram кнопкой «Получать статус в Telegram» на странице заказа.
- Группа сотрудников: карточка каждого заказа с кнопками «Деньги пришли», «Готовить», «Готово», «Выдан», «Отменить» (в два нажатия). Кнопки работают только у людей из `TG_STAFF`. Ответ на сообщение гостя в группе бот пересылает гостю.
- Повторно доставленное событие Telegram (тот же `update_id`) не обрабатывается второй раз.
- Подключение тестового бота к опубликованному адресу: `node scripts/tg-setup.mjs` (токен берётся из окружения, в репозиторий не попадает).

## Тестовая публикация (Cloudflare)

- Адрес: https://vibe-restaurant.invisiblekidn.workers.dev, бот: @vibe_kid_bot.
- База: D1 `vibe-db`. Схема: `npx wrangler d1 migrations apply vibe-db --remote`. Тестовое меню (стирает заказы!): `npx wrangler d1 execute vibe-db --remote --file=seed/seed.sql`.
- Секреты задаются командой `npx wrangler secret put ИМЯ`: TG_BOT_TOKEN, TG_WEBHOOK_SECRET, SESSION_SECRET, STAFF_PIN, TG_STAFF_CHAT_ID, TG_STAFF.
- Публикация: `npx wrangler deploy`. После смены TG_WEBHOOK_SECRET заново выполнить `node scripts/tg-setup.mjs` с тем же секретом.
