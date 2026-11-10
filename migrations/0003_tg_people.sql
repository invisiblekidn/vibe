-- Участники группы сотрудников, которых видел бот: по ним находим Telegram-id для списка TG_STAFF.
-- Telegram не даёт боту узнать id по @имени, поэтому запоминаем вступивших и написавших в группе.
CREATE TABLE tg_people (
  user_id INTEGER PRIMARY KEY,
  username TEXT,
  name TEXT,
  seen_at TEXT NOT NULL
);
