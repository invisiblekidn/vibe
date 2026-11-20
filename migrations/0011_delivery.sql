-- Доставка своими курьерами: точка ресторана, тариф и настройки, которые меняет сотрудник во вкладке «Доставка».
-- Тариф по договорённости: 30 000 ₫ до 3 км, дальше +5 000 ₫ за каждый начатый км, радиус 10 км,
-- бесплатно от 250 000 ₫ за блюда, минимальная сумма пока не задана (0).
ALTER TABLE locations ADD COLUMN lat REAL;
ALTER TABLE locations ADD COLUMN lng REAL;
ALTER TABLE locations ADD COLUMN delivery_radius_km REAL NOT NULL DEFAULT 10;
ALTER TABLE locations ADD COLUMN delivery_base_fee INTEGER NOT NULL DEFAULT 30000;
ALTER TABLE locations ADD COLUMN delivery_base_km REAL NOT NULL DEFAULT 3;
ALTER TABLE locations ADD COLUMN delivery_per_km INTEGER NOT NULL DEFAULT 5000;
ALTER TABLE locations ADD COLUMN delivery_free_from INTEGER NOT NULL DEFAULT 250000;
ALTER TABLE locations ADD COLUMN delivery_min_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE locations ADD COLUMN delivery_changed_by TEXT;
ALTER TABLE locations ADD COLUMN delivery_changed_at TEXT;

-- 25 Đ. Nguyễn Đình Chiểu (точка по Google Картам). Сотрудник может поправить во вкладке «Доставка».
UPDATE locations SET lat = 12.2697605, lng = 109.2015646 WHERE id = 'nt1';

-- Адрес доставки в заказе: текст гостя (может быть пустым, если гость поставил только точку) и точка на карте.
ALTER TABLE orders ADD COLUMN delivery_address TEXT;
ALTER TABLE orders ADD COLUMN delivery_lat REAL;
ALTER TABLE orders ADD COLUMN delivery_lng REAL;
ALTER TABLE orders ADD COLUMN delivery_km REAL;
