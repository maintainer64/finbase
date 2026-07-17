# Тесты Finbase

Обычный `pnpm test` запускает быстрые unit-тесты без внешних сервисов.

Интеграционные тесты проверяют настоящий `FinbaseService`, CRUD и SQL view на
живом PocketBase. Перед запуском задайте параметры стенда:

```bash
export FINBASE_URL=http://127.0.0.1:8090
export FINBASE_SUPERUSER_EMAIL=admin@finbase.local
export FINBASE_SUPERUSER_PASSWORD='change-me'
export FINBASE_EMAIL=test@finbase.local

pnpm test:integration
```

Пользователь `FINBASE_EMAIL` должен существовать. Тесты входят суперпользователем,
выпускают для него impersonation token и создают записи с уникальными external id.
Полный подъём backend и подготовка пользователя показаны в
`.github/workflows/integration.yml`.

Команды проверки frontend:

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm test
pnpm exec vite build
```
