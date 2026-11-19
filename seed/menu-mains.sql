-- Актуальный лист «Горячие блюда / Main Dishes» (фото меню от 17.11.2026).
-- Можно выполнять повторно: обновляет блюда и опции, заказы и стоп-лист не трогает.
-- Блюда «Горячего», которых нет на листе, скрываются (active = 0), а не удаляются: на них ссылаются прошлые заказы.
-- «Любой гарнир можно заменить на гречку, рис или макароны» — обязательный выбор гарнира (по умолчанию первый), без доплаты.
-- Вьетнамский текст здесь же; seed/menu-vi.json держим в том же виде.

INSERT INTO categories (id, sort, name) VALUES
 ('mains', 6, '{"ru": "Горячее", "vi": "Món chính", "en": "Main dishes"}')
ON CONFLICT(id) DO UPDATE SET sort = excluded.sort, name = excluded.name;

DELETE FROM options WHERE group_id IN (SELECT id FROM option_groups WHERE dish_id IN ('stroganoff','chicken-cutlets','meat-cutlets','kiev','stuffed-peppers','pelmeni','burger','pasta-chicken','pasta-shrimp','carbonara','bolognese','pasta-salmon','mac-cheese'));
DELETE FROM option_groups WHERE dish_id IN ('stroganoff','chicken-cutlets','meat-cutlets','kiev','stuffed-peppers','pelmeni','burger','pasta-chicken','pasta-shrimp','carbonara','bolognese','pasta-salmon','mac-cheese');

INSERT INTO dishes (id, category_id, sort, name, description, price, photo, weight, is_kids, is_alcohol, active) VALUES
 ('stroganoff', 'mains', 1, '{"ru": "Бефстроганов из курицы с картофельным пюре", "vi": "Gà sốt Stroganoff với khoai tây nghiền", "en": "Chicken Stroganoff"}',
   '{"ru": "Нежное куриное филе в сливочном соусе с грибами, подаётся с картофельным пюре. Гарнир можно заменить на гречку, рис или макароны.", "vi": "Phi lê gà mềm sốt kem nấm, ăn kèm khoai tây nghiền. Có thể đổi món ăn kèm sang kiều mạch, cơm hoặc mì ống.", "en": "Tender chicken fillet in a creamy mushroom sauce, served with mashed potatoes. The side dish can be replaced with buckwheat, rice or pasta."}',
   139000, '/img/dishes/mn-stroganoff.jpg', NULL, 0, 0, 1),
 ('chicken-cutlets', 'mains', 2, '{"ru": "Куриные котлеты с картофельным пюре", "vi": "Chả gà với khoai tây nghiền", "en": "Chicken Cutlets"}',
   '{"ru": "Сочные куриные котлеты, подаются с нежным картофельным пюре и зеленью. Гарнир можно заменить на гречку, рис или макароны.", "vi": "Chả gà mọng nước, ăn kèm khoai tây nghiền mịn và rau thơm. Có thể đổi món ăn kèm sang kiều mạch, cơm hoặc mì ống.", "en": "Juicy chicken cutlets served with mashed potatoes. The side dish can be replaced with buckwheat, rice or pasta."}',
   139000, '/img/dishes/mn-chicken-cutlets.jpg', NULL, 0, 0, 1),
 ('meat-cutlets', 'mains', 3, '{"ru": "Мясные котлеты с картофельным пюре", "vi": "Chả thịt với khoai tây nghiền", "en": "Meat Cutlets"}',
   '{"ru": "Сочные котлеты из говядины и свинины, подаются с нежным картофельным пюре и зеленью. Гарнир можно заменить на гречку, рис или макароны.", "vi": "Chả bò và heo mọng nước, ăn kèm khoai tây nghiền mịn và rau thơm. Có thể đổi món ăn kèm sang kiều mạch, cơm hoặc mì ống.", "en": "Juicy beef and pork cutlets served with mashed potatoes. The side dish can be replaced with buckwheat, rice or pasta."}',
   169000, '/img/dishes/mn-meat-cutlets.jpg', NULL, 0, 0, 1),
 ('kiev', 'mains', 4, '{"ru": "Котлета по-киевски с картофельным пюре", "vi": "Gà cuộn bơ kiểu Kiev với khoai tây nghiền", "en": "Chicken Kiev"}',
   '{"ru": "Нежное куриное филе с ароматным сливочным маслом и зеленью в хрустящей панировке, подаётся с картофельным пюре. Гарнир можно заменить на гречку, рис или макароны.", "vi": "Phi lê gà cuộn bơ thơm và rau thơm trong lớp vỏ giòn, ăn kèm khoai tây nghiền. Có thể đổi món ăn kèm sang kiều mạch, cơm hoặc mì ống.", "en": "Chicken fillet with aromatic butter and herbs in a crispy coating, served with mashed potatoes. The side dish can be replaced with buckwheat, rice or pasta."}',
   179000, '/img/dishes/mn-kiev.jpg', NULL, 0, 0, 1),
 ('stuffed-peppers', 'mains', 5, '{"ru": "Фаршированные перцы с картофельным пюре", "vi": "Ớt chuông nhồi thịt với khoai tây nghiền", "en": "Stuffed Peppers"}',
   '{"ru": "Сладкий перец, фаршированный мясом и рисом, в нежном сливочном соусе, подаётся с картофельным пюре. Гарнир можно заменить на гречку, рис или макароны.", "vi": "Ớt chuông nhồi thịt và cơm trong sốt kem, ăn kèm khoai tây nghiền. Có thể đổi món ăn kèm sang kiều mạch, cơm hoặc mì ống.", "en": "Bell peppers stuffed with meat and rice, in a creamy sauce, served with mashed potatoes. The side dish can be replaced with buckwheat, rice or pasta."}',
   129000, '/img/dishes/mn-peppers.jpg', NULL, 0, 0, 1),
 ('pelmeni', 'mains', 6, '{"ru": "Пельмени", "vi": "Bánh pelmeni", "en": "Pelmeni"}',
   '{"ru": "Домашние пельмени с мясной начинкой, подаются со сметаной.", "vi": "Bánh pelmeni nhà làm nhân thịt, ăn kèm kem chua.", "en": "Homemade dumplings with meat filling, served with sour cream."}',
   139000, '/img/dishes/mn-pelmeni.jpg', NULL, 0, 0, 1),
 ('burger', 'mains', 7, '{"ru": "Бургер VIBE", "vi": "Burger VIBE", "en": "VIBE Burger"}',
   '{"ru": "Сочная котлета, сыр, свежие овощи, фирменный соус, подаётся с картофелем фри. Гарнир можно заменить на гречку, рис или макароны.", "vi": "Thịt bò mọng nước, phô mai, rau tươi và sốt đặc biệt, ăn kèm khoai tây chiên. Có thể đổi món ăn kèm sang kiều mạch, cơm hoặc mì ống.", "en": "Juicy patty, cheese, fresh vegetables and signature sauce, served with French fries. The side dish can be replaced with buckwheat, rice or pasta."}',
   169000, '/img/dishes/mn-burger.jpg', NULL, 0, 0, 1),
 ('pasta-chicken', 'mains', 8, '{"ru": "Паста с курицей и грибами", "vi": "Mì Ý gà và nấm", "en": "Pasta with Chicken and Mushrooms"}',
   '{"ru": "Паста в нежном сливочном соусе с куриным филе и грибами, с пармезаном.", "vi": "Mì Ý sốt kem với phi lê gà và nấm, rắc phô mai Parmesan.", "en": "Pasta in a creamy sauce with chicken and mushrooms, topped with Parmesan."}',
   129000, '/img/dishes/mn-pasta-chicken.jpg', NULL, 0, 0, 1),
 ('pasta-shrimp', 'mains', 9, '{"ru": "Паста с креветками", "vi": "Mì Ý tôm", "en": "Pasta with Shrimp"}',
   '{"ru": "Паста в сливочном соусе с креветками, чесноком и пармезаном.", "vi": "Mì Ý sốt kem với tôm, tỏi và phô mai Parmesan.", "en": "Pasta in a creamy sauce with shrimp, garlic and Parmesan."}',
   149000, '/img/dishes/mn-pasta-shrimp.jpg', NULL, 0, 0, 1),
 ('carbonara', 'mains', 10, '{"ru": "Карбонара", "vi": "Mì Ý Carbonara", "en": "Carbonara"}',
   '{"ru": "Классическая паста с беконом в сливочном соусе, с пармезаном.", "vi": "Mì Ý truyền thống với thịt xông khói sốt kem, rắc phô mai Parmesan.", "en": "Classic pasta with bacon in a creamy sauce, topped with Parmesan."}',
   139000, '/img/dishes/mn-carbonara.jpg', NULL, 0, 0, 1),
 ('bolognese', 'mains', 11, '{"ru": "Болоньезе", "vi": "Mì Ý Bolognese", "en": "Bolognese"}',
   '{"ru": "Паста с мясным соусом болоньезе, томатами и пармезаном.", "vi": "Mì Ý với sốt thịt Bolognese đậm đà, cà chua và phô mai Parmesan.", "en": "Pasta with a hearty meat Bolognese sauce, tomatoes and Parmesan."}',
   139000, '/img/dishes/mn-bolognese.jpg', NULL, 0, 0, 1),
 ('pasta-salmon', 'mains', 12, '{"ru": "Паста с лососем в сливочном соусе", "vi": "Mì Ý cá hồi sốt kem", "en": "Pasta with Salmon"}',
   '{"ru": "Нежная паста с лососем в сливочном соусе, с пармезаном и свежей зеленью.", "vi": "Mì Ý với cá hồi sốt kem, rắc phô mai Parmesan và rau thơm tươi.", "en": "Pasta with salmon in a creamy sauce, topped with Parmesan and fresh herbs."}',
   149000, '/img/dishes/mn-pasta-salmon.jpg', NULL, 0, 0, 1),
 ('mac-cheese', 'mains', 13, '{"ru": "Макароны с сыром", "vi": "Mì ống phô mai", "en": "Mac and Cheese"}',
   '{"ru": "Любимые макароны в нежном сырном соусе.", "vi": "Mì ống yêu thích trong sốt phô mai béo ngậy.", "en": "Favorite macaroni in a creamy cheese sauce."}',
   79000, '/img/dishes/mn-mac.jpg', NULL, 0, 0, 1)
ON CONFLICT(id) DO UPDATE SET category_id = excluded.category_id, sort = excluded.sort, name = excluded.name,
 description = excluded.description, price = excluded.price, photo = excluded.photo, weight = excluded.weight,
 is_kids = excluded.is_kids, is_alcohol = excluded.is_alcohol, active = excluded.active;

-- Остальное, что раньше было в «Горячем», скрываем.
UPDATE dishes SET active = 0 WHERE category_id = 'mains' AND id NOT IN ('stroganoff','chicken-cutlets','meat-cutlets','kiev','stuffed-peppers','pelmeni','burger','pasta-chicken','pasta-shrimp','carbonara','bolognese','pasta-salmon','mac-cheese');

INSERT INTO option_groups (id, dish_id, sort, name, min_select, max_select) VALUES
 ('stroganoff-side', 'stroganoff', 1, '{"ru": "Гарнир", "vi": "Món ăn kèm", "en": "Side dish"}', 1, 1),
 ('chicken-cutlets-side', 'chicken-cutlets', 1, '{"ru": "Гарнир", "vi": "Món ăn kèm", "en": "Side dish"}', 1, 1),
 ('meat-cutlets-side', 'meat-cutlets', 1, '{"ru": "Гарнир", "vi": "Món ăn kèm", "en": "Side dish"}', 1, 1),
 ('kiev-side', 'kiev', 1, '{"ru": "Гарнир", "vi": "Món ăn kèm", "en": "Side dish"}', 1, 1),
 ('stuffed-peppers-side', 'stuffed-peppers', 1, '{"ru": "Гарнир", "vi": "Món ăn kèm", "en": "Side dish"}', 1, 1),
 ('burger-side', 'burger', 1, '{"ru": "Гарнир", "vi": "Món ăn kèm", "en": "Side dish"}', 1, 1);

INSERT INTO options (id, group_id, sort, name, price_delta) VALUES
 ('stroganoff-side-mash', 'stroganoff-side', 1, '{"ru": "Картофельное пюре", "vi": "Khoai tây nghiền", "en": "Mashed potatoes"}', 0),
 ('stroganoff-side-buckwheat', 'stroganoff-side', 2, '{"ru": "Гречка", "vi": "Kiều mạch", "en": "Buckwheat"}', 0),
 ('stroganoff-side-rice', 'stroganoff-side', 3, '{"ru": "Рис", "vi": "Cơm", "en": "Rice"}', 0),
 ('stroganoff-side-pasta', 'stroganoff-side', 4, '{"ru": "Макароны", "vi": "Mì ống", "en": "Pasta"}', 0),
 ('chicken-cutlets-side-mash', 'chicken-cutlets-side', 1, '{"ru": "Картофельное пюре", "vi": "Khoai tây nghiền", "en": "Mashed potatoes"}', 0),
 ('chicken-cutlets-side-buckwheat', 'chicken-cutlets-side', 2, '{"ru": "Гречка", "vi": "Kiều mạch", "en": "Buckwheat"}', 0),
 ('chicken-cutlets-side-rice', 'chicken-cutlets-side', 3, '{"ru": "Рис", "vi": "Cơm", "en": "Rice"}', 0),
 ('chicken-cutlets-side-pasta', 'chicken-cutlets-side', 4, '{"ru": "Макароны", "vi": "Mì ống", "en": "Pasta"}', 0),
 ('meat-cutlets-side-mash', 'meat-cutlets-side', 1, '{"ru": "Картофельное пюре", "vi": "Khoai tây nghiền", "en": "Mashed potatoes"}', 0),
 ('meat-cutlets-side-buckwheat', 'meat-cutlets-side', 2, '{"ru": "Гречка", "vi": "Kiều mạch", "en": "Buckwheat"}', 0),
 ('meat-cutlets-side-rice', 'meat-cutlets-side', 3, '{"ru": "Рис", "vi": "Cơm", "en": "Rice"}', 0),
 ('meat-cutlets-side-pasta', 'meat-cutlets-side', 4, '{"ru": "Макароны", "vi": "Mì ống", "en": "Pasta"}', 0),
 ('kiev-side-mash', 'kiev-side', 1, '{"ru": "Картофельное пюре", "vi": "Khoai tây nghiền", "en": "Mashed potatoes"}', 0),
 ('kiev-side-buckwheat', 'kiev-side', 2, '{"ru": "Гречка", "vi": "Kiều mạch", "en": "Buckwheat"}', 0),
 ('kiev-side-rice', 'kiev-side', 3, '{"ru": "Рис", "vi": "Cơm", "en": "Rice"}', 0),
 ('kiev-side-pasta', 'kiev-side', 4, '{"ru": "Макароны", "vi": "Mì ống", "en": "Pasta"}', 0),
 ('stuffed-peppers-side-mash', 'stuffed-peppers-side', 1, '{"ru": "Картофельное пюре", "vi": "Khoai tây nghiền", "en": "Mashed potatoes"}', 0),
 ('stuffed-peppers-side-buckwheat', 'stuffed-peppers-side', 2, '{"ru": "Гречка", "vi": "Kiều mạch", "en": "Buckwheat"}', 0),
 ('stuffed-peppers-side-rice', 'stuffed-peppers-side', 3, '{"ru": "Рис", "vi": "Cơm", "en": "Rice"}', 0),
 ('stuffed-peppers-side-pasta', 'stuffed-peppers-side', 4, '{"ru": "Макароны", "vi": "Mì ống", "en": "Pasta"}', 0),
 ('burger-side-fries', 'burger-side', 1, '{"ru": "Картофель фри", "vi": "Khoai tây chiên", "en": "French fries"}', 0),
 ('burger-side-buckwheat', 'burger-side', 2, '{"ru": "Гречка", "vi": "Kiều mạch", "en": "Buckwheat"}', 0),
 ('burger-side-rice', 'burger-side', 3, '{"ru": "Рис", "vi": "Cơm", "en": "Rice"}', 0),
 ('burger-side-pasta', 'burger-side', 4, '{"ru": "Макароны", "vi": "Mì ống", "en": "Pasta"}', 0);
