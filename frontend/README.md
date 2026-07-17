# Finbase extension

SolidJS-интерфейс и Chrome extension для Finbase. Общее описание архитектуры,
текущий статус и команды запуска находятся в [корневом README](../README.md).

## Команды

```bash
pnpm install
pnpm start                 # Vite dev server
pnpm lint                  # ESLint
pnpm exec tsc --noEmit     # строгая проверка типов
pnpm exec vite build       # быстрая сборка UI
pnpm build                 # полный архив Chrome extension
```

## Ключевые каталоги

```text
src/
├─ app/                    # оболочка и маршруты экранов
├─ components/ui/          # переиспользуемые UI-компоненты
├─ pages/data/             # типизированный CRUD PocketBase
├─ pages/statistics/       # дашборд и графики
└─ shared/
   ├─ finbase/models.ts    # 1:1 модели PocketBase
   └─ providers/           # источники банков и сервис Finbase
```

Иконки категорий хранятся в PocketBase как стабильный ключ Lucide
(`shopping-basket`, `train`, `heart-handshake` и т. п.). Поле `lucide_icon`
напрямую отображается компонентом из `lucide-solid`; список поддерживаемых
ключей находится в `src/components/ui/category-icon.tsx`.
