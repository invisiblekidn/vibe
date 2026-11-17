-- Актуальный лист «Супы / Soups» (фото меню от 17.11.2026).
-- Можно выполнять повторно: обновляет блюда и опции, заказы и стоп-лист не трогает.
-- Премиум борщ подаётся с рюмкой водки, поэтому он как алкоголь: только к визиту и в зале.
-- Вьетнамский текст здесь же; seed/menu-vi.json держим в том же виде.

INSERT INTO categories (id, sort, name) VALUES
 ('soups', 4, '{"ru": "Супы", "vi": "Súp", "en": "Soups"}')
ON CONFLICT(id) DO UPDATE SET sort = excluded.sort, name = excluded.name;

DELETE FROM options WHERE group_id IN (SELECT id FROM option_groups WHERE dish_id IN ('borsch','borsch-premium','soup-meatballs','soup-noodles','solyanka','okroshka'));
DELETE FROM option_groups WHERE dish_id IN ('borsch','borsch-premium','soup-meatballs','soup-noodles','solyanka','okroshka');

INSERT INTO dishes (id, category_id, sort, name, description, price, photo, weight, is_kids, is_alcohol, active) VALUES
 ('borsch', 'soups', 1, '{"ru": "Борщ с говядиной", "vi": "Súp borscht bò", "en": "Borscht with Beef"}',
   '{"ru": "Классический насыщенный борщ с говядиной, овощами, сметаной и зеленью. Можно добавить сало.", "vi": "Súp borscht đậm đà truyền thống với thịt bò, rau củ, kem chua và rau thơm. Có thể thêm mỡ heo muối (salo).", "en": "Classic rich borscht with beef, vegetables, sour cream and fresh herbs. You can add salo (cured pork fat)."}',
   129000, '/img/dishes/so-borsch.jpg', NULL, 0, 0, 1),
 ('borsch-premium', 'soups', 2, '{"ru": "Премиум борщ VIBE", "vi": "Súp borscht VIBE đặc biệt", "en": "Premium Borscht VIBE"}',
   '{"ru": "Борщ с говядиной, подаётся с салом, чесноком, рюмкой водки и кусочком тёмного хлеба.", "vi": "Súp borscht bò, ăn kèm mỡ heo muối (salo), tỏi, một ly vodka nhỏ và một lát bánh mì đen.", "en": "Borscht with beef, served with salo (cured pork fat), garlic, a shot of vodka and a slice of dark bread."}',
   159000, '/img/dishes/so-borsch-premium.jpg', NULL, 0, 1, 1),
 ('soup-meatballs', 'soups', 3, '{"ru": "Куриный суп с фрикадельками", "vi": "Súp gà thịt viên", "en": "Chicken Soup with Meatballs"}',
   '{"ru": "Ароматный куриный суп с нежными мясными фрикадельками (4 шт.), овощами и зеленью.", "vi": "Súp gà thơm với 4 viên thịt mềm, rau củ và rau thơm tươi.", "en": "Fragrant chicken soup with 4 tender meatballs, vegetables and fresh herbs."}',
   119000, '/img/dishes/so-meatballs.jpg', NULL, 0, 0, 1),
 ('soup-noodles', 'soups', 4, '{"ru": "Куриный суп с яичной лапшой", "vi": "Súp gà mì trứng", "en": "Chicken Soup with Egg Noodles"}',
   '{"ru": "Лёгкий домашний суп с курицей, яичной лапшой, овощами и зеленью.", "vi": "Súp gà nhà làm thanh nhẹ với mì trứng, rau củ và rau thơm tươi.", "en": "Light homemade chicken soup with egg noodles, vegetables and fresh herbs."}',
   109000, '/img/dishes/so-noodles.jpg', NULL, 0, 0, 1),
 ('solyanka', 'soups', 5, '{"ru": "Солянка мясная", "vi": "Súp solyanka thập cẩm", "en": "Meat Solyanka"}',
   '{"ru": "Насыщенная солянка с несколькими видами мяса, солёными огурцами, маслинами и лимоном. Подаётся со сметаной.", "vi": "Súp Nga đậm đà với nhiều loại thịt, dưa chuột muối, ô liu và chanh, ăn kèm kem chua.", "en": "Hearty Russian soup with assorted meats, pickles, olives and lemon, served with sour cream."}',
   139000, '/img/dishes/so-solyanka.jpg', NULL, 0, 0, 1),
 ('okroshka', 'soups', 6, '{"ru": "Окрошка на квасе", "vi": "Súp lạnh okroshka với kvass", "en": "Okroshka on Kvass"}',
   '{"ru": "Освежающий холодный суп на квасе со свежими овощами и зеленью. Подаётся со сметаной и горчицей. На выбор: с курицей или с докторской колбасой.", "vi": "Súp lạnh mát với kvass, rau củ tươi và rau thơm. Ăn kèm kem chua và mù tạt. Tùy chọn: với thịt gà hoặc xúc xích luộc.", "en": "Refreshing cold soup on kvass with fresh vegetables and herbs. Served with sour cream and mustard. Your choice: with chicken or with doctor’s sausage."}',
   119000, '/img/dishes/so-okroshka.jpg', NULL, 0, 0, 1)
ON CONFLICT(id) DO UPDATE SET category_id = excluded.category_id, sort = excluded.sort, name = excluded.name,
 description = excluded.description, price = excluded.price, photo = excluded.photo, weight = excluded.weight,
 is_kids = excluded.is_kids, is_alcohol = excluded.is_alcohol, active = excluded.active;

INSERT INTO option_groups (id, dish_id, sort, name, min_select, max_select) VALUES
 ('bs-add', 'borsch', 1, '{"ru": "Дополнительно", "vi": "Thêm", "en": "Add-ons"}', 0, 1),
 ('ok-kind', 'okroshka', 1, '{"ru": "На выбор", "vi": "Tùy chọn", "en": "Your choice"}', 1, 1);

INSERT INTO options (id, group_id, sort, name, price_delta) VALUES
 ('bs-salo', 'bs-add', 1, '{"ru": "Сало", "vi": "Mỡ heo muối (salo)", "en": "Salo (cured pork fat)"}', 15000),
 ('ok-chicken', 'ok-kind', 1, '{"ru": "С курицей", "vi": "Với thịt gà", "en": "With chicken"}', 0),
 ('ok-sausage', 'ok-kind', 2, '{"ru": "С докторской колбасой", "vi": "Với xúc xích luộc", "en": "With doctor’s sausage"}', 0);
