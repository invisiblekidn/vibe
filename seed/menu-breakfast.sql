-- Лист меню «Завтраки / Круассаны» (фото меню от 11.11.2026).
-- Можно выполнять повторно: обновляет блюда и опции, заказы и стоп-лист не трогает.
-- Вьетнамские названия пока совпадают с английскими: переведём на этапе 6.

INSERT INTO categories (id, sort, name) VALUES
 ('breakfast',  1, '{"ru":"Завтраки","en":"Breakfasts","vi":"Breakfasts"}'),
 ('croissants', 2, '{"ru":"Круассаны","en":"Croissants","vi":"Croissants"}'),
 ('soups',      3, '{"ru":"Супы","en":"Soups","vi":"Soups"}'),
 ('salads',     4, '{"ru":"Салаты","en":"Salads","vi":"Salads"}'),
 ('mains',      5, '{"ru":"Горячее","en":"Main dishes","vi":"Main dishes"}'),
 ('kids',       6, '{"ru":"Детское меню","en":"Kids menu","vi":"Kids menu"}'),
 ('desserts',   7, '{"ru":"Десерты","en":"Desserts","vi":"Desserts"}'),
 ('bar',        8, '{"ru":"Бар","en":"Bar","vi":"Bar"}')
ON CONFLICT(id) DO UPDATE SET sort = excluded.sort, name = excluded.name;

-- Старые опции блюд этого листа убираем и записываем заново.
DELETE FROM options WHERE group_id IN (SELECT id FROM option_groups WHERE dish_id IN
 ('big-breakfast','eggs-benedict','syrniki','omelette','avocado-toast','porridge','blinchiki','draniki','zucchini-fritters',
  'croissant-salmon','croissant-choc','croissant-caesar','croissant-bacon'));
DELETE FROM option_groups WHERE dish_id IN
 ('big-breakfast','eggs-benedict','syrniki','omelette','avocado-toast','porridge','blinchiki','draniki','zucchini-fritters',
  'croissant-salmon','croissant-choc','croissant-caesar','croissant-bacon');

INSERT INTO dishes (id, category_id, sort, name, description, price, photo, weight, is_kids, is_alcohol, active) VALUES
 ('big-breakfast', 'breakfast', 1, '{"ru":"Большой завтрак VIBE","en":"Big Breakfast VIBE","vi":"Big Breakfast VIBE"}',
   '{"ru":"Яйца на выбор (глазунья, скрэмбл или омлет), бекон, две сосиски, картофель по-деревенски с зеленью, свежие овощи, два кусочка багета, масло и зелень.","en":"Eggs of your choice (fried eggs, scrambled eggs or omelette), bacon, two sausages, country-style potatoes with herbs, fresh vegetables, two slices of baguette, butter and greens."}',
   129000, '/img/dishes/breakfast.jpg', NULL, 0, 0, 1),
 ('eggs-benedict', 'breakfast', 2, '{"ru":"Яйца Бенедикт","en":"Eggs Benedict","vi":"Eggs Benedict"}',
   '{"ru":"Чиабатта, яйцо пашот, голландский соус, свежая зелень. С лососем или с беконом.","en":"Ciabatta, poached egg, hollandaise sauce, fresh greens. With salmon or with bacon."}',
   134000, '/img/dishes/benedict.jpg', NULL, 0, 0, 1),
 ('syrniki', 'breakfast', 3, '{"ru":"Сырники","en":"Syrniki","vi":"Syrniki"}',
   '{"ru":"Нежные творожные сырники. Подаются с кусочками манго и драгонфрукта.","en":"Cottage cheese pancakes. Served with mango and dragon fruit."}',
   119000, '/img/dishes/syrniki.jpg', NULL, 0, 0, 1),
 ('omelette', 'breakfast', 4, '{"ru":"Омлет / Скрэмбл","en":"Omelette / Scrambled Eggs","vi":"Omelette / Scrambled Eggs"}',
   '{"ru":"Воздушный омлет или нежный скрэмбл на ваш выбор. С лёгким салатом: айсберг, огурец, черри.","en":"Fluffy omelette or creamy scrambled eggs. Served with iceberg lettuce, cucumber and cherry tomatoes."}',
   109000, '/img/dishes/omelette.jpg', NULL, 0, 0, 1),
 ('avocado-toast', 'breakfast', 5, '{"ru":"Авокадо-тост с яйцом пашот","en":"Avocado Toast with Poached Egg","vi":"Avocado Toast with Poached Egg"}',
   '{"ru":"Хрустящая чиабатта, крем из авокадо, яйцо пашот, свежие томаты и зелень.","en":"Ciabatta with avocado cream, poached egg, fresh tomatoes and greens."}',
   129000, '/img/dishes/avocado-toast.jpg', NULL, 0, 0, 1),
 ('porridge', 'breakfast', 6, '{"ru":"Каша","en":"Porridge","vi":"Porridge"}',
   '{"ru":"На выбор: овсяная, рисовая или гречневая на молоке.","en":"Your choice: oatmeal, rice or buckwheat porridge with milk."}',
   79000, '/img/dishes/porridge.jpg', NULL, 0, 0, 1),
 ('blinchiki', 'breakfast', 7, '{"ru":"Блинчики (3 шт.)","en":"Blinchiki (3 pcs.)","vi":"Blinchiki (3 pcs.)"}',
   '{"ru":"Тонкие блинчики с начинкой на выбор: с мясом, с творогом или со сгущённым молоком.","en":"Thin crepes with a filling of your choice: meat, cottage cheese or condensed milk."}',
   139000, '/img/dishes/blinchiki.jpg', NULL, 0, 0, 1),
 ('draniki', 'breakfast', 8, '{"ru":"Драники картофельные (3 шт.)","en":"Potato Draniki (3 pcs.)","vi":"Potato Draniki (3 pcs.)"}',
   '{"ru":"Картофельные драники со свежими овощами и зеленью.","en":"Potato pancakes with fresh vegetables and greens."}',
   109000, '/img/dishes/draniki.jpg', NULL, 0, 0, 1),
 ('zucchini-fritters', 'breakfast', 9, '{"ru":"Оладьи из цукини (3 шт.)","en":"Zucchini Fritters (3 pcs.)","vi":"Zucchini Fritters (3 pcs.)"}',
   '{"ru":"Оладьи из цукини со свежими овощами и зеленью.","en":"Zucchini fritters with fresh vegetables and greens."}',
   109000, '/img/dishes/zucchini.jpg', NULL, 0, 0, 1),
 ('croissant-salmon', 'croissants', 1, '{"ru":"Круассан с лососем и крем-чизом","en":"Croissant with salmon & cream cheese","vi":"Croissant with salmon & cream cheese"}',
   '{}', 139000, '/img/dishes/croissant-salmon.jpg', NULL, 0, 0, 1),
 ('croissant-choc', 'croissants', 2, '{"ru":"Круассан с шоколадом и арахисом","en":"Croissant with chocolate & peanut","vi":"Croissant with chocolate & peanut"}',
   '{}', 79000, '/img/dishes/croissant-choc.jpg', NULL, 0, 0, 1),
 ('croissant-caesar', 'croissants', 3, '{"ru":"Цезарь круассан","en":"Caesar croissant with chicken","vi":"Caesar croissant with chicken"}',
   '{"ru":"Круассан с курицей в стиле Цезарь.","en":"Croissant with chicken, Caesar style."}', 119000, '/img/dishes/croissant-caesar.jpg', NULL, 0, 0, 1),
 ('croissant-bacon', 'croissants', 4, '{"ru":"Круассан с беконом, ветчиной и сыром","en":"Croissant with bacon, ham & cheese","vi":"Croissant with bacon, ham & cheese"}',
   '{}', 109000, '/img/dishes/croissant-bacon.jpg', NULL, 0, 0, 1)
ON CONFLICT(id) DO UPDATE SET category_id = excluded.category_id, sort = excluded.sort, name = excluded.name,
 description = excluded.description, price = excluded.price, photo = excluded.photo, weight = excluded.weight,
 is_kids = excluded.is_kids, is_alcohol = excluded.is_alcohol, active = excluded.active;

INSERT INTO option_groups (id, dish_id, sort, name, min_select, max_select) VALUES
 ('bb-eggs',   'big-breakfast',     1, '{"ru":"Яйца","en":"Eggs","vi":"Eggs"}', 1, 1),
 ('eb-with',   'eggs-benedict',     1, '{"ru":"Вариант","en":"Choose","vi":"Choose"}', 1, 1),
 ('sy-sauce',  'syrniki',           1, '{"ru":"Соус на выбор","en":"Sauce","vi":"Sauce"}', 1, 1),
 ('om-type',   'omelette',          1, '{"ru":"Омлет или скрэмбл","en":"Omelette or scrambled","vi":"Omelette or scrambled"}', 1, 1),
 ('om-fill',   'omelette',          2, '{"ru":"Вариант","en":"Choose","vi":"Choose"}', 1, 1),
 ('om-add',    'omelette',          3, '{"ru":"Добавьте по вкусу","en":"Add on","vi":"Add on"}', 0, 3),
 ('at-add',    'avocado-toast',     1, '{"ru":"Добавьте по вкусу","en":"Add on","vi":"Add on"}', 0, 3),
 ('pr-kind',   'porridge',          1, '{"ru":"Каша на выбор","en":"Your choice","vi":"Your choice"}', 1, 1),
 ('bl-fill',   'blinchiki',         1, '{"ru":"Начинка","en":"Filling","vi":"Filling"}', 1, 1),
 ('dr-add',    'draniki',           1, '{"ru":"Добавьте","en":"Add on","vi":"Add on"}', 0, 4),
 ('zf-add',    'zucchini-fritters', 1, '{"ru":"Добавьте","en":"Add on","vi":"Add on"}', 0, 4);

INSERT INTO options (id, group_id, sort, name, price_delta) VALUES
 ('bb-fried',   'bb-eggs', 1, '{"ru":"Глазунья","en":"Fried eggs","vi":"Fried eggs"}', 0),
 ('bb-scr',     'bb-eggs', 2, '{"ru":"Скрэмбл","en":"Scrambled eggs","vi":"Scrambled eggs"}', 0),
 ('bb-oml',     'bb-eggs', 3, '{"ru":"Омлет","en":"Omelette","vi":"Omelette"}', 0),
 ('eb-bacon',   'eb-with', 1, '{"ru":"С беконом","en":"With bacon","vi":"With bacon"}', 0),
 ('eb-salmon',  'eb-with', 2, '{"ru":"С лососем","en":"With salmon","vi":"With salmon"}', 15000),
 ('sy-cond',    'sy-sauce', 1, '{"ru":"Сгущённое молоко","en":"Condensed milk","vi":"Condensed milk"}', 0),
 ('sy-jam',     'sy-sauce', 2, '{"ru":"Клубничное варенье","en":"Strawberry jam","vi":"Strawberry jam"}', 0),
 ('sy-choc',    'sy-sauce', 3, '{"ru":"Шоколадный соус","en":"Chocolate sauce","vi":"Chocolate sauce"}', 0),
 ('sy-car',     'sy-sauce', 4, '{"ru":"Карамель","en":"Caramel","vi":"Caramel"}', 0),
 ('om-t-oml',   'om-type', 1, '{"ru":"Омлет","en":"Omelette","vi":"Omelette"}', 0),
 ('om-t-scr',   'om-type', 2, '{"ru":"Скрэмбл","en":"Scrambled eggs","vi":"Scrambled eggs"}', 0),
 ('om-f-bacon', 'om-fill', 1, '{"ru":"С беконом","en":"With bacon","vi":"With bacon"}', 0),
 ('om-f-ham',   'om-fill', 2, '{"ru":"С ветчиной","en":"With ham","vi":"With ham"}', 0),
 ('om-f-salmon','om-fill', 3, '{"ru":"С лососем и крем-чизом","en":"With salmon and cream cheese","vi":"With salmon and cream cheese"}', 10000),
 ('om-salmon',  'om-add', 1, '{"ru":"Лосось","en":"Salmon","vi":"Salmon"}', 60000),
 ('om-bacon',   'om-add', 2, '{"ru":"Бекон","en":"Bacon","vi":"Bacon"}', 35000),
 ('om-ham',     'om-add', 3, '{"ru":"Ветчина","en":"Ham","vi":"Ham"}', 35000),
 ('at-salmon',  'at-add', 1, '{"ru":"Лосось","en":"Salmon","vi":"Salmon"}', 60000),
 ('at-bacon',   'at-add', 2, '{"ru":"Бекон","en":"Bacon","vi":"Bacon"}', 35000),
 ('at-ham',     'at-add', 3, '{"ru":"Ветчина","en":"Ham","vi":"Ham"}', 35000),
 ('pr-oat',     'pr-kind', 1, '{"ru":"Овсяная на молоке","en":"Oatmeal porridge with milk","vi":"Oatmeal porridge with milk"}', 0),
 ('pr-rice',    'pr-kind', 2, '{"ru":"Рисовая на молоке","en":"Rice porridge with milk","vi":"Rice porridge with milk"}', 0),
 ('pr-buck',    'pr-kind', 3, '{"ru":"Гречневая на молоке","en":"Buckwheat porridge with milk","vi":"Buckwheat porridge with milk"}', 0),
 ('bl-meat',    'bl-fill', 1, '{"ru":"С мясом","en":"With meat","vi":"With meat"}', 0),
 ('bl-tvorog',  'bl-fill', 2, '{"ru":"С творогом","en":"With cottage cheese","vi":"With cottage cheese"}', 0),
 ('bl-cond',    'bl-fill', 3, '{"ru":"Со сгущённым молоком","en":"With condensed milk","vi":"With condensed milk"}', 0),
 ('dr-egg',     'dr-add', 1, '{"ru":"Яйцо пашот","en":"Poached egg","vi":"Poached egg"}', 35000),
 ('dr-salmon',  'dr-add', 2, '{"ru":"Лосось","en":"Salmon","vi":"Salmon"}', 60000),
 ('dr-bacon',   'dr-add', 3, '{"ru":"Бекон","en":"Bacon","vi":"Bacon"}', 35000),
 ('dr-ham',     'dr-add', 4, '{"ru":"Ветчина","en":"Ham","vi":"Ham"}', 35000),
 ('zf-egg',     'zf-add', 1, '{"ru":"Яйцо пашот","en":"Poached egg","vi":"Poached egg"}', 35000),
 ('zf-salmon',  'zf-add', 2, '{"ru":"Лосось","en":"Salmon","vi":"Salmon"}', 60000),
 ('zf-bacon',   'zf-add', 3, '{"ru":"Бекон","en":"Bacon","vi":"Bacon"}', 35000),
 ('zf-ham',     'zf-add', 4, '{"ru":"Ветчина","en":"Ham","vi":"Ham"}', 35000);
