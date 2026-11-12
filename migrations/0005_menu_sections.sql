-- Группы внутри раздела меню (например, в «Баре»: кофе и чай, соки и смузи, прохладительные, алкоголь).
-- Гость сначала видит плитки групп, нажимает — и попадает в список напитков группы.
-- Раздел без групп показывается как раньше, сплошным списком.
CREATE TABLE menu_sections (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id),
  sort INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,                               -- {"ru": "...", "vi": "...", "en": "..."}
  photo TEXT                                        -- картинка на плитке группы
);

ALTER TABLE dishes ADD COLUMN section_id TEXT REFERENCES menu_sections(id);
