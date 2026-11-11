-- ТЕСТОВЫЕ ДАННЫЕ для разработки. Часть настоящего меню (ноябрь 2026), фото временные.
-- Завтраки и круассаны — в seed/menu-breakfast.sql (выполнять после этого файла).
-- Вьетнамские названия пока совпадают с английскими: переведём на этапе 6.

DELETE FROM order_events; DELETE FROM order_items; DELETE FROM orders;
DELETE FROM bill_events; DELETE FROM table_calls; DELETE FROM bills;
DELETE FROM options; DELETE FROM option_groups; DELETE FROM stop_list; DELETE FROM dishes; DELETE FROM categories; DELETE FROM locations;

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
 ('borsch', 'soups', 1, '{"ru":"Борщ с говядиной","en":"Borscht with beef","vi":"Borscht with beef"}',
   '{"ru":"Классический борщ с говядиной, сметаной и тёмным хлебом.","en":"Classic beet soup with beef, sour cream and dark bread."}',
   139000, '/img/dishes/borsch.jpg', NULL, 0, 0),
 ('pelmeni', 'mains', 2, '{"ru":"Пельмени","en":"Pelmeni","vi":"Pelmeni"}',
   '{"ru":"Домашние пельмени с мясной начинкой и сметаной.","en":"Homemade meat dumplings with sour cream."}',
   149000, '/img/dishes/pelmeni.jpg', NULL, 0, 0),
 ('caesar-chicken', 'salads', 1, '{"ru":"Цезарь с курицей","en":"Caesar with chicken","vi":"Caesar with chicken"}',
   '{"ru":"Куриное филе на гриле, романо, соус Цезарь, пармезан, гренки.","en":"Grilled chicken, romaine, Caesar sauce, Parmesan, croutons."}',
   149000, '/img/dishes/caesar.jpg', NULL, 0, 0),
 ('olivier', 'salads', 2, '{"ru":"Оливье VIBE","en":"Olivier Salad VIBE","vi":"Olivier Salad VIBE"}',
   '{"ru":"Классический салат, начинка на выбор.","en":"Classic salad, your choice of filling."}',
   139000, '/img/dishes/olivier.jpg', NULL, 0, 0),
 ('kiev', 'mains', 1, '{"ru":"Котлета по-киевски с пюре","en":"Chicken Kiev with mashed potatoes","vi":"Chicken Kiev with mashed potatoes"}',
   '{"ru":"Куриное филе с ароматным маслом и зеленью в хрустящей панировке.","en":"Chicken fillet with herb butter in a crispy coating."}',
   189000, '/img/dishes/kiev.jpg', NULL, 0, 0),
 ('carbonara', 'mains', 3, '{"ru":"Карбонара","en":"Carbonara","vi":"Carbonara"}',
   '{"ru":"Паста с беконом в сливочном соусе с пармезаном.","en":"Pasta with bacon in a creamy sauce with Parmesan."}',
   159000, '/img/dishes/carbonara.jpg', NULL, 0, 0),
 ('kids-cutlets', 'kids', 1, '{"ru":"Куриные котлетки с пюре","en":"Chicken cutlets with mashed potatoes","vi":"Chicken cutlets with mashed potatoes"}',
   '{"ru":"Нежные куриные котлетки с воздушным пюре.","en":"Tender chicken cutlets with fluffy mash."}',
   89000, '/img/dishes/kids.jpg', '280 г', 1, 0),
 ('cappuccino', 'bar', 1, '{"ru":"Капучино","en":"Cappuccino","vi":"Cappuccino"}', '{}', 65000, '/img/dishes/cappuccino.jpg', NULL, 0, 0),
 ('mojito', 'bar', 2, '{"ru":"Мохито","en":"Mojito","vi":"Mojito"}',
   '{"ru":"Ром, лайм, мята, сахар, содовая.","en":"Rum, lime, mint, sugar, soda water."}',
   129000, '/img/dishes/mojito.jpg', NULL, 0, 1);

INSERT INTO option_groups (id, dish_id, sort, name, min_select, max_select) VALUES
 ('ol-fill', 'olivier', 1, '{"ru":"Начинка","en":"Filling","vi":"Filling"}', 1, 1);

INSERT INTO options (id, group_id, sort, name, price_delta) VALUES
 ('ol-chicken', 'ol-fill', 1, '{"ru":"С курицей","en":"With chicken","vi":"With chicken"}', 0),
 ('ol-sausage', 'ol-fill', 2, '{"ru":"С докторской колбасой","en":"With doctor''s sausage","vi":"With doctor''s sausage"}', 0),
 ('ol-salmon', 'ol-fill', 3, '{"ru":"Со слабосолёным лососем","en":"With lightly salted salmon","vi":"With lightly salted salmon"}', 0);
