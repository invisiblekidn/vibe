-- Порядок подачи при заказе со стола (просьба Aleks 12.11.2026).
-- Гость раскладывает блюда по подачам 1, 2, 3… и подтверждает порядок. Кухня ведёт статус каждой подачи.
-- Обычный заказ («всё сразу») остаётся как был: serve_mode = 'together', у всех строк подача 1, строк в order_courses нет.

ALTER TABLE orders ADD COLUMN serve_mode TEXT NOT NULL DEFAULT 'together';   -- together | courses
ALTER TABLE order_items ADD COLUMN course INTEGER NOT NULL DEFAULT 1;          -- номер подачи

CREATE TABLE order_courses (
  order_id INTEGER NOT NULL REFERENCES orders(id),
  course INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting',            -- waiting (ждёт команды шефа) | cooking | ready | served
  started_at TEXT,
  ready_at TEXT,
  served_at TEXT,
  PRIMARY KEY (order_id, course)
);
