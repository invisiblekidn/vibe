-- Актуальный лист «Завтраки / Круассаны» (фото меню от 15.11.2026, заменяет лист от 11.11).
-- Можно выполнять повторно: обновляет блюда и опции, заказы и стоп-лист не трогает.
-- Вьетнамский текст здесь же; seed/menu-vi.json держим в том же виде (его выполняют последним).
-- Круассана с шоколадом в новом листе нет: он скрыт (active = 0), а не удалён,
-- (драники и оладьи из цукини переехали в закуски — seed/menu-starters.sql),
-- потому что на них могут ссылаться прошлые заказы и выбор «Блюдо дня» в боте.

INSERT INTO categories (id, sort, name) VALUES
 ('breakfast',  1, '{"ru":"Завтраки","en":"Breakfasts","vi":"Bữa sáng"}'),
 ('croissants', 2, '{"ru":"Круассаны","en":"Croissants","vi":"Bánh sừng bò"}'),
 ('starters',   3, '{"ru":"Закуски","en":"Starters","vi":"Món khai vị"}'),
 ('soups',      4, '{"ru":"Супы","en":"Soups","vi":"Súp"}'),
 ('salads',     5, '{"ru":"Салаты","en":"Salads","vi":"Salad"}'),
 ('mains',      6, '{"ru":"Горячее","en":"Main dishes","vi":"Món chính"}'),
 ('kids',       7, '{"ru":"Детское меню","en":"Kids menu","vi":"Thực đơn trẻ em"}'),
 ('desserts',   8, '{"ru":"Десерты","en":"Desserts","vi":"Tráng miệng"}'),
 ('bar',        9, '{"ru":"Бар","en":"Bar","vi":"Đồ uống"}')
ON CONFLICT(id) DO UPDATE SET sort = excluded.sort, name = excluded.name;

DELETE FROM options WHERE group_id IN (SELECT id FROM option_groups WHERE dish_id IN ('big-breakfast','eggs-benedict','syrniki','omelette','avocado-toast','porridge','shakshuka','blinchiki','blinchiki-meat','blinchiki-tvorog','croissant-salmon','croissant-caesar','croissant-bacon','croissant-choc'));
DELETE FROM option_groups WHERE dish_id IN ('big-breakfast','eggs-benedict','syrniki','omelette','avocado-toast','porridge','shakshuka','blinchiki','blinchiki-meat','blinchiki-tvorog','croissant-salmon','croissant-caesar','croissant-bacon','croissant-choc');

INSERT INTO dishes (id, category_id, sort, name, description, price, photo, weight, is_kids, is_alcohol, active) VALUES
 ('big-breakfast', 'breakfast', 1, '{"ru": "Большой завтрак VIBE", "vi": "Bữa sáng lớn VIBE", "en": "Big Breakfast VIBE"}',
   '{"ru": "Яйца на выбор (глазунья, скрэмбл или омлет), бекон, две сосиски, картофель по-деревенски с зеленью, свежие овощи, два кусочка багета и кетчуп.", "vi": "Trứng tùy chọn (ốp la, trứng bác hoặc trứng chiên), thịt xông khói, hai xúc xích, khoai tây kiểu đồng quê với rau thơm, rau củ tươi, hai lát bánh mì baguette và tương cà.", "en": "Eggs of your choice (fried eggs, scrambled eggs or omelette), bacon, two sausages, country-style potatoes with herbs, fresh vegetables, two slices of baguette and ketchup."}',
   129000, '/img/dishes/breakfast.jpg', NULL, 0, 0, 1),
 ('eggs-benedict', 'breakfast', 2, '{"ru": "Яйца Бенедикт", "vi": "Trứng Benedict", "en": "Eggs Benedict"}',
   '{"ru": "Чиабатта, яйцо пашот, голландский соус, свежая зелень. С лососем или с беконом.", "vi": "Bánh mì ciabatta, trứng chần, sốt hollandaise, rau thơm tươi. Kèm cá hồi hoặc thịt xông khói.", "en": "Ciabatta, poached egg, hollandaise sauce, fresh greens. With salmon or with bacon."}',
   129000, '/img/dishes/benedict.jpg', NULL, 0, 0, 1),
 ('syrniki', 'breakfast', 3, '{"ru": "Мамины сырники", "vi": "Bánh syrniki của mẹ", "en": "Mom’s Syrniki"}',
   '{"ru": "Нежные домашние сырники (3 шт.). Подаются с двумя соусами на выбор: сгущённое молоко, клубничное варенье, шоколадный соус или карамель.", "vi": "Bánh phô mai tươi nhà làm mềm mịn (3 cái). Ăn kèm hai loại sốt tùy chọn: sữa đặc, mứt dâu, sốt sô-cô-la hoặc caramen.", "en": "Tender homemade cottage cheese pancakes (3 pcs.). Served with two sauces of your choice: condensed milk, strawberry jam, chocolate sauce or caramel."}',
   119000, '/img/dishes/syrniki.jpg', NULL, 0, 0, 1),
 ('omelette', 'breakfast', 4, '{"ru": "Омлет / Скрэмбл", "vi": "Trứng chiên / Trứng bác", "en": "Omelette / Scrambled Eggs"}',
   '{"ru": "Воздушный омлет или нежный скрэмбл на ваш выбор. С лёгким салатом.", "vi": "Trứng chiên xốp hoặc trứng bác mềm tùy chọn. Kèm salad nhẹ.", "en": "Fluffy omelette or creamy scrambled eggs of your choice. Served with a light salad."}',
   99000, '/img/dishes/omelette.jpg', NULL, 0, 0, 1),
 ('avocado-toast', 'breakfast', 5, '{"ru": "Авокадо-тост с яйцом пашот", "vi": "Bánh mì bơ với trứng chần", "en": "Avocado Toast with Poached Egg"}',
   '{"ru": "Хрустящая чиабатта, крем из авокадо, яйцо пашот, лосось, свежие томаты и зелень.", "vi": "Bánh mì ciabatta giòn, kem bơ, trứng chần, cá hồi, cà chua tươi và rau thơm.", "en": "Crispy ciabatta with avocado cream, poached egg, salmon, fresh tomatoes and greens."}',
   129000, '/img/dishes/avocado-toast.jpg', NULL, 0, 0, 1),
 ('porridge', 'breakfast', 6, '{"ru": "Каша", "vi": "Cháo sữa", "en": "Porridge"}',
   '{"ru": "На выбор: овсяная, рисовая или гречневая на молоке.", "vi": "Tùy chọn: cháo yến mạch, cháo gạo hoặc cháo kiều mạch nấu với sữa.", "en": "Your choice: oatmeal, rice or buckwheat porridge with milk."}',
   79000, '/img/dishes/porridge.jpg', NULL, 0, 0, 1),
 ('shakshuka', 'breakfast', 7, '{"ru": "Шакшука", "vi": "Shakshuka", "en": "Shakshuka"}',
   '{"ru": "Ароматное блюдо из томатов и овощей с двумя яйцами. Сверху посыпано фетой.", "vi": "Món cà chua và rau củ thơm lừng với hai quả trứng. Rắc phô mai feta lên trên.", "en": "Aromatic dish of tomatoes and vegetables with two eggs. Topped with feta."}',
   119000, '/img/dishes/shakshuka.jpg', NULL, 0, 0, 1),
 ('blinchiki', 'breakfast', 8, '{"ru": "Блинчики (3 шт.)", "vi": "Bánh crepe Nga (3 cái)", "en": "Blinchiki (3 pcs.)"}',
   '{"ru": "Тонкие блинчики с топпингом на выбор: сгущённое молоко, клубничное варенье, шоколадный соус или карамель.", "vi": "Bánh crepe mỏng ăn kèm sốt tùy chọn: sữa đặc, mứt dâu, sốt sô-cô-la hoặc caramen.", "en": "Thin crepes served with a topping of your choice: condensed milk, strawberry jam, chocolate sauce or caramel."}',
   89000, '/img/dishes/blinchiki.jpg', NULL, 0, 0, 1),
 ('blinchiki-meat', 'breakfast', 9, '{"ru": "Блинчики с мясом (2 шт.)", "vi": "Bánh crepe nhân thịt (2 cái)", "en": "Pancakes with Meat (2 pcs.)"}',
   '{"ru": "Подаются со сметаной.", "vi": "Ăn kèm kem chua.", "en": "Served with sour cream."}',
   99000, '/img/dishes/blinchiki-meat.jpg', NULL, 0, 0, 1),
 ('blinchiki-tvorog', 'breakfast', 10, '{"ru": "Блинчики с творогом (2 шт.)", "vi": "Bánh crepe nhân phô mai tươi (2 cái)", "en": "Pancakes with Cottage Cheese (2 pcs.)"}',
   '{"ru": "Подаются со сметаной и клубничным вареньем.", "vi": "Ăn kèm kem chua và mứt dâu.", "en": "Served with sour cream and strawberry jam."}',
   119000, '/img/dishes/blinchiki-tvorog.jpg', NULL, 0, 0, 1),
 ('croissant-salmon', 'croissants', 1, '{"ru": "Круассан с лососем и крем-чизом", "vi": "Bánh sừng bò cá hồi và kem phô mai", "en": "Croissant with Salmon & Cream Cheese"}',
   '{}',
   129000, '/img/dishes/croissant-salmon.jpg', NULL, 0, 0, 1),
 ('croissant-caesar', 'croissants', 2, '{"ru": "Цезарь круассан", "vi": "Bánh sừng bò gà kiểu Caesar", "en": "Caesar Croissant with Chicken"}',
   '{"ru": "Круассан с курицей в стиле Цезарь.", "vi": "Bánh sừng bò nhân gà kiểu Caesar.", "en": "Croissant with chicken, Caesar style."}',
   119000, '/img/dishes/croissant-caesar.jpg', NULL, 0, 0, 1),
 ('croissant-bacon', 'croissants', 3, '{"ru": "Круассан с беконом или ветчиной и сыром", "vi": "Bánh sừng bò thịt xông khói hoặc giăm bông và phô mai", "en": "Croissant with Bacon or Ham & Cheese"}',
   '{"ru": "С сыром и беконом или ветчиной на выбор.", "vi": "Với phô mai, chọn thịt xông khói hoặc giăm bông.", "en": "With cheese and your choice of bacon or ham."}',
   109000, '/img/dishes/croissant-bacon.jpg', NULL, 0, 0, 1)
ON CONFLICT(id) DO UPDATE SET category_id = excluded.category_id, sort = excluded.sort, name = excluded.name,
 description = excluded.description, price = excluded.price, photo = excluded.photo, weight = excluded.weight,
 is_kids = excluded.is_kids, is_alcohol = excluded.is_alcohol, active = excluded.active;

UPDATE dishes SET active = 0 WHERE id IN ('croissant-choc');

INSERT INTO option_groups (id, dish_id, sort, name, min_select, max_select) VALUES
 ('bb-eggs', 'big-breakfast', 1, '{"ru": "Яйца", "vi": "Trứng", "en": "Eggs"}', 1, 1),
 ('eb-with', 'eggs-benedict', 1, '{"ru": "Вариант", "vi": "Lựa chọn", "en": "Your choice"}', 1, 1),
 ('sy-sauce', 'syrniki', 1, '{"ru": "Соусы (один или два)", "vi": "Sốt (một hoặc hai loại)", "en": "Sauces (one or two)"}', 1, 2),
 ('om-type', 'omelette', 1, '{"ru": "Омлет или скрэмбл", "vi": "Trứng chiên hay trứng bác", "en": "Omelette or scrambled eggs"}', 1, 1),
 ('om-fill', 'omelette', 2, '{"ru": "Вариант", "vi": "Lựa chọn", "en": "Your choice"}', 1, 1),
 ('om-add', 'omelette', 3, '{"ru": "Добавьте по вкусу", "vi": "Thêm theo ý thích", "en": "Add-ons"}', 0, 3),
 ('at-add', 'avocado-toast', 1, '{"ru": "Добавьте по вкусу", "vi": "Thêm theo ý thích", "en": "Add-ons"}', 0, 3),
 ('pr-kind', 'porridge', 1, '{"ru": "Каша на выбор", "vi": "Chọn loại cháo", "en": "Your choice"}', 1, 1),
 ('bl-top', 'blinchiki', 1, '{"ru": "Топпинг", "vi": "Sốt", "en": "Topping"}', 1, 1),
 ('cb-meat', 'croissant-bacon', 1, '{"ru": "Бекон или ветчина", "vi": "Thịt xông khói hay giăm bông", "en": "Bacon or ham"}', 1, 1);

INSERT INTO options (id, group_id, sort, name, price_delta) VALUES
 ('bb-fried', 'bb-eggs', 1, '{"ru": "Глазунья", "vi": "Trứng ốp la", "en": "Fried eggs"}', 0),
 ('bb-scr', 'bb-eggs', 2, '{"ru": "Скрэмбл", "vi": "Trứng bác", "en": "Scrambled eggs"}', 0),
 ('bb-oml', 'bb-eggs', 3, '{"ru": "Омлет", "vi": "Trứng chiên", "en": "Omelette"}', 0),
 ('eb-bacon', 'eb-with', 1, '{"ru": "С беконом", "vi": "Với thịt xông khói", "en": "With bacon"}', 0),
 ('eb-salmon', 'eb-with', 2, '{"ru": "С лососем", "vi": "Với cá hồi", "en": "With salmon"}', 10000),
 ('sy-cond', 'sy-sauce', 1, '{"ru": "Сгущённое молоко", "vi": "Sữa đặc", "en": "Condensed milk"}', 0),
 ('sy-jam', 'sy-sauce', 2, '{"ru": "Клубничное варенье", "vi": "Mứt dâu", "en": "Strawberry jam"}', 0),
 ('sy-choc', 'sy-sauce', 3, '{"ru": "Шоколадный соус", "vi": "Sốt sô-cô-la", "en": "Chocolate sauce"}', 0),
 ('sy-car', 'sy-sauce', 4, '{"ru": "Карамель", "vi": "Caramen", "en": "Caramel"}', 0),
 ('om-t-oml', 'om-type', 1, '{"ru": "Омлет", "vi": "Trứng chiên", "en": "Omelette"}', 0),
 ('om-t-scr', 'om-type', 2, '{"ru": "Скрэмбл", "vi": "Trứng bác", "en": "Scrambled eggs"}', 0),
 ('om-f-bacon', 'om-fill', 1, '{"ru": "С беконом", "vi": "Với thịt xông khói", "en": "With bacon"}', 0),
 ('om-f-ham', 'om-fill', 2, '{"ru": "С ветчиной", "vi": "Với giăm bông", "en": "With ham"}', 0),
 ('om-f-salmon', 'om-fill', 3, '{"ru": "С лососем и крем-чизом", "vi": "Với cá hồi và kem phô mai", "en": "With salmon and cream cheese"}', 16000),
 ('om-salmon', 'om-add', 1, '{"ru": "Лосось", "vi": "Cá hồi", "en": "Salmon"}', 50000),
 ('om-bacon', 'om-add', 2, '{"ru": "Бекон", "vi": "Thịt xông khói", "en": "Bacon"}', 30000),
 ('om-ham', 'om-add', 3, '{"ru": "Ветчина", "vi": "Giăm bông", "en": "Ham"}', 30000),
 ('at-salmon', 'at-add', 1, '{"ru": "Лосось", "vi": "Cá hồi", "en": "Salmon"}', 50000),
 ('at-bacon', 'at-add', 2, '{"ru": "Бекон", "vi": "Thịt xông khói", "en": "Bacon"}', 30000),
 ('at-ham', 'at-add', 3, '{"ru": "Ветчина", "vi": "Giăm bông", "en": "Ham"}', 30000),
 ('pr-oat', 'pr-kind', 1, '{"ru": "Овсяная на молоке", "vi": "Cháo yến mạch nấu sữa", "en": "Oatmeal porridge with milk"}', 0),
 ('pr-rice', 'pr-kind', 2, '{"ru": "Рисовая на молоке", "vi": "Cháo gạo nấu sữa", "en": "Rice porridge with milk"}', 0),
 ('pr-buck', 'pr-kind', 3, '{"ru": "Гречневая на молоке", "vi": "Cháo kiều mạch nấu sữa", "en": "Buckwheat porridge with milk"}', 0),
 ('bl-cond', 'bl-top', 1, '{"ru": "Сгущённое молоко", "vi": "Sữa đặc", "en": "Condensed milk"}', 0),
 ('bl-jam', 'bl-top', 2, '{"ru": "Клубничное варенье", "vi": "Mứt dâu", "en": "Strawberry jam"}', 0),
 ('bl-choc', 'bl-top', 3, '{"ru": "Шоколадный соус", "vi": "Sốt sô-cô-la", "en": "Chocolate sauce"}', 0),
 ('bl-car', 'bl-top', 4, '{"ru": "Карамель", "vi": "Caramen", "en": "Caramel"}', 0),
 ('cb-bacon', 'cb-meat', 1, '{"ru": "С беконом", "vi": "Với thịt xông khói", "en": "With bacon"}', 0),
 ('cb-ham', 'cb-meat', 2, '{"ru": "С ветчиной", "vi": "Với giăm bông", "en": "With ham"}', 0);
