-- Быстрые кнопки в чате бота (согласовано с владельцем 15.11.2026):
-- «Блюдо дня», «Быстрый заказ» (5–7 позиций) и «Повторить прошлый заказ».
-- Что показывать, выбирает сотрудник во вкладке «Бот» панели. Цены и наличие — из общего меню.

-- Выбор сотрудника. kind = 'day' — блюдо дня (одна строка), 'quick' — позиции быстрого заказа (до 7, по порядку sort).
CREATE TABLE bot_picks (
  location_id TEXT NOT NULL REFERENCES locations(id),
  kind TEXT NOT NULL,
  dish_id TEXT NOT NULL REFERENCES dishes(id),
  sort INTEGER NOT NULL DEFAULT 0,
  note TEXT,                      -- комментарий шефа к блюду дня: {"ru","vi","en"}
  updated_by TEXT,
  updated_at TEXT,
  PRIMARY KEY (location_id, kind, dish_id)
);

-- Журнал: кто и что поменял во вкладке «Бот».
CREATE TABLE bot_picks_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id TEXT NOT NULL,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  change TEXT NOT NULL
);

-- Корзина гостя в чате бота (одна на гостя). Заказ из неё оформляется через общую логику заказа.
CREATE TABLE bot_carts (
  user_id INTEGER PRIMARY KEY,
  items TEXT NOT NULL DEFAULT '[]',  -- [{"dishId","qty","optionIds"}]
  pending TEXT,                      -- блюдо, для которого гость выбирает обязательную опцию
  type TEXT,                         -- pickup | visit
  day TEXT,                          -- YYYY-MM-DD
  slot TEXT,                         -- 'YYYY-MM-DD HH:MM'
  phone TEXT,                        -- номер гостя (из прошлого заказа или кнопки «Отправить номер»)
  source TEXT,                       -- quick | repeat
  last_order INTEGER,                -- последний заказ из этой корзины (ответ на повторное «Подтвердить»)
  idem TEXT NOT NULL,                -- ключ заказа: повторное «Подтвердить» не создаёт второй заказ
  updated_at TEXT NOT NULL
);

-- Откуда пришёл заказ из Telegram: NULL — окно меню, 'chat' — быстрые кнопки в чате бота.
ALTER TABLE orders ADD COLUMN source TEXT;
