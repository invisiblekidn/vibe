-- Этап 2: Telegram-бот, Mini App, группа сотрудников.

-- Каждое событие Telegram обрабатывается один раз: повторная доставка того же update_id пропускается.
CREATE TABLE tg_updates (
  update_id INTEGER PRIMARY KEY,
  received_at TEXT NOT NULL
);

-- Гость, который получает статусы заказа в Telegram (заказ из Mini App или привязанный по ссылке с сайта).
ALTER TABLE orders ADD COLUMN tg_user_id INTEGER;
-- Сообщение о заказе в группе сотрудников: его обновляем при смене статуса.
ALTER TABLE orders ADD COLUMN staff_msg_id INTEGER;
CREATE INDEX orders_tg_user ON orders(tg_user_id);

-- Переписка: сообщение гостя, пересланное в группу, и кому вернуть ответ сотрудника.
CREATE TABLE tg_relay (
  group_msg_id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  order_id INTEGER,
  created_at TEXT NOT NULL
);
