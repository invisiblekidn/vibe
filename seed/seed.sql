-- ТЕСТОВЫЕ ДАННЫЕ для разработки. Часть настоящего меню (ноябрь 2026), фото временные.
-- Завтраки и круассаны — в seed/menu-breakfast.sql, детское меню — в seed/menu-kids.sql, супы — в seed/menu-soups.sql, горячее — в seed/menu-mains.sql, салаты — в seed/menu-salads.sql, бар — в seed/menu-bar.sql (выполнять после этого файла).
-- Вьетнамские названия пока совпадают с английскими: переведём на этапе 6.

DELETE FROM order_events; DELETE FROM order_items; DELETE FROM orders;
DELETE FROM bill_events; DELETE FROM table_calls; DELETE FROM bills;
DELETE FROM bot_picks; DELETE FROM bot_picks_log; DELETE FROM bot_carts;
DELETE FROM options; DELETE FROM option_groups; DELETE FROM stop_list; DELETE FROM dishes; DELETE FROM menu_sections; DELETE FROM categories; DELETE FROM locations;

INSERT INTO locations (id, name, address, payment_qr_url) VALUES
 ('nt1', 'VIBE Нячанг', '25 Đ. Nguyễn Đình Chiểu, Bắc Nha Trang, Khánh Hòa', '/img/vibe-pay-qr.png');

INSERT INTO categories (id, sort, name) VALUES
 ('breakfast', 1, '{"ru":"Завтраки","en":"Breakfasts","vi":"Breakfasts"}'),
 ('soups',     2, '{"ru":"Супы","en":"Soups","vi":"Soups"}'),
 ('salads',    3, '{"ru":"Салаты","en":"Salads","vi":"Salads"}'),
 ('mains',     4, '{"ru":"Горячее","en":"Main dishes","vi":"Main dishes"}'),
 ('kids',      5, '{"ru":"Детское меню","en":"Kids menu","vi":"Kids menu"}'),
 ('desserts',  6, '{"ru":"Десерты","en":"Desserts","vi":"Desserts"}'),
 ('bar',       7, '{"ru":"Бар","en":"Bar","vi":"Bar"}');

-- Блюда всех разделов — в файлах seed/menu-*.sql.
