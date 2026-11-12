// Собирает seed/menu-vi.sql из seed/menu-vi.json: дописывает вьетнамский текст ("vi") в названия и описания меню.
// Русский и английский не трогает. Блюдо без строки в JSON останется с английским текстом на месте вьетнамского.
import { readFileSync, writeFileSync } from 'node:fs';

const src = JSON.parse(readFileSync(new URL('../seed/menu-vi.json', import.meta.url), 'utf8'));
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const out = [
  '-- СОБРАНО АВТОМАТИЧЕСКИ из seed/menu-vi.json (node scripts/gen-menu-vi.mjs). Правьте JSON, а не этот файл.',
  '-- Вьетнамские названия и описания. Выполнять после seed.sql и menu-*.sql; заказы не трогает, можно повторять.',
  '',
];
for (const [id, name] of Object.entries(src.categories)) out.push(`UPDATE categories SET name = json_set(name, '$.vi', ${q(name)}) WHERE id = ${q(id)};`);
for (const [id, [name, desc]] of Object.entries(src.dishes)) {
  out.push(`UPDATE dishes SET name = json_set(name, '$.vi', ${q(name)})${desc ? `, description = json_set(description, '$.vi', ${q(desc)})` : ''} WHERE id = ${q(id)};`);
}
for (const [id, name] of Object.entries(src.groups)) out.push(`UPDATE option_groups SET name = json_set(name, '$.vi', ${q(name)}) WHERE id = ${q(id)};`);
for (const [id, name] of Object.entries(src.options)) out.push(`UPDATE options SET name = json_set(name, '$.vi', ${q(name)}) WHERE id = ${q(id)};`);
writeFileSync(new URL('../seed/menu-vi.sql', import.meta.url), out.join('\n') + '\n');
console.log(`seed/menu-vi.sql: ${out.length - 3} строк`);
