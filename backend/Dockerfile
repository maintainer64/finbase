# Стадия сборки (используйте актуальную версию Go)
FROM golang:1.26-alpine AS builder

ARG TARGETOS
ARG TARGETARCH

WORKDIR /app

# Кэшируем зависимости
COPY go.mod go.sum ./
RUN go mod download

# Копируем исходный код (включая папку migrations)
COPY . .

# Сборка статического бинарника под платформу, выбранную Buildx
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -trimpath -o finbase .

# Финальный образ — distroless static (без glibc, без shell)
FROM gcr.io/distroless/static-debian12:nonroot

# Копируем корневые сертификаты (нужны для HTTPS-запросов из приложения)
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Копируем собранный бинарник
COPY --from=builder /app/finbase /pb/finbase

# Открываем порт
EXPOSE 8080

# Том для данных (учтите, что nonroot пользователь имеет uid 65532)
VOLUME /pb/pb_data

# Demo is opt-in. Set FINBASE_DEMO=true when starting the container.
ENV FINBASE_DEMO=false \
    FINBASE_DEMO_DAYS=180 \
    FINBASE_TRANSFER_WINDOW_MINUTES=30

# Запуск (без shell, поэтому только exec-форма). ENTRYPOINT позволяет выполнять
# служебные команды вроде `docker compose run --rm finbase_web demo`.
ENTRYPOINT ["/pb/finbase"]
CMD ["serve", "--http=0.0.0.0:8080", "--dir=/pb/pb_data"]
