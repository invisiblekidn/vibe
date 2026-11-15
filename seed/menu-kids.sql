-- Актуальный лист «Детское меню» (фото меню от 15.11.2026, заменяет лист от 11.11).
-- Можно выполнять повторно: обновляет блюда и опции, заказы и стоп-лист не трогает.
-- Английский и вьетнамский перевод наш, на листе только русский. seed/menu-vi.json держим в том же виде.

INSERT INTO categories (id, sort, name) VALUES
 ('kids', 7, '{"ru": "Детское меню", "vi": "Thực đơn trẻ em", "en": "Kids menu"}')
ON CONFLICT(id) DO UPDATE SET sort = excluded.sort, name = excluded.name;

DELETE FROM options WHERE group_id IN (SELECT id FROM option_groups WHERE dish_id IN ('kids-cutlets','kids-mac','kids-burger','kids-pelmeni','kids-nuggets','kids-syrniki','kids-veg','kids-porridge','kids-icecream','kids-puree'));
DELETE FROM option_groups WHERE dish_id IN ('kids-cutlets','kids-mac','kids-burger','kids-pelmeni','kids-nuggets','kids-syrniki','kids-veg','kids-porridge','kids-icecream','kids-puree');

INSERT INTO dishes (id, category_id, sort, name, description, price, photo, weight, is_kids, is_alcohol, active) VALUES
 ('kids-cutlets', 'kids', 1, '{"ru": "Куриные котлетки с картофельным пюре", "vi": "Chả gà kèm khoai tây nghiền", "en": "Chicken cutlets with mashed potatoes"}',
   '{"ru": "Нежные куриные котлетки с воздушным пюре.", "vi": "Chả gà mềm với khoai tây nghiền xốp.", "en": "Tender chicken cutlets with fluffy mashed potatoes."}',
   89000, '/img/dishes/kids-cutlets.jpg', NULL, 1, 0, 1),
 ('kids-mac', 'kids', 2, '{"ru": "Макароны с сыром", "vi": "Nui phô mai", "en": "Mac and cheese"}',
   '{"ru": "Любимые макароны в нежном сырном соусе.", "vi": "Nui sốt phô mai béo mịn mà bé nào cũng thích.", "en": "Favourite macaroni in a creamy cheese sauce."}',
   59000, '/img/dishes/kids-mac.jpg', NULL, 1, 0, 1),
 ('kids-burger', 'kids', 3, '{"ru": "Мини-бургер с картофелем фри", "vi": "Burger mini kèm khoai tây chiên", "en": "Mini burger with French fries"}',
   '{"ru": "Мини-бургер с куриной котлетой (из куриного филе), сыром и свежими овощами. Подаётся с картофелем фри.", "vi": "Burger mini nhân chả phi lê gà, phô mai và rau củ tươi. Kèm khoai tây chiên.", "en": "Mini burger with a chicken fillet patty, cheese and fresh vegetables. Served with French fries."}',
   109000, '/img/dishes/kids-burger.jpg', NULL, 1, 0, 1),
 ('kids-pelmeni', 'kids', 4, '{"ru": "Пельмешки", "vi": "Pelmeni nhỏ", "en": "Little pelmeni"}',
   '{"ru": "Домашние пельмешки со сметаной.", "vi": "Sủi cảo nhà làm, ăn kèm kem chua.", "en": "Homemade dumplings with sour cream."}',
   89000, '/img/dishes/kids-pelmeni.jpg', NULL, 1, 0, 1),
 ('kids-nuggets', 'kids', 5, '{"ru": "Куриные наггетсы с картофелем фри", "vi": "Gà viên chiên kèm khoai tây chiên", "en": "Chicken nuggets with French fries"}',
   '{"ru": "Хрустящие куриные наггетсы с картофелем фри и кетчупом.", "vi": "Gà viên chiên giòn với khoai tây chiên và tương cà.", "en": "Crispy chicken nuggets with French fries and ketchup."}',
   89000, '/img/dishes/kids-nuggets.jpg', NULL, 1, 0, 1),
 ('kids-syrniki', 'kids', 6, '{"ru": "Сырники детские", "vi": "Bánh syrniki cho bé", "en": "Kids syrniki"}',
   '{"ru": "Нежные сырники из творога.", "vi": "Bánh phô mai tươi chiên mềm.", "en": "Soft cottage cheese pancakes."}',
   49000, '/img/dishes/kids-syrniki.jpg', '2 шт.', 1, 0, 1),
 ('kids-veg', 'kids', 7, '{"ru": "Овощные палочки с соусом", "vi": "Rau củ que chấm sốt", "en": "Veggie sticks with dip"}',
   '{"ru": "Свежие овощи: огурец, морковь и болгарский перец. Подаются с нежным сливочным соусом.", "vi": "Rau củ tươi: dưa leo, cà rốt và ớt chuông. Ăn kèm sốt kem dịu nhẹ.", "en": "Fresh cucumber, carrot and bell pepper sticks. Served with a mild creamy dip."}',
   39000, '/img/dishes/kids-veg.jpg', NULL, 1, 0, 1),
 ('kids-porridge', 'kids', 8, '{"ru": "Каша детская", "vi": "Cháo cho bé", "en": "Kids porridge"}',
   '{"ru": "На выбор: овсяная на молоке с бананом и арахисовой пастой, рисовая на молоке с фруктами или гречневая на молоке с маслом.", "vi": "Tùy chọn: cháo yến mạch sữa với chuối và bơ đậu phộng, cháo gạo sữa với trái cây hoặc cháo kiều mạch sữa với bơ.", "en": "Your choice: oatmeal with milk, banana and peanut butter; rice porridge with milk and fruit; or buckwheat with milk and butter."}',
   59000, '/img/dishes/kids-porridge.jpg', NULL, 1, 0, 1),
 ('kids-icecream', 'kids', 9, '{"ru": "Мороженое", "vi": "Kem", "en": "Ice cream"}',
   '{"ru": "Два шарика: клубничное, ванильное или шоколадное.", "vi": "Hai viên: dâu, vani hoặc sô-cô-la.", "en": "Two scoops: strawberry, vanilla or chocolate."}',
   39000, '/img/dishes/kids-icecream.jpg', '2 шарика', 1, 0, 1),
 ('kids-puree', 'kids', 10, '{"ru": "Пюрешка с сосиской", "vi": "Khoai tây nghiền kèm xúc xích", "en": "Mashed potatoes with a sausage"}',
   '{"ru": "Воздушное картофельное пюре с аппетитной сосиской.", "vi": "Khoai tây nghiền xốp với xúc xích thơm ngon.", "en": "Fluffy mashed potatoes with a tasty sausage."}',
   89000, '/img/dishes/kids-puree.jpg', NULL, 1, 0, 1)
ON CONFLICT(id) DO UPDATE SET category_id = excluded.category_id, sort = excluded.sort, name = excluded.name,
 description = excluded.description, price = excluded.price, photo = excluded.photo, weight = excluded.weight,
 is_kids = excluded.is_kids, is_alcohol = excluded.is_alcohol, active = excluded.active;

INSERT INTO option_groups (id, dish_id, sort, name, min_select, max_select) VALUES
 ('kp-kind', 'kids-porridge', 1, '{"ru": "Каша на выбор", "vi": "Chọn loại cháo", "en": "Your choice"}', 1, 1),
 ('ki-flavor', 'kids-icecream', 1, '{"ru": "Вкус (1–2 на выбор)", "vi": "Vị (chọn 1–2)", "en": "Flavour (choose 1–2)"}', 1, 2);

INSERT INTO options (id, group_id, sort, name, price_delta) VALUES
 ('kp-oat', 'kp-kind', 1, '{"ru": "Овсяная с бананом и арахисовой пастой", "vi": "Yến mạch với chuối và bơ đậu phộng", "en": "Oatmeal with banana and peanut butter"}', 0),
 ('kp-rice', 'kp-kind', 2, '{"ru": "Рисовая с фруктами", "vi": "Cháo gạo với trái cây", "en": "Rice porridge with fruit"}', 0),
 ('kp-buck', 'kp-kind', 3, '{"ru": "Гречневая с маслом", "vi": "Kiều mạch với bơ", "en": "Buckwheat with butter"}', 0),
 ('ki-straw', 'ki-flavor', 1, '{"ru": "Клубничное", "vi": "Dâu", "en": "Strawberry"}', 0),
 ('ki-van', 'ki-flavor', 2, '{"ru": "Ванильное", "vi": "Vani", "en": "Vanilla"}', 0),
 ('ki-choc', 'ki-flavor', 3, '{"ru": "Шоколадное", "vi": "Sô-cô-la", "en": "Chocolate"}', 0);
