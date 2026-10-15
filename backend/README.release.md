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

## HTTPS без reverse proxy

Укажите собственный сертификат и приватный ключ через окружение. PowerShell:

```powershell
$env:FINBASE_HTTPS_ADDR = "0.0.0.0:8443"
$env:FINBASE_TLS_CERT_FILE = "C:\Finbase\certs\fullchain.pem"
$env:FINBASE_TLS_KEY_FILE = "C:\Finbase\certs\privkey.pem"
.\finbase.exe serve --dir=.\pb_data
```

Linux/macOS:

```bash
FINBASE_HTTPS_ADDR=0.0.0.0:8443 \
FINBASE_TLS_CERT_FILE=/certs/fullchain.pem \
FINBASE_TLS_KEY_FILE=/certs/privkey.pem \
./finbase serve --dir=./pb_data
```

Нужны все три переменные вместе. Сертификат с полной цепочкой и соответствующий
ключ должны быть в PEM; ключ — без пароля. `.env` автоматически не читается.
В этом режиме обычный HTTP не запускается, `--http` игнорируется. Не добавляйте
`--https` или аргумент домена для автоматического TLS PocketBase.
Некорректная TLS-конфигурация приводит к ошибке запуска, не к откату на HTTP.

В расширении укажите `https://ваш-домен:8443`. Сертификат должен соответствовать
домену и быть доверенным в браузере. После обновления файлов перезапустите
backend. При OIDC добавьте callback `https://ваш-домен:8443/api/oauth2-redirect`.
