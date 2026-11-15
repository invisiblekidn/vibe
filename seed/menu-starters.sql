-- Актуальный лист «Закуски / Starters» (фото меню от 15.11.2026).
-- Можно выполнять повторно: обновляет блюда и опции, заказы и стоп-лист не трогает.
-- Драники и оладьи из цукини — те же блюда, что раньше были в завтраках: переносим в закуски и снова показываем.
-- Вьетнамский текст здесь же; seed/menu-vi.json держим в том же виде.

INSERT INTO categories (id, sort, name) VALUES
 ('starters', 3, '{"ru": "Закуски", "vi": "Món khai vị", "en": "Starters"}')
ON CONFLICT(id) DO UPDATE SET sort = excluded.sort, name = excluded.name;

DELETE FROM options WHERE group_id IN (SELECT id FROM option_groups WHERE dish_id IN ('bruschetta-salmon','bruschetta-tomato','shrimps-garlic','wings','cheese-sticks','potato-wedges','croutons','fries','nuggets','draniki','zucchini-fritters'));
DELETE FROM option_groups WHERE dish_id IN ('bruschetta-salmon','bruschetta-tomato','shrimps-garlic','wings','cheese-sticks','potato-wedges','croutons','fries','nuggets','draniki','zucchini-fritters');

INSERT INTO dishes (id, category_id, sort, name, description, price, photo, weight, is_kids, is_alcohol, active) VALUES
 ('bruschetta-salmon', 'starters', 1, '{"ru": "Брускетта с лососем", "vi": "Bruschetta cá hồi", "en": "Bruschetta with Salmon"}',
   '{"ru": "Хрустящий багет, сливочный сыр, слабосолёный лосось, свежая зелень.", "vi": "Bánh mì baguette giòn, phô mai kem, cá hồi muối nhạt, rau thơm tươi.", "en": "Crispy baguette, cream cheese, lightly salted salmon, fresh herbs."}',
   109000, '/img/dishes/st-bruschetta-salmon.jpg', NULL, 0, 0, 1),
 ('bruschetta-tomato', 'starters', 2, '{"ru": "Брускетта с томатами", "vi": "Bruschetta cà chua", "en": "Bruschetta with Tomatoes"}',
   '{"ru": "Хрустящий багет, томаты, чеснок, соус, пармезан, свежий базилик.", "vi": "Bánh mì baguette giòn, cà chua, tỏi, sốt, phô mai Parmesan, húng quế tươi.", "en": "Crispy baguette, tomatoes, garlic, sauce, Parmesan, fresh basil."}',
   69000, '/img/dishes/st-bruschetta-tomato.jpg', NULL, 0, 0, 1),
 ('shrimps-garlic', 'starters', 3, '{"ru": "Креветки в чесночном масле", "vi": "Tôm sốt bơ tỏi", "en": "Shrimps in Garlic Butter"}',
   '{"ru": "Шесть сочных креветок, обжаренных в ароматном чесночном масле со свежей зеленью. Подаются с двумя кусочками багета.", "vi": "Sáu con tôm mọng nước xào bơ tỏi thơm với rau thơm tươi. Ăn kèm hai lát bánh mì baguette.", "en": "Six juicy shrimps sautéed in aromatic garlic butter with fresh herbs. Served with two slices of baguette."}',
   149000, '/img/dishes/st-shrimps.jpg', '6 шт.', 0, 0, 1),
 ('wings', 'starters', 4, '{"ru": "Крылышки VIBE", "vi": "Cánh gà VIBE", "en": "VIBE Wings"}',
   '{"ru": "Хрустящие куриные крылышки в фирменном маринаде, обжаренные до золотистой корочки. Соус на выбор.", "vi": "Cánh gà giòn tẩm ướp theo công thức riêng, chiên vàng giòn. Sốt tùy chọn.", "en": "Crispy chicken wings in our signature marinade, fried until golden and crunchy. Sauce of your choice."}',
   119000, '/img/dishes/st-wings.jpg', NULL, 0, 0, 1),
 ('cheese-sticks', 'starters', 5, '{"ru": "Сырные палочки", "vi": "Phô mai que", "en": "Cheese Sticks"}',
   '{"ru": "Хит продаж! Пять хрустящих сырных палочек с тягучим сыром, подаются с соусом на выбор.", "vi": "Món bán chạy! Năm que phô mai giòn với nhân phô mai kéo sợi, ăn kèm sốt tùy chọn.", "en": "Best seller! Five crispy cheese sticks with melted cheese, served with a sauce of your choice."}',
   109000, '/img/dishes/st-cheese-sticks.jpg', '5 шт.', 0, 0, 1),
 ('potato-wedges', 'starters', 6, '{"ru": "Картофель по-деревенски VIBE", "vi": "Khoai tây kiểu đồng quê VIBE", "en": "VIBE Country-Style Potatoes"}',
   '{"ru": "Золотистый картофель с травами и чесноком, подаётся с соусом на выбор.", "vi": "Khoai tây vàng giòn với thảo mộc và tỏi, ăn kèm sốt tùy chọn.", "en": "Golden potato wedges with herbs and garlic, served with a sauce of your choice."}',
   69000, '/img/dishes/st-potato-wedges.jpg', NULL, 0, 0, 1),
 ('croutons', 'starters', 7, '{"ru": "Чесночные гренки из бородинского хлеба", "vi": "Bánh mì đen Borodinsky nướng tỏi", "en": "Garlic Croutons (Borodinsky Bread)"}',
   '{"ru": "Пять ржаных гренок из бородинского хлеба с чесноком, зеленью и пармезаном, подаются с соусом на выбор.", "vi": "Năm lát bánh mì đen Borodinsky nướng với tỏi, rau thơm và phô mai Parmesan, ăn kèm sốt tùy chọn.", "en": "Five rye croutons of Borodinsky bread with garlic, fresh herbs and Parmesan, served with a sauce of your choice."}',
   79000, '/img/dishes/st-croutons.jpg', '5 шт.', 0, 0, 1),
 ('fries', 'starters', 8, '{"ru": "Картофель фри", "vi": "Khoai tây chiên", "en": "French Fries"}',
   '{"ru": "Классический хрустящий картофель фри, подаётся с кетчупом.", "vi": "Khoai tây chiên giòn truyền thống, ăn kèm tương cà.", "en": "Classic crispy French fries, served with ketchup."}',
   59000, '/img/dishes/st-fries.jpg', NULL, 0, 0, 1),
 ('nuggets', 'starters', 9, '{"ru": "Наггетсы", "vi": "Gà viên chiên", "en": "Chicken Nuggets"}',
   '{"ru": "Сочные куриные наггетсы в хрустящей панировке, подаются с соусом на выбор.", "vi": "Gà viên mọng nước trong lớp áo giòn, ăn kèm sốt tùy chọn.", "en": "Juicy chicken nuggets in a crispy coating, served with a sauce of your choice."}',
   109000, '/img/dishes/st-nuggets.jpg', '6 шт.', 0, 0, 1),
 ('draniki', 'starters', 10, '{"ru": "Картофельные драники", "vi": "Bánh khoai tây draniki", "en": "Potato Pancakes"}',
   '{"ru": "Три румяных драника, подаются с листом салата, огурцом, помидором и сметаной.", "vi": "Ba bánh khoai tây chiên vàng, ăn kèm xà lách, dưa leo, cà chua và kem chua.", "en": "Three crispy potato pancakes served with lettuce, cucumber, tomato and sour cream."}',
   99000, '/img/dishes/draniki.jpg', '3 шт.', 0, 0, 1),
 ('zucchini-fritters', 'starters', 11, '{"ru": "Оладьи из цукини", "vi": "Bánh bí ngòi", "en": "Zucchini Fritters"}',
   '{"ru": "Три нежных оладьи из цукини, подаются с листом салата, огурцом, помидором и чесночным соусом.", "vi": "Ba bánh bí ngòi mềm, ăn kèm xà lách, dưa leo, cà chua và sốt tỏi.", "en": "Three tender zucchini fritters served with lettuce, cucumber, tomato and garlic sauce."}',
   99000, '/img/dishes/zucchini.jpg', '3 шт.', 0, 0, 1)
ON CONFLICT(id) DO UPDATE SET category_id = excluded.category_id, sort = excluded.sort, name = excluded.name,
 description = excluded.description, price = excluded.price, photo = excluded.photo, weight = excluded.weight,
 is_kids = excluded.is_kids, is_alcohol = excluded.is_alcohol, active = excluded.active;

-- «Дополнительно / Add-ons» с листа: соус +10 000, бекон +30 000, пармезан +20 000 — ко всем закускам, кроме брускетт и креветок.
INSERT INTO option_groups (id, dish_id, sort, name, min_select, max_select) VALUES
 ('wings-add', 'wings', 1, '{"ru": "Дополнительно", "vi": "Thêm", "en": "Add-ons"}', 0, 3),
 ('cheese-sticks-add', 'cheese-sticks', 1, '{"ru": "Дополнительно", "vi": "Thêm", "en": "Add-ons"}', 0, 3),
 ('potato-wedges-add', 'potato-wedges', 1, '{"ru": "Дополнительно", "vi": "Thêm", "en": "Add-ons"}', 0, 3),
 ('croutons-add', 'croutons', 1, '{"ru": "Дополнительно", "vi": "Thêm", "en": "Add-ons"}', 0, 3),
 ('fries-add', 'fries', 1, '{"ru": "Дополнительно", "vi": "Thêm", "en": "Add-ons"}', 0, 3),
 ('nuggets-add', 'nuggets', 1, '{"ru": "Дополнительно", "vi": "Thêm", "en": "Add-ons"}', 0, 3),
 ('draniki-add', 'draniki', 1, '{"ru": "Дополнительно", "vi": "Thêm", "en": "Add-ons"}', 0, 3),
 ('zucchini-fritters-add', 'zucchini-fritters', 1, '{"ru": "Дополнительно", "vi": "Thêm", "en": "Add-ons"}', 0, 3);

INSERT INTO options (id, group_id, sort, name, price_delta) VALUES
 ('wings-sauce', 'wings-add', 1, '{"ru": "Ещё соус", "vi": "Thêm sốt", "en": "Extra sauce"}', 10000),
 ('wings-bacon', 'wings-add', 2, '{"ru": "Бекон", "vi": "Thịt xông khói", "en": "Bacon"}', 30000),
 ('wings-parm', 'wings-add', 3, '{"ru": "Сыр пармезан", "vi": "Phô mai Parmesan", "en": "Parmesan cheese"}', 20000),
 ('cheese-sticks-sauce', 'cheese-sticks-add', 1, '{"ru": "Ещё соус", "vi": "Thêm sốt", "en": "Extra sauce"}', 10000),
 ('cheese-sticks-bacon', 'cheese-sticks-add', 2, '{"ru": "Бекон", "vi": "Thịt xông khói", "en": "Bacon"}', 30000),
 ('cheese-sticks-parm', 'cheese-sticks-add', 3, '{"ru": "Сыр пармезан", "vi": "Phô mai Parmesan", "en": "Parmesan cheese"}', 20000),
 ('potato-wedges-sauce', 'potato-wedges-add', 1, '{"ru": "Ещё соус", "vi": "Thêm sốt", "en": "Extra sauce"}', 10000),
 ('potato-wedges-bacon', 'potato-wedges-add', 2, '{"ru": "Бекон", "vi": "Thịt xông khói", "en": "Bacon"}', 30000),
 ('potato-wedges-parm', 'potato-wedges-add', 3, '{"ru": "Сыр пармезан", "vi": "Phô mai Parmesan", "en": "Parmesan cheese"}', 20000),
 ('croutons-sauce', 'croutons-add', 1, '{"ru": "Ещё соус", "vi": "Thêm sốt", "en": "Extra sauce"}', 10000),
 ('croutons-bacon', 'croutons-add', 2, '{"ru": "Бекон", "vi": "Thịt xông khói", "en": "Bacon"}', 30000),
 ('croutons-parm', 'croutons-add', 3, '{"ru": "Сыр пармезан", "vi": "Phô mai Parmesan", "en": "Parmesan cheese"}', 20000),
 ('fries-sauce', 'fries-add', 1, '{"ru": "Ещё соус", "vi": "Thêm sốt", "en": "Extra sauce"}', 10000),
 ('fries-bacon', 'fries-add', 2, '{"ru": "Бекон", "vi": "Thịt xông khói", "en": "Bacon"}', 30000),
 ('fries-parm', 'fries-add', 3, '{"ru": "Сыр пармезан", "vi": "Phô mai Parmesan", "en": "Parmesan cheese"}', 20000),
 ('nuggets-sauce', 'nuggets-add', 1, '{"ru": "Ещё соус", "vi": "Thêm sốt", "en": "Extra sauce"}', 10000),
 ('nuggets-bacon', 'nuggets-add', 2, '{"ru": "Бекон", "vi": "Thịt xông khói", "en": "Bacon"}', 30000),
 ('nuggets-parm', 'nuggets-add', 3, '{"ru": "Сыр пармезан", "vi": "Phô mai Parmesan", "en": "Parmesan cheese"}', 20000),
 ('draniki-sauce', 'draniki-add', 1, '{"ru": "Ещё соус", "vi": "Thêm sốt", "en": "Extra sauce"}', 10000),
 ('draniki-bacon', 'draniki-add', 2, '{"ru": "Бекон", "vi": "Thịt xông khói", "en": "Bacon"}', 30000),
 ('draniki-parm', 'draniki-add', 3, '{"ru": "Сыр пармезан", "vi": "Phô mai Parmesan", "en": "Parmesan cheese"}', 20000),
 ('zucchini-fritters-sauce', 'zucchini-fritters-add', 1, '{"ru": "Ещё соус", "vi": "Thêm sốt", "en": "Extra sauce"}', 10000),
 ('zucchini-fritters-bacon', 'zucchini-fritters-add', 2, '{"ru": "Бекон", "vi": "Thịt xông khói", "en": "Bacon"}', 30000),
 ('zucchini-fritters-parm', 'zucchini-fritters-add', 3, '{"ru": "Сыр пармезан", "vi": "Phô mai Parmesan", "en": "Parmesan cheese"}', 20000);
