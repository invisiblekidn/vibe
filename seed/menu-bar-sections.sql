-- Группы в разделе «Бар» (просьба Aleks 12.11.2026). Выполнять ПОСЛЕ seed/menu-bar.sql.
-- Можно выполнять повторно: обновляет группы и раскладку напитков, заказы и стоп-лист не трогает.
-- Алкоголь — только к визиту и в зале (правило из самих напитков, is_alcohol).

INSERT INTO menu_sections (id, category_id, sort, name, photo) VALUES
 ('bar-hot',     'bar', 1, '{"ru": "Кофе, чай, какао", "vi": "Cà phê, trà, ca cao", "en": "Coffee, tea & cocoa"}', '/img/dishes/bar-coffee.jpg'),
 ('bar-juice',   'bar', 2, '{"ru": "Соки и смузи", "vi": "Nước ép & sinh tố", "en": "Juices & smoothies"}',          '/img/dishes/bar-smoothie.jpg'),
 ('bar-soft',    'bar', 3, '{"ru": "Прохладительные напитки", "vi": "Nước giải khát", "en": "Soft drinks"}',          '/img/dishes/bar-soft.jpg'),
 ('bar-alcohol', 'bar', 4, '{"ru": "Алкоголь", "vi": "Đồ uống có cồn", "en": "Alcohol"}',                            '/img/dishes/bar-mojito.jpg')
ON CONFLICT(id) DO UPDATE SET category_id = excluded.category_id, sort = excluded.sort, name = excluded.name, photo = excluded.photo;

UPDATE dishes SET section_id = 'bar-hot' WHERE id IN
 ('espresso','americano','cappuccino','latte','affogato','viet-coffee','egg-coffee','cocoa','tea-black','tea-green','tea-herbal','tea-fruit','tea-bag');
UPDATE dishes SET section_id = 'bar-juice' WHERE id IN
 ('juice-orange','juice-pineapple','juice-watermelon','smoothie-berry','smoothie-mango','smoothie-avocado');
UPDATE dishes SET section_id = 'bar-soft' WHERE id IN ('cola','sprite','tonic','water');
-- Весь алкоголь бара (шоты, коктейли и любой новый алкогольный напиток) — в группу «Алкоголь».
UPDATE dishes SET section_id = 'bar-alcohol' WHERE category_id = 'bar' AND is_alcohol = 1;
