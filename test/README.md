# Интеграционные тесты

Гоняют реальный клиент расширения (`SureService` + сгенерированный `Api`) против
живого инстанса Sure, поднятого через docker-compose.

Покрыто:
- **Банковский путь** (`sure-integration.test.ts`) — список счетов, создание операций,
  идемпотентность по `(external_id, source)`.
- **Инвестиции** (`sure-trades.test.ts`) — сделки buy/sell/dividend, пересчёт holdings
  воркером и клиентский дедуп (у trades в Sure нет `external_id`).
- **Схема настроек** (`settings.test.ts`) — чистый юнит-тест, Sure не нужен.

Создание счетов в расширении идёт через web-форму Sure (`SureInternalApi`, нужен
`DOMParser`) — в Node это не работает, поэтому счета для тестов заводятся сидами.

## Локальный запуск

```bash
export SURE_API_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
export SURE_ACCOUNT_DOMAIN=test-bank
export SURE_BASE_URL=http://127.0.0.1

# 1. Поднять Sure (web + worker + postgres + redis)
docker compose -f test/compose.sure.yml up -d

# 2. Дождаться готовности
until curl -sf $SURE_BASE_URL/up; do sleep 5; done

# 3. Засеять пользователя, API-ключ и обычный счёт
docker compose -f test/compose.sure.yml exec -T \
  -e SEED_API_KEY="$SURE_API_KEY" \
  -e SEED_ACCOUNT_DOMAIN="$SURE_ACCOUNT_DOMAIN" \
  web bin/rails runner - < test/sure-seed.rb

# 4. Засеять инвестиционный счёт (нужен для sure-trades.test.ts)
docker compose -f test/compose.sure.yml exec -T \
  -e SEED_INVEST_DOMAIN=tinvest-test \
  web bin/rails runner - < test/sure-seed-investment.rb

# 5. Прогнать тесты
pnpm test:integration        # всё из test/
pnpm exec vitest run test/settings.test.ts   # только юнит-тесты, без docker

# 6. Убрать
docker compose -f test/compose.sure.yml down -v
```

В CI то же самое делает `.github/workflows/integration.yml`.

> На macOS `localhost` может резолвиться в IPv6 и не отвечать — используйте
> `127.0.0.1`, как в примере выше.

## CSRF и Origin для расширения

Тестовый стенд **не отключает** CSRF: Sure в self-hosted режиме работает с
обычной Rails-защитой (cookie `_sure_session` + `X-CSRF-Token`), и расширение
проходит её как настоящий браузер. Для этого в `test/nginx.conf`:

- `proxy_set_header Origin $scheme://$host` — подменяет Origin на
  `http://localhost`, чтобы Rails CSRF origin-check проходил (реальный
  `chrome-extension://...` он бы отклонил);
- CORS-блок — echo реального Origin клиента в `Access-Control-Allow-Origin`
  (с `proxy_hide_header` поверх `*` от Sure), preflight (OPTIONS) отвечает
  сам nginx;
- `proxy_cookie_flags _sure_session samesite=none secure` и то же для
  `session_token` — Chrome-расширение (cross-site контекст) не получает
  cookie с `SameSite=Lax`, поэтому флаги переписываются. Работает по http
  только на `localhost` (Chrome-исключение для Secure cookie); на другом
  хосте нужен https.

Монтируемые initializer'ы: `sure-initializers/zzz_self_hosted_tweaks.rb`
(отключает Rack::Attack при `SELF_HOSTED=true`) и
`sure-initializers/trade_external_id.rb` (идемпотентность сделок по
`external_id`).

Проверить, что стенд поднят и флоу работает:

```bash
docker compose -f test/compose.sure.yml logs web | grep SELF_HOSTED
# [SELF_HOSTED] Rack::Attack rate limiting ОТКЛЮЧЁН (SELF_HOSTED=true)
```

Полный флоу «как расширение» (login → CSRF → создание аккаунта) — см.
`test/sure-trades.test.ts` и `test/sure-integration.test.ts`.

⚠️ Флаги cookie и подмена Origin — только для локального стенда и CI.
