# Архитектура frontend

Актуальный обзор всего репозитория и таблица статуса находятся в
[корневом README](../README.md). Этот документ отвечает на вопрос «куда класть
код» внутри расширения.

## Слои

```text
pages / components
        │
        ├── shared/finbase/models.ts
        │            ▲
        ▼            │ записи PocketBase без DTO
FinbaseService ──────┘
        ▲
sync workflow
        ▲
providers/sources (банки и магазины)
```

### Backend-модели

`shared/finbase/models.ts` зеркалит коллекции и view из `backend/migrations`.
Сервис возвращает эти типы напрямую; страницы не создают собственные версии
`Account`, `Category` или `FlowSplit`.

`pages/data/finbase-schema.ts` не является моделью. Это метаописание формы:
русская подпись, control (`color`, `icon`, `relation`) и видимость колонки.

Типы в `shared/providers/base.ts` — внешний входной формат банков. Они не обязаны
повторять PocketBase: единственное преобразование выполняется в
`FinbaseService.createAccountsIfNotExists` и
`createTransactionsIfNotExists`.

### Данные и аналитика

- `accounts`, `categories`, `tags`, `transactions`, `transfers` — обычные
  PocketBase-коллекции и CRUD-раздел «Данные».
- `daily_flows` — дневная дельта и накопленный баланс по счетам.
- `flow_splits` — дельта по дню, счету, категории и массиву тегов.
- `category_sums` — суммы по категориям за всё время.
- `pages/statistics` — только отображение и клиентские фильтры; агрегаты
  считаются view на backend.

### Компоненты

- `components/ui` — кнопки, поля, карточки и реестр иконок категорий.
- `components/navigation` — общая responsive-оболочка.
- `pages/*` — композиция компонентов и сценарии конкретного экрана.
- `shared/hooks` — интеграция Solid с local/chrome storage и активной вкладкой.

## Добавление поля PocketBase

1. Добавить новую миграцию; не переписывать уже применённую схему без forward
   migration.
2. Обновить соответствующий `*Record` в `shared/finbase/models.ts`.
3. Для редактируемого поля добавить UI-метаданные в `finbase-schema.ts`.
4. Запустить `pnpm exec tsc --noEmit`, `pnpm lint`, frontend build и Go tests.

## Добавление источника

1. Реализовать `ProviderAny` в `shared/providers/sources`.
2. Сеть из страницы банка выполнять через `swFetch`, поскольку запросам нужны
   cookies вкладки и обход CORS.
3. Зарегистрировать источник в `shared/providers/registry.ts`.
4. Стабильный `institution_name` источника становится `accounts.external_id`, а
   `Transaction.external_account_id` связывает операцию с этим счетом.
5. `external_id` операции должен быть стабильным: на нём держится дедупликация.

## Ближайший технический долг

1. Ввести пользовательские owner-rules до многопользовательского запуска.
2. Добавить FX-конвертацию перед суммированием разных валют.
3. Инъектировать fetch в банковские providers и покрыть их JSON fixtures.
4. Разбить крупные source-файлы на HTTP-клиент, response types и mapper.
