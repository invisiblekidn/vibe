-- Фото места доставки от гостя (по желанию): помогает курьеру найти вход, ворота, отель.
-- Одно фото на заказ, гость может заменить. Сжатое на телефоне JPEG, обычно 100–400 КБ.
CREATE TABLE IF NOT EXISTS order_photos (
  order_id INTEGER PRIMARY KEY REFERENCES orders(id),
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  created_at TEXT NOT NULL
);
ALTER TABLE orders ADD COLUMN delivery_photo_at TEXT;
