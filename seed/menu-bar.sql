-- Листы «Бар / Bar» и «Барная карта» (фото меню от 11.11.2026).
-- Можно выполнять повторно: обновляет напитки и опции, заказы и стоп-лист не трогает.
-- Алкоголь (шоты и коктейли) — только к визиту и в зале.

INSERT INTO categories (id, sort, name) VALUES
 ('bar', 8, '{"ru": "Бар", "en": "Bar", "vi": "Bar"}')
ON CONFLICT(id) DO UPDATE SET sort = excluded.sort, name = excluded.name;

DELETE FROM options WHERE group_id IN (SELECT id FROM option_groups WHERE dish_id IN ('espresso','americano','cappuccino','latte','affogato','viet-coffee','egg-coffee','cocoa','tea-black','tea-green','tea-herbal','tea-fruit','tea-bag','juice-orange','juice-pineapple','juice-watermelon','smoothie-berry','smoothie-mango','smoothie-avocado','cola','sprite','tonic','water','shot-tequila','shot-vodka','shot-rum','mojito','aperol','pina-colada','daiquiri','margarita'));
DELETE FROM option_groups WHERE dish_id IN ('espresso','americano','cappuccino','latte','affogato','viet-coffee','egg-coffee','cocoa','tea-black','tea-green','tea-herbal','tea-fruit','tea-bag','juice-orange','juice-pineapple','juice-watermelon','smoothie-berry','smoothie-mango','smoothie-avocado','cola','sprite','tonic','water','shot-tequila','shot-vodka','shot-rum','mojito','aperol','pina-colada','daiquiri','margarita');

INSERT INTO dishes (id, category_id, sort, name, description, price, photo, weight, is_kids, is_alcohol, active) VALUES
 ('espresso', 'bar', 1, '{"ru": "Эспрессо", "en": "Espresso", "vi": "Espresso"}',
   '{}', 45000, '/img/dishes/bar-coffee.jpg', NULL, 0, 0, 1),
 ('americano', 'bar', 2, '{"ru": "Американо", "en": "Americano", "vi": "Americano"}',
   '{}', 55000, '/img/dishes/bar-coffee.jpg', NULL, 0, 0, 1),
 ('cappuccino', 'bar', 3, '{"ru": "Капучино", "en": "Cappuccino", "vi": "Cappuccino"}',
   '{}', 65000, '/img/dishes/bar-coffee.jpg', NULL, 0, 0, 1),
 ('latte', 'bar', 4, '{"ru": "Латте", "en": "Latte", "vi": "Latte"}',
   '{}', 75000, '/img/dishes/bar-coffee.jpg', NULL, 0, 0, 1),
 ('affogato', 'bar', 5, '{"ru": "Аффогато", "en": "Affogato", "vi": "Affogato"}',
   '{"ru": "Эспрессо с шариком мороженого.", "en": "Espresso with a scoop of ice cream."}', 85000, '/img/dishes/bar-coffee.jpg', NULL, 0, 0, 1),
 ('viet-coffee', 'bar', 6, '{"ru": "Вьетнамский кофе", "en": "Vietnamese Coffee", "vi": "Vietnamese Coffee"}',
   '{"ru": "Фильтр-кофе со льдом и сгущённым молоком.", "en": "Filter coffee with ice and condensed milk."}', 65000, '/img/dishes/bar-icedcoffee.jpg', NULL, 0, 0, 1),
 ('egg-coffee', 'bar', 7, '{"ru": "Вьетнамский яичный кофе", "en": "Vietnamese Egg Coffee", "vi": "Vietnamese Egg Coffee"}',
   '{"ru": "Кофе с яичным кремом.", "en": "Coffee with egg cream."}', 85000, '/img/dishes/bar-eggcoffee.jpg', NULL, 0, 0, 1),
 ('cocoa', 'bar', 8, '{"ru": "Какао", "en": "Cocoa", "vi": "Cocoa"}',
   '{}', 35000, '/img/dishes/bar-eggcoffee.jpg', NULL, 0, 0, 1),
 ('tea-black', 'bar', 9, '{"ru": "Чёрный чай", "en": "Black tea", "vi": "Black tea"}',
   '{}', 55000, '/img/dishes/bar-tea.jpg', NULL, 0, 0, 1),
 ('tea-green', 'bar', 10, '{"ru": "Зелёный чай", "en": "Green tea", "vi": "Green tea"}',
   '{}', 55000, '/img/dishes/bar-tea.jpg', NULL, 0, 0, 1),
 ('tea-herbal', 'bar', 11, '{"ru": "Травяной чай", "en": "Herbal tea", "vi": "Herbal tea"}',
   '{"ru": "На выбор: мята-лимон, имбирь или ромашка.", "en": "Your choice: mint-lemon, ginger or chamomile."}', 65000, '/img/dishes/bar-tea.jpg', NULL, 0, 0, 1),
 ('tea-fruit', 'bar', 12, '{"ru": "Фруктовый чай", "en": "Fruit tea", "vi": "Fruit tea"}',
   '{"ru": "На выбор: манго-маракуйя, ягоды или тропический.", "en": "Your choice: mango-passion fruit, berries or tropical."}', 75000, '/img/dishes/bar-tea.jpg', NULL, 0, 0, 1),
 ('tea-bag', 'bar', 13, '{"ru": "Чай пакетированный", "en": "Tea bag", "vi": "Tea bag"}',
   '{"ru": "1 чашка.", "en": "1 cup."}', 25000, '/img/dishes/bar-tea.jpg', NULL, 0, 0, 1),
 ('juice-orange', 'bar', 14, '{"ru": "Апельсиновый сок", "en": "Orange juice", "vi": "Orange juice"}',
   '{"ru": "Свежевыжатый.", "en": "Freshly squeezed."}', 49000, '/img/dishes/bar-juice.jpg', NULL, 0, 0, 1),
 ('juice-pineapple', 'bar', 15, '{"ru": "Ананасовый сок", "en": "Pineapple juice", "vi": "Pineapple juice"}',
   '{"ru": "Свежевыжатый.", "en": "Freshly squeezed."}', 69000, '/img/dishes/bar-juice.jpg', NULL, 0, 0, 1),
 ('juice-watermelon', 'bar', 16, '{"ru": "Арбузный сок", "en": "Watermelon juice", "vi": "Watermelon juice"}',
   '{"ru": "Свежевыжатый.", "en": "Freshly squeezed."}', 59000, '/img/dishes/bar-juice.jpg', NULL, 0, 0, 1),
 ('smoothie-berry', 'bar', 17, '{"ru": "Смузи ягодный", "en": "Berry smoothie", "vi": "Berry smoothie"}',
   '{"ru": "Клубника, малина, черника.", "en": "Strawberry, raspberry, blueberry."}', 95000, '/img/dishes/bar-smoothie.jpg', NULL, 0, 0, 1),
 ('smoothie-mango', 'bar', 18, '{"ru": "Смузи манго-маракуйя", "en": "Mango & Passion Fruit smoothie", "vi": "Mango & Passion Fruit smoothie"}',
   '{}', 95000, '/img/dishes/bar-smoothie.jpg', NULL, 0, 0, 1),
 ('smoothie-avocado', 'bar', 19, '{"ru": "Смузи авокадо-банан", "en": "Avocado & Banana smoothie", "vi": "Avocado & Banana smoothie"}',
   '{}', 95000, '/img/dishes/bar-smoothie.jpg', NULL, 0, 0, 1),
 ('cola', 'bar', 20, '{"ru": "Кола", "en": "Coca-Cola", "vi": "Coca-Cola"}',
   '{}', 35000, '/img/dishes/bar-soft.jpg', NULL, 0, 0, 1),
 ('sprite', 'bar', 21, '{"ru": "Спрайт", "en": "Sprite", "vi": "Sprite"}',
   '{}', 35000, '/img/dishes/bar-soft.jpg', NULL, 0, 0, 1),
 ('tonic', 'bar', 22, '{"ru": "Тоник", "en": "Tonic", "vi": "Tonic"}',
   '{}', 25000, '/img/dishes/bar-soft.jpg', NULL, 0, 0, 1),
 ('water', 'bar', 23, '{"ru": "Вода (0,5 л)", "en": "Water (0.5 l)", "vi": "Water (0.5 l)"}',
   '{}', 15000, '/img/dishes/bar-soft.jpg', NULL, 0, 0, 1),
 ('shot-tequila', 'bar', 24, '{"ru": "Текила", "en": "Tequila", "vi": "Tequila"}',
   '{"ru": "Шот.", "en": "Shot."}', 75000, '/img/dishes/bar-tequila.jpg', NULL, 0, 1, 1),
 ('shot-vodka', 'bar', 25, '{"ru": "Водка", "en": "Vodka", "vi": "Vodka"}',
   '{"ru": "Шот.", "en": "Shot."}', 65000, '/img/dishes/bar-vodka.jpg', NULL, 0, 1, 1),
 ('shot-rum', 'bar', 26, '{"ru": "Ром", "en": "Rum", "vi": "Rum"}',
   '{"ru": "Шот.", "en": "Shot."}', 75000, '/img/dishes/bar-rum.jpg', NULL, 0, 1, 1),
 ('mojito', 'bar', 27, '{"ru": "Мохито", "en": "Mojito", "vi": "Mojito"}',
   '{"ru": "Ром, лайм, мята, сахар, содовая.", "en": "Rum, lime, mint, sugar, soda water."}', 129000, '/img/dishes/bar-mojito.jpg', NULL, 0, 1, 1),
 ('aperol', 'bar', 28, '{"ru": "Апероль Спритц", "en": "Aperol Spritz", "vi": "Aperol Spritz"}',
   '{"ru": "Апероль, игристое вино, содовая, апельсин.", "en": "Aperol, sparkling wine, soda water, orange."}', 149000, '/img/dishes/bar-aperol.jpg', NULL, 0, 1, 1),
 ('pina-colada', 'bar', 29, '{"ru": "Пина Колада", "en": "Piña Colada", "vi": "Piña Colada"}',
   '{"ru": "Ром, ананасовый сок, кокосовые сливки.", "en": "Rum, pineapple juice, coconut cream."}', 149000, '/img/dishes/bar-pina.jpg', NULL, 0, 1, 1),
 ('daiquiri', 'bar', 30, '{"ru": "Дайкири", "en": "Daiquiri", "vi": "Daiquiri"}',
   '{"ru": "Ром, лайм, сахар, клубника.", "en": "Rum, lime, sugar, strawberry."}', 139000, '/img/dishes/bar-daiquiri.jpg', NULL, 0, 1, 1),
 ('margarita', 'bar', 31, '{"ru": "Маргарита", "en": "Margarita", "vi": "Margarita"}',
   '{"ru": "Текила, лайм, апельсиновый ликёр.", "en": "Tequila, lime, orange liqueur."}', 149000, '/img/dishes/bar-margarita.jpg', NULL, 0, 1, 1)
ON CONFLICT(id) DO UPDATE SET category_id = excluded.category_id, sort = excluded.sort, name = excluded.name,
 description = excluded.description, price = excluded.price, photo = excluded.photo, weight = excluded.weight,
 is_kids = excluded.is_kids, is_alcohol = excluded.is_alcohol, active = excluded.active;

INSERT INTO option_groups (id, dish_id, sort, name, min_select, max_select) VALUES
 ('th-kind', 'tea-herbal', 1, '{"ru": "Вкус", "en": "Flavour", "vi": "Flavour"}', 1, 1),
 ('tf-kind', 'tea-fruit', 1, '{"ru": "Вкус", "en": "Flavour", "vi": "Flavour"}', 1, 1);

INSERT INTO options (id, group_id, sort, name, price_delta) VALUES
 ('th-mint', 'th-kind', 1, '{"ru": "Мята-лимон", "en": "Mint-lemon", "vi": "Mint-lemon"}', 0),
 ('th-ginger', 'th-kind', 2, '{"ru": "Имбирь", "en": "Ginger", "vi": "Ginger"}', 0),
 ('th-chamomile', 'th-kind', 3, '{"ru": "Ромашка", "en": "Chamomile", "vi": "Chamomile"}', 0),
 ('tf-mango', 'tf-kind', 1, '{"ru": "Манго-маракуйя", "en": "Mango-passion fruit", "vi": "Mango-passion fruit"}', 0),
 ('tf-berries', 'tf-kind', 2, '{"ru": "Ягоды", "en": "Berries", "vi": "Berries"}', 0),
 ('tf-tropical', 'tf-kind', 3, '{"ru": "Тропический", "en": "Tropical", "vi": "Tropical"}', 0);
