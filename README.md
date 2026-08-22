# Finbase

[![CI](https://github.com/maintainer64/finbase/actions/workflows/integration.yml/badge.svg)](https://github.com/maintainer64/finbase/actions/workflows/integration.yml)
[![Backend container](https://github.com/maintainer64/finbase/actions/workflows/docker-backend.yml/badge.svg)](https://github.com/maintainer64/finbase/actions/workflows/docker-backend.yml)

Finbase — self-hosted система личных финансов на PocketBase с интерфейсом и
браузерным расширением на SolidJS. Расширение забирает счета и операции из
банковских кабинетов, сохраняет их в собственный backend и открывает полный
финансовый обзор в отдельной вкладке.

Проект рассчитан на личную или семейную установку: счета связаны с
пользователями, но авторизованные участники одной базы пока видят общие данные.

## Что уже работает

- синхронизация Сбера, Т-Банка, Яндекс Банка, Яндекс Лавки и Жизньмарта;
- счета, пользователи, операции, категории с иерархией и Lucide-иконками, теги;
- CRUD-таблицы в стиле screener с поиском, сортировкой и фильтрами, включая
  «Без категории» и «Без тегов»;
- автоматический баланс счёта и исключение выбранных счетов из отчётов;
- правила категоризации, поиск повторяющихся неразмеченных операций, создание
  правила из найденной группы и последовательный режим интерактивной разметки;
- поиск возможных переводов между счетами в окне 30 минут с подтверждением или
  отклонением пары;
- обзор по периодам, счетам и пользователям: баланс, доходы, расходы, категории,
  таблицы, Sankey и детализация по годам, месяцам или неделям;
- единый движок графиков Apache ECharts, светлая, тёмная и системная темы;
- вход через PocketBase OIDC, в том числе через Authelia;
- идемпотентный demo-сид для локальной разработки и контейнера.

Мультивалютность пока ограничена хранением кода валюты: общий итог не выполняет
FX-конвертацию. Ежемесячные PDF-отчёты также ещё не реализованы.

## Архитектура

```text
Банковские кабинеты и магазины
              │
              ▼
Chrome extension / SolidJS
              │ типизированный FinbaseService
              ▼
PocketBase API + Go hooks
              │
              ├── accounts / users / transactions
              ├── categories / tags / transfers
              ├── transaction_rules
              └── daily_flows / flow_splits / category_sums / operation_groups
```

```text
backend/                         PocketBase-приложение и одна Go-миграция
frontend/                        SolidJS UI и Manifest V3 extension
frontend/src/components/ui/      переиспользуемые компоненты
frontend/src/pages/data/         универсальный CRUD и фильтры
frontend/src/pages/statistics/   обзор, таблицы и ECharts
frontend/src/pages/automation/   правила, группы операций и переводы
frontend/src/shared/finbase/     frontend-модели PocketBase 1:1
```

`frontend/src/shared/finbase/models.ts` повторяет записи backend без DTO и
лишнего преобразования. `frontend/src/pages/data/finbase-schema.ts` содержит
только UI-метаданные: подпись поля, вид контрола и доступность в таблице.

## Быстрый запуск

Понадобятся Docker с Compose либо Go 1.26.2, а для frontend — pnpm 11 и Node.js
24. Версия pnpm зафиксирована в `frontend/package.json`.

### PocketBase в Docker

```bash
cd backend
cp .env.example .env
docker compose up --build -d
```

- API и PocketBase Admin UI: `http://127.0.0.1:8080` и
  `http://127.0.0.1:8080/_/`;
- данные: `backend/pb_data`;
- опубликованный образ: `ghcr.io/maintainer64/finbase_web:latest`.

Создать или обновить администратора можно отдельной командой:

```bash
docker compose exec finbase_web /pb/finbase superuser upsert \
  admin@example.com 'replace-with-a-long-password' \
  --dir=/pb/pb_data
```

### Demo-данные

Однократное заполнение всех рабочих коллекций:

```bash
cd backend
docker compose run --rm finbase_web demo --dir=/pb/pb_data --days=180
```

Или включите сид при каждом старте контейнера в `backend/.env`:

```dotenv
FINBASE_DEMO=true
FINBASE_DEMO_DAYS=180
```

Сид создаёт дерево категорий, теги, двух пользователей, четыре счёта, правила,
операции за выбранный период и связанные переводы. Он идемпотентный: повторный
запуск обновляет записи по стабильным ключам и не создаёт дубли.

Локальный запуск без Docker:

```bash
cd backend
go run . serve --http=127.0.0.1:8080 --dir=./pb_data

# В другом терминале:
go run . demo --dir=./pb_data --days=180
```

### Frontend и расширение

```bash
cd frontend
pnpm install --frozen-lockfile
pnpm start
```

После первого открытия задайте адрес PocketBase в «Настройки → Finbase и
авторизация». Кнопка **Finbase** в шапке открывает полноэкранное приложение в
новой вкладке. Разделы «Обзор», «Данные» и «Автоматика» намеренно не выводятся в
маленьком popup расширения.

Полный архив Chrome extension:

```bash
cd frontend
pnpm build
```

Результат находится в `frontend/build.zip`.

## OIDC и Authelia

PocketBase конфигурирует OIDC-провайдер из окружения:

```dotenv
FINBASE_OIDC_ISSUER=https://auth.example.com
FINBASE_OIDC_CLIENT_ID=finbase
FINBASE_OIDC_CLIENT_SECRET=replace-me
FINBASE_OIDC_DISPLAY_NAME=Authelia
```

В Authelia нужен confidential client с `authorization_code`, scopes
`openid email profile` и точным callback PocketBase:

```yaml
identity_providers:
  oidc:
    clients:
      - client_id: finbase
        client_name: Finbase
        client_secret: '$pbkdf2-sha512$...'
        authorization_policy: two_factor
        redirect_uris:
          - https://finbase.example.com/api/oauth2-redirect
          - http://127.0.0.1:8080/api/oauth2-redirect
        scopes: [openid, email, profile]
        response_types: [code]
        grant_types: [authorization_code]
```

Authelia хранит хеш, а `FINBASE_OIDC_CLIENT_SECRET` должен содержать исходный
секрет того же клиента. Для production оставьте только точный HTTPS callback.
Frontend использует PocketBase OAuth2 с PKCE; OIDC-заголовки не формируются
вручную, поэтому кириллица в имени пользователя не попадает в HTTP headers.

## Данные и автоматика

Основные writable-коллекции:

| Коллекция | Назначение |
|---|---|
| `users` | пользователи PocketBase/OIDC |
| `accounts` | счета, владелец, вычисляемый баланс и даты состояния |
| `transactions` | операции со счётом, категорией и тегами |
| `categories` | дерево категорий, цвет и ключ `lucide_icon` |
| `tags` | произвольные метки операций |
| `transaction_rules` | JSON-условия и действия автоматической разметки |
| `transfers` | уникальная пара входящей и исходящей операции |

Первое подходящее активное правило категоризирует новую операцию. При сохранении
правила backend также размечает подходящую историю без категории. Ссылку на
категорию можно переносить между базами: если id из `value_ref` неизвестен,
категория ищется по имени.

`operation_groups` показывает повторяющиеся неразмеченные операции. Из группы
можно создать готовое правило. Автодетектор переводов сопоставляет равные по
модулю `in`/`out` в разных счетах одной валюты. Только однозначная пара в окне
`FINBASE_TRANSFER_WINDOW_MINUTES` получает `pending`; затем её можно принять как
transfer или отклонить.

`accounts.balance` пересчитывается backend после создания, изменения и удаления
операции. `accounts.owner` для синхронизированного счёта берётся из текущего JWT.
`disabled_at` означает отключённый источник, но сохраняет историю в аналитике.
Только `excluded_report_at` убирает счёт из баланса, категорий, потоков,
группировки и поиска переводов; в разделе «Данные» счёт остаётся видимым.
Календарный день отчётов рассчитывается с `FINBASE_TIMEZONE_OFFSET` (например,
`+05:00` для Екатеринбурга), поэтому ночные операции первого числа не переходят
в предыдущий UTC-месяц.

Операции можно загрузить в «Данные → Операции → Импорт CSV». Обязательны дата,
сумма и полное наименование существующего счёта. Категория сопоставляется по
названию и может быть пустой; теги также необязательны и перечисляются через
запятую. Поддерживаются CSV с `;` и `,` (в последнем случае список тегов нужно
взять в кавычки). Перед записью показываются предпросмотр и ошибки по строкам.
Готовый шаблон: [`examples/finbase-transactions-import.csv`](examples/finbase-transactions-import.csv).

## Разработка и проверки

```bash
cd frontend
pnpm lint
pnpm exec tsc --noEmit
pnpm test
pnpm build

cd ../backend
test -z "$(gofmt -l .)"
go vet ./...
go test ./...
go build ./...
```

Интеграционные тесты запускаются против живого PocketBase. Переменные и ручной
сценарий описаны в `frontend/test/README.md`.

При изменении модели:

1. Обновите единственную миграцию в `backend/migrations`.
2. С теми же именами обновите `frontend/src/shared/finbase/models.ts`.
3. Для редактируемого поля добавьте UI-метаданные в `finbase-schema.ts`.
4. Запустите frontend type-check/build и Go tests.

## GitHub Actions и релизы

| Workflow | Когда запускается | Результат |
|---|---|---|
| `integration.yml` | push/PR в `main` или `master`, вручную | Go format/vet/test/build, demo smoke, frontend lint/type-check/test/build и интеграция с PocketBase |
| `docker-backend.yml` | изменения backend, version tag, вручную | multi-arch `linux/amd64` + `linux/arm64` image в GHCR; PR только собирается |
| `release.yml` | tag `v*` или вручную для существующего тега | проверенный ZIP расширения, SHA-256 и GitHub Release |

Workflow используют совместимые stable majors: `actions/checkout@v4`,
`actions/setup-go@v5`, `pnpm/action-setup@v4`, `actions/setup-node@v4`,
`actions/upload-artifact@v4`, Docker Setup/Login actions `@v4`,
`docker/metadata-action@v6` и `docker/build-push-action@v7`.

Обычный релиз не изменяет репозиторий сам. Сначала обновите версию
`frontend/package.json`, затем создайте совпадающий тег:

```bash
git tag -a v1.2.0 -m 'Finbase v1.2.0'
git push origin v1.2.0
```

`release.yml` завершится ошибкой, если тег и версия пакета различаются. Version
tag одновременно публикует контейнер с semver-тегами и `latest`.
