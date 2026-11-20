-- Актуальный лист «Десерты / Desserts» (фото меню от 20.11.2026).
-- Можно выполнять повторно: обновляет блюда и опции, заказы и стоп-лист не трогает.
-- Десерты, которых нет на листе, скрываются (active = 0), а не удаляются: на них ссылаются прошлые заказы.
-- Вьетнамский текст здесь же; seed/menu-vi.json держим в том же виде.

INSERT INTO categories (id, sort, name) VALUES
 ('desserts', 8, '{"ru": "Десерты", "vi": "Tráng miệng", "en": "Desserts"}')
ON CONFLICT(id) DO UPDATE SET sort = excluded.sort, name = excluded.name;

DELETE FROM options WHERE group_id IN (SELECT id FROM option_groups WHERE dish_id IN ('dessert-blinchiki','napoleon','medovik','oreshki','tvorog-fruit','donuts','waffles'));
DELETE FROM option_groups WHERE dish_id IN ('dessert-blinchiki','napoleon','medovik','oreshki','tvorog-fruit','donuts','waffles');

INSERT INTO dishes (id, category_id, sort, name, description, price, photo, weight, is_kids, is_alcohol, active) VALUES
 ('dessert-blinchiki', 'desserts', 1, '{"ru": "Блинчики с начинкой", "vi": "Bánh crepe nhân ngọt", "en": "Thin Pancakes with Filling"}',
   '{"ru": "Тонкие блинчики, начинка на выбор: шоколадная паста с бананом, шоколадная паста с манго, варенье или сгущённое молоко.", "vi": "Bánh crepe mỏng, nhân tùy chọn: sô-cô-la phết với chuối, sô-cô-la phết với xoài, mứt hoặc sữa đặc.", "en": "Thin pancakes with a filling of your choice: chocolate spread with banana, chocolate spread with mango, jam or condensed milk."}',
   89000, '/img/dishes/ds-blinchiki.jpg', NULL, 0, 0, 1),
 ('napoleon', 'desserts', 2, '{"ru": "Торт «Наполеон»", "vi": "Bánh Napoleon", "en": "Napoleon Cake"}',
   '{"ru": "Классический слоёный торт с нежным заварным кремом.", "vi": "Bánh ngàn lớp truyền thống với kem trứng sữa mềm mịn.", "en": "Classic layered cake with delicate custard cream."}',
   109000, '/img/dishes/ds-napoleon.jpg', NULL, 0, 0, 1),
 ('medovik', 'desserts', 3, '{"ru": "Торт «Медовик»", "vi": "Bánh mật ong Medovik", "en": "Honey Cake"}',
   '{"ru": "Нежный медовый торт с кремом на основе сметаны.", "vi": "Bánh mật ong nhiều lớp mềm với kem chua.", "en": "Tender honey cake with sour cream frosting."}',
   109000, '/img/dishes/ds-medovik.jpg', NULL, 0, 0, 1),
 ('oreshki', 'desserts', 4, '{"ru": "Орешки со сгущёнкой", "vi": "Bánh hạt óc chó nhân sữa đặc", "en": "Walnut-Shaped Cookies with Condensed Milk"}',
   '{"ru": "Классический десерт из хрустящего теста с варёной сгущёнкой.", "vi": "Món tráng miệng truyền thống: vỏ bánh giòn nhân sữa đặc nấu caramen.", "en": "Classic dessert of crispy pastry with boiled condensed milk."}',
   49000, '/img/dishes/ds-oreshki.jpg', '5 шт.', 0, 0, 1),
 ('tvorog-fruit', 'desserts', 5, '{"ru": "Творог с фруктами", "vi": "Phô mai tươi với trái cây", "en": "Cottage Cheese with Fruits"}',
   '{"ru": "Нежный творог со свежими фруктами.", "vi": "Phô mai tươi mềm với trái cây tươi.", "en": "Soft cottage cheese with fresh fruits."}',
   139000, '/img/dishes/ds-tvorog.jpg', '150 г', 0, 0, 1),
 ('donuts', 'desserts', 6, '{"ru": "Жареные пончики", "vi": "Bánh donut chiên", "en": "Fried Donuts"}',
   '{"ru": "Порция из 3 шт., подаётся с сахарной пудрой.", "vi": "Phần 3 cái, rắc đường bột.", "en": "Portion of 3 pcs., served with powdered sugar."}',
   49000, '/img/dishes/ds-donuts.jpg', '3 шт.', 0, 0, 1),
 ('waffles', 'desserts', 7, '{"ru": "Венские вафли с мороженым", "vi": "Bánh waffle với kem", "en": "Belgian Waffles with Ice Cream"}',
   '{"ru": "Две хрустящие вафли, шарик мороженого и карамельный соус.", "vi": "Hai bánh waffle giòn, một viên kem và sốt caramen.", "en": "Two crispy waffles, a scoop of ice cream and caramel sauce."}',
   99000, '/img/dishes/ds-waffles.jpg', NULL, 0, 0, 1)
ON CONFLICT(id) DO UPDATE SET category_id = excluded.category_id, sort = excluded.sort, name = excluded.name,
 description = excluded.description, price = excluded.price, photo = excluded.photo, weight = excluded.weight,
 is_kids = excluded.is_kids, is_alcohol = excluded.is_alcohol, active = excluded.active;

UPDATE dishes SET active = 0 WHERE category_id = 'desserts' AND id NOT IN ('dessert-blinchiki','napoleon','medovik','oreshki','tvorog-fruit','donuts','waffles');

INSERT INTO option_groups (id, dish_id, sort, name, min_select, max_select) VALUES
 ('dbl-fill', 'dessert-blinchiki', 1, '{"ru": "Начинка", "vi": "Nhân", "en": "Filling"}', 1, 1);

INSERT INTO options (id, group_id, sort, name, price_delta) VALUES
 ('dbl-choc-banana', 'dbl-fill', 1, '{"ru": "Шоколадная паста с бананом", "vi": "Sô-cô-la phết với chuối", "en": "Chocolate spread with banana"}', 0),
 ('dbl-choc-mango', 'dbl-fill', 2, '{"ru": "Шоколадная паста с манго", "vi": "Sô-cô-la phết với xoài", "en": "Chocolate spread with mango"}', 0),
 ('dbl-jam', 'dbl-fill', 3, '{"ru": "Варенье", "vi": "Mứt", "en": "Jam"}', 0),
 ('dbl-cond', 'dbl-fill', 4, '{"ru": "Сгущённое молоко", "vi": "Sữa đặc", "en": "Condensed milk"}', 0);
