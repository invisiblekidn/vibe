-- Живая карточка заказа в личном чате с гостем (HTML-виджет Telegram).
-- Сообщение с карточкой: при смене статуса меняем его состояние, а не шлём новое сообщение.
ALTER TABLE orders ADD COLUMN guest_widget_msg_id INTEGER;
-- Запасной вариант, пока Telegram не разрешил боту виджеты: обычное сообщение-карточка, которое бот редактирует.
ALTER TABLE orders ADD COLUMN guest_card_msg_id INTEGER;
