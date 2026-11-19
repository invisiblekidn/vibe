-- Актуальный лист «Салаты / Salads» (фото меню от 19.11.2026).
-- Можно выполнять повторно: обновляет блюда и опции, заказы и стоп-лист не трогает.
-- Салаты, которых нет на листе, скрываются (active = 0), а не удаляются: на них ссылаются прошлые заказы.
-- Вьетнамский текст здесь же; seed/menu-vi.json держим в том же виде.

INSERT INTO categories (id, sort, name) VALUES
 ('salads', 5, '{"ru": "Салаты", "vi": "Salad", "en": "Salads"}')
ON CONFLICT(id) DO UPDATE SET sort = excluded.sort, name = excluded.name;

DELETE FROM options WHERE group_id IN (SELECT id FROM option_groups WHERE dish_id IN ('caesar-chicken','caesar-salmon','caesar-shrimp','avocado-salmon','olivier','crab-salad','greek-salad','veg-salad','vinaigrette'));
DELETE FROM option_groups WHERE dish_id IN ('caesar-chicken','caesar-salmon','caesar-shrimp','avocado-salmon','olivier','crab-salad','greek-salad','veg-salad','vinaigrette');

INSERT INTO dishes (id, category_id, sort, name, description, price, photo, weight, is_kids, is_alcohol, active) VALUES
 ('caesar-chicken', 'salads', 1, '{"ru": "Цезарь с курицей", "vi": "Salad Caesar gà", "en": "Caesar Salad with Chicken"}',
   '{"ru": "Сочное куриное филе на гриле, листья салата романо, томаты черри, гренки, соус «Цезарь» и сыр пармезан.", "vi": "Phi lê gà nướng mọng nước, xà lách romaine, cà chua bi, bánh mì nướng giòn, sốt Caesar và phô mai Parmesan.", "en": "Grilled chicken breast, romaine lettuce, cherry tomatoes, croutons, Caesar sauce and Parmesan cheese."}',
   119000, '/img/dishes/sa-caesar-chicken.jpg', NULL, 0, 0, 1),
 ('caesar-salmon', 'salads', 2, '{"ru": "Цезарь с лососем", "vi": "Salad Caesar cá hồi", "en": "Caesar Salad with Salmon"}',
   '{"ru": "Слайсы лосося, листья салата романо, томаты черри, гренки, соус «Цезарь» и сыр пармезан.", "vi": "Cá hồi cắt lát, xà lách romaine, cà chua bi, bánh mì nướng giòn, sốt Caesar và phô mai Parmesan.", "en": "Slices of salmon, romaine lettuce, cherry tomatoes, croutons, Caesar sauce and Parmesan cheese."}',
   139000, '/img/dishes/sa-caesar-salmon.jpg', NULL, 0, 0, 1),
 ('caesar-shrimp', 'salads', 3, '{"ru": "Цезарь с креветками", "vi": "Salad Caesar tôm", "en": "Caesar Salad with Shrimp"}',
   '{"ru": "Обжаренные креветки, листья салата романо, томаты черри, гренки, соус «Цезарь» и сыр пармезан.", "vi": "Tôm áp chảo, xà lách romaine, cà chua bi, bánh mì nướng giòn, sốt Caesar và phô mai Parmesan.", "en": "Grilled shrimp, romaine lettuce, cherry tomatoes, croutons, Caesar sauce and Parmesan cheese."}',
   139000, '/img/dishes/sa-caesar-shrimp.jpg', NULL, 0, 0, 1),
 ('avocado-salmon', 'salads', 4, '{"ru": "Салат с авокадо и лососем", "vi": "Salad bơ và cá hồi", "en": "Avocado & Salmon Salad"}',
   '{"ru": "Авокадо, лосось, зелёное яблоко, салатные листья, сливочный соус.", "vi": "Bơ, cá hồi, táo xanh, xà lách và sốt kem.", "en": "Avocado, salmon, green apple, leafy greens and creamy dressing."}',
   139000, '/img/dishes/sa-avocado-salmon.jpg', NULL, 0, 0, 1),
 ('olivier', 'salads', 5, '{"ru": "Оливье VIBE", "vi": "Salad Olivier VIBE", "en": "Olivier Salad VIBE"}',
   '{"ru": "Классический салат на выбор: с курицей, с докторской колбасой или со слабосолёным лососем.", "vi": "Salad Nga truyền thống, tùy chọn: với thịt gà, xúc xích luộc hoặc cá hồi muối nhạt.", "en": "Classic Russian salad, choice of: with chicken, with doctor’s sausage or with lightly salted salmon."}',
   119000, '/img/dishes/sa-olivier.jpg', NULL, 0, 0, 1),
 ('crab-salad', 'salads', 6, '{"ru": "Крабовый салат", "vi": "Salad thanh cua", "en": "Crab Salad"}',
   '{"ru": "Крабовые палочки, яйцо, кукуруза, свежий огурец, нежный майонез.", "vi": "Thanh cua, trứng, bắp, dưa leo tươi và sốt mayonnaise béo.", "en": "Crab sticks, egg, corn, fresh cucumber and creamy mayonnaise."}',
   109000, '/img/dishes/sa-crab.jpg', NULL, 0, 0, 1),
 ('greek-salad', 'salads', 7, '{"ru": "Греческий салат", "vi": "Salad Hy Lạp", "en": "Greek Salad"}',
   '{"ru": "Свежие овощи, сыр фета, оливки, красный лук, ароматная заправка с оливковым маслом.", "vi": "Rau củ tươi, phô mai feta, ô liu, hành tím và sốt dầu ô liu thơm.", "en": "Fresh vegetables, feta cheese, olives, red onion and olive oil dressing."}',
   119000, '/img/dishes/sa-greek.jpg', NULL, 0, 0, 1),
 ('veg-salad', 'salads', 8, '{"ru": "Салат из свежих овощей", "vi": "Salad rau củ tươi", "en": "Fresh Vegetable Salad"}',
   '{"ru": "Помидоры, огурцы, болгарский перец, красный лук, салатные листья, зелень. Заправка на выбор: оливковое масло или сметана.", "vi": "Cà chua, dưa leo, ớt chuông, hành tím, xà lách và rau thơm. Nước sốt tùy chọn: dầu ô liu hoặc kem chua.", "en": "Tomatoes, cucumbers, bell pepper, red onion, leafy greens and herbs. Dressing of your choice: olive oil or sour cream."}',
   99000, '/img/dishes/sa-veg.jpg', NULL, 0, 0, 1),
 ('vinaigrette', 'salads', 9, '{"ru": "Винегрет", "vi": "Salad củ dền Vinaigrette", "en": "Vinaigrette"}',
   '{"ru": "Традиционный салат из свёклы, картофеля, моркови, солёных огурцов, зелёного горошка и репчатого лука, с оливковым маслом.", "vi": "Salad củ dền truyền thống với khoai tây, cà rốt, dưa chuột muối, đậu Hà Lan và hành tây, trộn dầu ô liu.", "en": "Traditional beetroot salad with potatoes, carrots, pickles, green peas and onion, with olive oil."}',
   89000, '/img/dishes/sa-vinaigrette.jpg', NULL, 0, 0, 1)
ON CONFLICT(id) DO UPDATE SET category_id = excluded.category_id, sort = excluded.sort, name = excluded.name,
 description = excluded.description, price = excluded.price, photo = excluded.photo, weight = excluded.weight,
 is_kids = excluded.is_kids, is_alcohol = excluded.is_alcohol, active = excluded.active;

UPDATE dishes SET active = 0 WHERE category_id = 'salads' AND id NOT IN ('caesar-chicken','caesar-salmon','caesar-shrimp','avocado-salmon','olivier','crab-salad','greek-salad','veg-salad','vinaigrette');

INSERT INTO option_groups (id, dish_id, sort, name, min_select, max_select) VALUES
 ('ol-fill', 'olivier', 1, '{"ru": "Начинка", "vi": "Nhân", "en": "Filling"}', 1, 1),
 ('vs-dress', 'veg-salad', 1, '{"ru": "Заправка", "vi": "Sốt trộn", "en": "Dressing"}', 1, 1);

INSERT INTO options (id, group_id, sort, name, price_delta) VALUES
 ('ol-chicken', 'ol-fill', 1, '{"ru": "С курицей", "vi": "Với thịt gà", "en": "With chicken"}', 0),
 ('ol-sausage', 'ol-fill', 2, '{"ru": "С докторской колбасой", "vi": "Với xúc xích luộc", "en": "With doctor’s sausage"}', 0),
 ('ol-salmon', 'ol-fill', 3, '{"ru": "Со слабосолёным лососем", "vi": "Với cá hồi muối nhạt", "en": "With lightly salted salmon"}', 0),
 ('vs-oil', 'vs-dress', 1, '{"ru": "Оливковое масло", "vi": "Dầu ô liu", "en": "Olive oil"}', 0),
 ('vs-sour', 'vs-dress', 2, '{"ru": "Сметана", "vi": "Kem chua", "en": "Sour cream"}', 0);
