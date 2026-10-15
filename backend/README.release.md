# Finbase backend

Архив содержит самостоятельный PocketBase backend с миграциями и Go hooks.
Go, Docker и отдельная установка SQLite не нужны. Интерфейс Finbase находится
в отдельном браузерном расширении; этот бинарник не является desktop UI.

## Windows (PowerShell)

```powershell
.\finbase.exe serve --http=127.0.0.1:8080 --dir=.\pb_data
```

## Linux / macOS

```bash
./finbase serve --http=127.0.0.1:8080 --dir=./pb_data
```

На macOS система может запросить разрешение на запуск скачанного приложения.
Бинарники не подписаны сертификатом разработчика.

## Настройка

API: http://127.0.0.1:8080/api/health

PocketBase Admin UI: http://127.0.0.1:8080/_/

В другом терминале создайте администратора (на Linux/macOS используйте
`./finbase` вместо `.\finbase.exe`):

```powershell
.\finbase.exe superuser upsert admin@example.com 'replace-with-a-long-password' --dir=.\pb_data
```

В настройках браузерного расширения укажите `http://127.0.0.1:8080`.
OIDC настраивается переменными `FINBASE_OIDC_ISSUER`, `FINBASE_OIDC_CLIENT_ID`,
`FINBASE_OIDC_CLIENT_SECRET`, `FINBASE_OIDC_DISPLAY_NAME`, как и в контейнере.

Данные сохраняются в указанной папке `pb_data`. При обновлении остановите
backend, сделайте резервную копию папки и замените только бинарник, сохранив
данные. Для доступа с других устройств нужны отдельная настройка адреса
прослушивания, HTTPS и авторизации; по умолчанию сервер слушает только localhost.
