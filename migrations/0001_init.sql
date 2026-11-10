-- Точки ресторана. Сейчас одна, но всё привязано к точке, чтобы добавить вторую без переделки.
CREATE TABLE locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  tz_offset_min INTEGER NOT NULL DEFAULT 420,      -- Вьетнам: UTC+7, без перехода на летнее время
  open_min INTEGER NOT NULL DEFAULT 540,           -- 9:00
  close_min INTEGER NOT NULL DEFAULT 1320,         -- 22:00
  slot_minutes INTEGER NOT NULL DEFAULT 30,
  slot_capacity INTEGER NOT NULL DEFAULT 5,
  max_days_ahead INTEGER NOT NULL DEFAULT 7,
  lead_pickup_min INTEGER NOT NULL DEFAULT 30,
  lead_visit_min INTEGER NOT NULL DEFAULT 30,
  lead_delivery_min INTEGER NOT NULL DEFAULT 40,
  accepting_orders INTEGER NOT NULL DEFAULT 1,
  delivery_enabled INTEGER NOT NULL DEFAULT 1,
  payment_qr_url TEXT                               -- картинка QR; на этапе 1 тестовая
);

-- Тексты на трёх языках храним как JSON: {"ru": "...", "vi": "...", "en": "..."}
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  sort INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL
);

CREATE TABLE dishes (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id),
  sort INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '{}',
  price INTEGER NOT NULL,                           -- в донгах
  photo TEXT,
  weight TEXT,
  is_kids INTEGER NOT NULL DEFAULT 0,
  is_alcohol INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1                 -- 0 = убрано из меню совсем
);

-- Стоп-лист по дням: блюдо закончилось на конкретную дату в конкретной точке.
CREATE TABLE stop_list (
  location_id TEXT NOT NULL REFERENCES locations(id),
  dish_id TEXT NOT NULL REFERENCES dishes(id),
  day TEXT NOT NULL,                                -- YYYY-MM-DD по местному времени
  PRIMARY KEY (location_id, dish_id, day)
);

CREATE TABLE option_groups (
  id TEXT PRIMARY KEY,
  dish_id TEXT NOT NULL REFERENCES dishes(id),
  sort INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  min_select INTEGER NOT NULL DEFAULT 0,
  max_select INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE options (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES option_groups(id),
  sort INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  price_delta INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

-- Номер заказа (id) показываем гостю. public_token — секретная ссылка на страницу заказа.
CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_token TEXT NOT NULL UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE,             -- защита от повторного нажатия «Оформить»
  location_id TEXT NOT NULL REFERENCES locations(id),
  channel TEXT NOT NULL,                            -- site | telegram | table
  type TEXT NOT NULL,                               -- pickup | visit | delivery | table
  slot TEXT,                                        -- 'YYYY-MM-DD HH:MM' местного времени
  status TEXT NOT NULL,                             -- new | cooking | ready | completed | cancelled
  payment_method TEXT NOT NULL,                     -- qr | cash | on_site
  payment_status TEXT NOT NULL,                     -- unpaid | reported | confirmed | refunded
  payment_reported_at TEXT,
  subtotal INTEGER NOT NULL,
  delivery_fee INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  guest_name TEXT NOT NULL,
  guest_phone TEXT NOT NULL,
  comment TEXT,
  lang TEXT NOT NULL DEFAULT 'ru',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX orders_slot ON orders(location_id, slot, status);

CREATE TABLE order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  dish_id TEXT NOT NULL,
  name TEXT NOT NULL,                               -- название на момент заказа
  qty INTEGER NOT NULL,
  unit_price INTEGER NOT NULL,                      -- цена блюда с опциями на момент заказа
  options TEXT NOT NULL DEFAULT '[]',               -- [{"id","name","price_delta"}]
  line_total INTEGER NOT NULL
);

-- Журнал: кто и что сделал с заказом.
CREATE TABLE order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  at TEXT NOT NULL,
  actor TEXT NOT NULL,                              -- guest | staff:<имя> | system
  kind TEXT NOT NULL,
  data TEXT
);
