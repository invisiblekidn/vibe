-- ТЕСТОВЫЕ ДАННЫЕ для разработки. Часть настоящего меню (ноябрь 2026), фото временные.
-- Завтраки и круассаны — в seed/menu-breakfast.sql, детское меню — в seed/menu-kids.sql, супы — в seed/menu-soups.sql, горячее — в seed/menu-mains.sql, бар — в seed/menu-bar.sql (выполнять после этого файла).
-- Вьетнамские названия пока совпадают с английскими: переведём на этапе 6.

DELETE FROM order_events; DELETE FROM order_items; DELETE FROM orders;
DELETE FROM bill_events; DELETE FROM table_calls; DELETE FROM bills;
DELETE FROM bot_picks; DELETE FROM bot_picks_log; DELETE FROM bot_carts;
DELETE FROM options; DELETE FROM option_groups; DELETE FROM stop_list; DELETE FROM dishes; DELETE FROM menu_sections; DELETE FROM categories; DELETE FROM locations;

INSERT INTO locations (id, name, address, payment_qr_url) VALUES
 ('nt1', 'VIBE Нячанг', '25 Đ. Nguyễn Đình Chiểu, Bắc Nha Trang, Khánh Hòa', '/img/test-qr.svg');

INSERT INTO categories (id, sort, name) VALUES
 ('breakfast', 1, '{"ru":"Завтраки","en":"Breakfasts","vi":"Breakfasts"}'),
 ('soups',     2, '{"ru":"Супы","en":"Soups","vi":"Soups"}'),
 ('salads',    3, '{"ru":"Салаты","en":"Salads","vi":"Salads"}'),
 ('mains',     4, '{"ru":"Горячее","en":"Main dishes","vi":"Main dishes"}'),
 ('kids',      5, '{"ru":"Детское меню","en":"Kids menu","vi":"Kids menu"}'),
 ('desserts',  6, '{"ru":"Десерты","en":"Desserts","vi":"Desserts"}'),
 ('bar',       7, '{"ru":"Бар","en":"Bar","vi":"Bar"}');

INSERT INTO dishes (id, category_id, sort, name, description, price, photo, weight, is_kids, is_alcohol) VALUES
 ('caesar-chicken', 'salads', 1, '{"ru":"Цезарь с курицей","en":"Caesar with chicken","vi":"Caesar with chicken"}',
   '{"ru":"Куриное филе на гриле, романо, соус Цезарь, пармезан, гренки.","en":"Grilled chicken, romaine, Caesar sauce, Parmesan, croutons."}',
   149000, '/img/dishes/caesar.jpg', NULL, 0, 0),
 ('olivier', 'salads', 2, '{"ru":"Оливье VIBE","en":"Olivier Salad VIBE","vi":"Olivier Salad VIBE"}',
   '{"ru":"Классический салат, начинка на выбор.","en":"Classic salad, your choice of filling."}',
   139000, '/img/dishes/olivier.jpg', NULL, 0, 0);

INSERT INTO option_groups (id, dish_id, sort, name, min_select, max_select) VALUES
 ('ol-fill', 'olivier', 1, '{"ru":"Начинка","en":"Filling","vi":"Filling"}', 1, 1);

INSERT INTO options (id, group_id, sort, name, price_delta) VALUES
 ('ol-chicken', 'ol-fill', 1, '{"ru":"С курицей","en":"With chicken","vi":"With chicken"}', 0),
 ('ol-sausage', 'ol-fill', 2, '{"ru":"С докторской колбасой","en":"With doctor''s sausage","vi":"With doctor''s sausage"}', 0),
 ('ol-salmon', 'ol-fill', 3, '{"ru":"Со слабосолёным лососем","en":"With lightly salted salmon","vi":"With lightly salted salmon"}', 0);
