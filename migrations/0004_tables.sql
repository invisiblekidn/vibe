-- Этап 4: заказ со стола по QR, вызов официанта, счета.

-- Столы. code — часть ссылки в QR (/t/<code>): по номеру стола угадать ссылку нельзя.
CREATE TABLE dining_tables (
  id TEXT PRIMARY KEY,                              -- '1'..'5' в зале, 'У1'..'У4' на улице
  location_id TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  zone TEXT NOT NULL,                               -- hall | outdoor
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

INSERT OR IGNORE INTO dining_tables (id, location_id, code, zone, sort) VALUES
 ('1', 'nt1', 'kwn763', 'hall', 1),
 ('2', 'nt1', 'b9sskx', 'hall', 2),
 ('3', 'nt1', 'swpe6x', 'hall', 3),
 ('4', 'nt1', '6g372e', 'hall', 4),
 ('5', 'nt1', 'b6ymxx', 'hall', 5),
 ('У1', 'nt1', 'mx67rw', 'outdoor', 6),
 ('У2', 'nt1', '5ka88y', 'outdoor', 7),
 ('У3', 'nt1', 'enhdns', 'outdoor', 8),
 ('У4', 'nt1', 'hrj7fk', 'outdoor', 9);

-- Счёт: у каждого телефона за столом свой (device_key хранится в телефоне гостя).
-- «Весь стол»: остальные открытые счета стола переходят в один (status = merged, merged_into).
CREATE TABLE bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id TEXT NOT NULL,
  table_id TEXT NOT NULL,
  device_key TEXT NOT NULL,
  status TEXT NOT NULL,                             -- open | merged | paid | closed
  merged_into INTEGER,
  requested_at TEXT,                                -- гость попросил счёт
  payment_status TEXT NOT NULL DEFAULT 'unpaid',    -- unpaid | reported | confirmed
  payment_method TEXT,                              -- qr | cash (как оплатили)
  payment_reported_at TEXT,
  paid_total INTEGER,
  staff_msg_id INTEGER,                             -- сообщение «просит счёт» в группе сотрудников
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  closed_at TEXT
);
-- Один открытый счёт на телефон за столом: два одновременных заказа не создадут два счёта.
CREATE UNIQUE INDEX bills_open_device ON bills(table_id, device_key) WHERE status = 'open';
CREATE INDEX bills_table ON bills(table_id, status);

CREATE TABLE bill_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id INTEGER NOT NULL,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  kind TEXT NOT NULL,
  data TEXT
);

ALTER TABLE orders ADD COLUMN table_id TEXT;
ALTER TABLE orders ADD COLUMN bill_id INTEGER;
CREATE INDEX orders_bill ON orders(bill_id);

-- Вызовы со стола: «Позвать официанта» и «Попросить счёт».
-- Повторное нажатие, пока вызов не закрыт, второй вызов не создаёт (dedup: 'waiter' или 'bill:<id>').
CREATE TABLE table_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_id TEXT NOT NULL,
  bill_id INTEGER,
  kind TEXT NOT NULL,                               -- waiter | bill
  dedup TEXT NOT NULL,
  created_at TEXT NOT NULL,
  done_at TEXT,
  done_by TEXT,
  staff_msg_id INTEGER
);
CREATE UNIQUE INDEX table_calls_open ON table_calls(table_id, dedup) WHERE done_at IS NULL;
