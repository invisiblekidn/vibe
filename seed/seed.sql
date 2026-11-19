-- ТЕСТОВЫЕ ДАННЫЕ для разработки. Часть настоящего меню (ноябрь 2026), фото временные.
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
 ('big-breakfast', 'breakfast', 1, '{"ru":"Большой завтрак VIBE","en":"Big Breakfast VIBE","vi":"Big Breakfast VIBE"}',
   '{"ru":"Яйца на выбор, бекон, две сосиски, картофель по-деревенски, овощи, багет, масло.","en":"Eggs of your choice, bacon, two sausages, country potatoes, vegetables, baguette, butter."}',
   129000, '/img/dishes/breakfast.jpg', NULL, 0, 0),
 ('syrniki', 'breakfast', 2, '{"ru":"Сырники","en":"Syrniki","vi":"Syrniki"}',
   '{"ru":"Нежные творожные сырники с манго и драгонфрутом.","en":"Cottage cheese pancakes with mango and dragon fruit."}',
   119000, '/img/dishes/syrniki.jpg', NULL, 0, 0),
 ('omelette', 'breakfast', 3, '{"ru":"Омлет с лососем и крем-чизом","en":"Omelette with salmon and cream cheese","vi":"Omelette with salmon and cream cheese"}',
   '{"ru":"Воздушный омлет, лёгкий салат.","en":"Fluffy omelette with a light salad."}',
   119000, '/img/dishes/omelette.jpg', NULL, 0, 0),
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
 ('blinchiki', 'desserts', 1, '{"ru":"Блинчики с начинкой","en":"Thin pancakes with filling","vi":"Thin pancakes with filling"}',
   '{"ru":"Тонкие блинчики, начинка на выбор.","en":"Thin pancakes, filling of your choice."}',
   109000, '/img/dishes/blinchiki.jpg', NULL, 0, 0),
 ('cappuccino', 'bar', 1, '{"ru":"Капучино","en":"Cappuccino","vi":"Cappuccino"}', '{}', 65000, '/img/dishes/cappuccino.jpg', NULL, 0, 0),
 ('mojito', 'bar', 2, '{"ru":"Мохито","en":"Mojito","vi":"Mojito"}',
   '{"ru":"Ром, лайм, мята, сахар, содовая.","en":"Rum, lime, mint, sugar, soda water."}',
   129000, '/img/dishes/mojito.jpg', NULL, 0, 1);

INSERT INTO option_groups (id, dish_id, sort, name, min_select, max_select) VALUES
 ('bb-eggs', 'big-breakfast', 1, '{"ru":"Яйца","en":"Eggs","vi":"Eggs"}', 1, 1),
 ('sy-sauce', 'syrniki', 1, '{"ru":"Соус на выбор","en":"Sauce","vi":"Sauce"}', 1, 1),
 ('om-add', 'omelette', 1, '{"ru":"Добавить","en":"Add on","vi":"Add on"}', 0, 3),
 ('ol-fill', 'olivier', 1, '{"ru":"Начинка","en":"Filling","vi":"Filling"}', 1, 1),
 ('bl-fill', 'blinchiki', 1, '{"ru":"Начинка","en":"Filling","vi":"Filling"}', 1, 1);

INSERT INTO options (id, group_id, sort, name, price_delta) VALUES
 ('bb-fried', 'bb-eggs', 1, '{"ru":"Глазунья","en":"Fried eggs","vi":"Fried eggs"}', 0),
 ('bb-scr', 'bb-eggs', 2, '{"ru":"Скрэмбл","en":"Scrambled","vi":"Scrambled"}', 0),
 ('bb-oml', 'bb-eggs', 3, '{"ru":"Омлет","en":"Omelette","vi":"Omelette"}', 0),
 ('sy-cond', 'sy-sauce', 1, '{"ru":"Сгущённое молоко","en":"Condensed milk","vi":"Condensed milk"}', 0),
 ('sy-jam', 'sy-sauce', 2, '{"ru":"Клубничное варенье","en":"Strawberry jam","vi":"Strawberry jam"}', 0),
 ('sy-choc', 'sy-sauce', 3, '{"ru":"Шоколадный соус","en":"Chocolate sauce","vi":"Chocolate sauce"}', 0),
 ('sy-car', 'sy-sauce', 4, '{"ru":"Карамель","en":"Caramel","vi":"Caramel"}', 0),
 ('om-salmon', 'om-add', 1, '{"ru":"Лосось","en":"Salmon","vi":"Salmon"}', 60000),
 ('om-bacon', 'om-add', 2, '{"ru":"Бекон","en":"Bacon","vi":"Bacon"}', 35000),
 ('om-ham', 'om-add', 3, '{"ru":"Ветчина","en":"Ham","vi":"Ham"}', 35000),
 ('ol-chicken', 'ol-fill', 1, '{"ru":"С курицей","en":"With chicken","vi":"With chicken"}', 0),
 ('ol-sausage', 'ol-fill', 2, '{"ru":"С докторской колбасой","en":"With doctor''s sausage","vi":"With doctor''s sausage"}', 0),
 ('ol-salmon', 'ol-fill', 3, '{"ru":"Со слабосолёным лососем","en":"With lightly salted salmon","vi":"With lightly salted salmon"}', 0),
 ('bl-banana', 'bl-fill', 1, '{"ru":"Шоколадная паста с бананом","en":"Chocolate spread with banana","vi":"Chocolate spread with banana"}', 0),
 ('bl-mango', 'bl-fill', 2, '{"ru":"Шоколадная паста с манго","en":"Chocolate spread with mango","vi":"Chocolate spread with mango"}', 0),
 ('bl-jam', 'bl-fill', 3, '{"ru":"Варенье","en":"Jam","vi":"Jam"}', 0),
 ('bl-cond', 'bl-fill', 4, '{"ru":"Сгущённое молоко","en":"Condensed milk","vi":"Condensed milk"}', 0);
