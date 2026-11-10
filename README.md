# VIBE — сайт и предзаказ

Семейный ресторан VIBE, Нячанг. План и договорённости: [docs/project-plan.md](docs/project-plan.md).

## Запуск на своём компьютере (тестовые данные)

```bash
npm install
cp .dev.vars.example .dev.vars   # PIN сотрудника и секрет сессии, в репозиторий не попадает
npm run db:migrate:local
npm run db:seed:local
npm run dev                      # http://localhost:8787
```

- Сайт гостя: http://localhost:8787/
- Панель сотрудника: http://localhost:8787/staff (имя любое, PIN из `.dev.vars`)

## Проверки

```bash
npm test               # правила цены, времени и статусов
npm run typecheck
node scripts/smoke.mjs # сквозная проверка API на запущенном сервере
```
