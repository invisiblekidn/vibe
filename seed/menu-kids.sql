-- Лист «Детское меню» (фото меню от 11.11.2026). Английский перевод наш, на листе только русский.
-- Можно выполнять повторно: обновляет блюда и опции, заказы и стоп-лист не трогает.

INSERT INTO categories (id, sort, name) VALUES
 ('kids', 6, '{"ru":"Детское меню","en":"Kids menu","vi":"Kids menu"}')
ON CONFLICT(id) DO UPDATE SET sort = excluded.sort, name = excluded.name;

DELETE FROM options WHERE group_id IN (SELECT id FROM option_groups WHERE dish_id IN
 ('kids-cutlets','kids-mac','kids-burger','kids-pelmeni','kids-nuggets','kids-syrniki','kids-veg','kids-icecream'));
DELETE FROM option_groups WHERE dish_id IN
 ('kids-cutlets','kids-mac','kids-burger','kids-pelmeni','kids-nuggets','kids-syrniki','kids-veg','kids-icecream');

INSERT INTO dishes (id, category_id, sort, name, description, price, photo, weight, is_kids, is_alcohol, active) VALUES
 ('kids-cutlets', 'kids', 1, '{"ru":"Куриные котлетки с картофельным пюре","en":"Chicken cutlets with mashed potatoes","vi":"Chicken cutlets with mashed potatoes"}',
   '{"ru":"Нежные куриные котлетки с воздушным пюре.","en":"Tender chicken cutlets with fluffy mashed potatoes."}',
   89000, '/img/dishes/kids-cutlets.jpg', '280 г', 1, 0, 1),
 ('kids-mac', 'kids', 2, '{"ru":"Макароны с сыром","en":"Mac and cheese","vi":"Mac and cheese"}',
   '{"ru":"Любимые макароны в нежном сырном соусе.","en":"Favourite macaroni in a creamy cheese sauce."}',
   59000, '/img/dishes/kids-mac.jpg', '250 г', 1, 0, 1),
 ('kids-burger', 'kids', 3, '{"ru":"Мини-бургер с картофелем фри","en":"Mini burger with French fries","vi":"Mini burger with French fries"}',
   '{"ru":"Бургер с куриной котлетой, сыром и свежими овощами. Подаётся с картофелем фри.","en":"Burger with a chicken patty, cheese and fresh vegetables. Served with French fries."}',
   109000, '/img/dishes/kids-burger.jpg', '300 г', 1, 0, 1),
 ('kids-pelmeni', 'kids', 4, '{"ru":"Пельмешки","en":"Little pelmeni","vi":"Little pelmeni"}',
   '{"ru":"Домашние пельмешки со сметаной.","en":"Homemade dumplings with sour cream."}',
   89000, '/img/dishes/kids-pelmeni.jpg', '250 г', 1, 0, 1),
 ('kids-nuggets', 'kids', 5, '{"ru":"Куриные наггетсы с картофелем фри","en":"Chicken nuggets with French fries","vi":"Chicken nuggets with French fries"}',
   '{"ru":"Хрустящие куриные наггетсы с картофелем фри и кетчупом.","en":"Crispy chicken nuggets with French fries and ketchup."}',
   89000, '/img/dishes/kids-nuggets.jpg', '250 г', 1, 0, 1),
 ('kids-syrniki', 'kids', 6, '{"ru":"Сырники детские","en":"Kids syrniki","vi":"Kids syrniki"}',
   '{"ru":"Нежные сырники из творога.","en":"Soft cottage cheese pancakes."}',
   49000, '/img/dishes/kids-syrniki.jpg', '2 шт.', 1, 0, 1),
 ('kids-veg', 'kids', 7, '{"ru":"Овощные палочки с соусом","en":"Veggie sticks with dip","vi":"Veggie sticks with dip"}',
   '{"ru":"Свежие овощи с нежным сливочным соусом.","en":"Fresh vegetables with a mild creamy dip."}',
   39000, '/img/dishes/kids-veg.jpg', '160 г', 1, 0, 1),
 ('kids-icecream', 'kids', 8, '{"ru":"Мороженое","en":"Ice cream","vi":"Ice cream"}',
   '{"ru":"Два шарика: клубничное, ванильное или шоколадное.","en":"Two scoops: strawberry, vanilla or chocolate."}',
   39000, '/img/dishes/kids-icecream.jpg', '2 шарика / 100 г', 1, 0, 1)
ON CONFLICT(id) DO UPDATE SET category_id = excluded.category_id, sort = excluded.sort, name = excluded.name,
 description = excluded.description, price = excluded.price, photo = excluded.photo, weight = excluded.weight,
 is_kids = excluded.is_kids, is_alcohol = excluded.is_alcohol, active = excluded.active;

INSERT INTO option_groups (id, dish_id, sort, name, min_select, max_select) VALUES
 ('ki-flavor', 'kids-icecream', 1, '{"ru":"Вкус (1–2 на выбор)","en":"Flavour (choose 1–2)","vi":"Flavour (choose 1–2)"}', 1, 2);

INSERT INTO options (id, group_id, sort, name, price_delta) VALUES
 ('ki-straw', 'ki-flavor', 1, '{"ru":"Клубничное","en":"Strawberry","vi":"Strawberry"}', 0),
 ('ki-van',   'ki-flavor', 2, '{"ru":"Ванильное","en":"Vanilla","vi":"Vanilla"}', 0),
 ('ki-choc',  'ki-flavor', 3, '{"ru":"Шоколадное","en":"Chocolate","vi":"Chocolate"}', 0);
