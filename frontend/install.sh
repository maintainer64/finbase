#!/bin/bash

# Скрипт для скачивания последнего релиза с GitHub и распаковки в домашнюю директорию
# Использование: ./download.sh

set -e  # Выход при ошибке

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Функция для вывода сообщений
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Проверка наличия необходимых утилит
check_dependencies() {
    local deps=("curl" "jq" "unzip")
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            log_error "Необходима утилита: $dep"
            log_info "Установите её командой:"
            case "$dep" in
                "jq")
                    echo "  Ubuntu/Debian: sudo apt-get install jq"
                    echo "  CentOS/RHEL: sudo yum install jq"
                    echo "  macOS: brew install jq"
                    ;;
                "unzip")
                    echo "  Ubuntu/Debian: sudo apt-get install unzip"
                    echo "  CentOS/RHEL: sudo yum install unzip"
                    echo "  macOS: brew install unzip"
                    ;;
            esac
            exit 1
        fi
    done
}

# Получение информации о последнем релизе
get_latest_release() {
    local repo=$1
    local api_url="https://api.github.com/repos/$repo/releases/latest"

    log_info "Получаем информацию о последнем релизе для: $repo"

    response=$(curl -s -H "Accept: application/vnd.github.v3+json" "$api_url")

    if echo "$response" | jq -e '.message' | grep -q "Not Found"; then
        log_error "Репозиторий не найден или нет релизов: $repo"
        exit 1
    fi

    # Извлекаем данные
    tag_name=$(echo "$response" | jq -r '.tag_name')
    release_name=$(echo "$response" | jq -r '.name')
    published_at=$(echo "$response" | jq -r '.published_at')
    assets_count=$(echo "$response" | jq '.assets | length')

    log_info "Последний релиз: $release_name ($tag_name)"
    log_info "Опубликован: $published_at"
    log_info "Количество ассетов: $assets_count"

    # Ищем ZIP архив
    zip_asset=$(echo "$response" | jq -r '.assets[] | select(.name | endswith(".zip")) | {name, browser_download_url, size}')

    if [ -z "$zip_asset" ] || [ "$zip_asset" = "null" ]; then
        log_error "ZIP архив не найден в релизе"

        # Показываем доступные ассеты
        log_warn "Доступные ассеты:"
        echo "$response" | jq -r '.assets[] | "  - \(.name) (\(.size) bytes)"'
        exit 1
    fi

    asset_name=$(echo "$zip_asset" | jq -r '.name')
    download_url=$(echo "$zip_asset" | jq -r '.browser_download_url')
    asset_size=$(echo "$zip_asset" | jq -r '.size')

    log_info "Найден ZIP архив: $asset_name ($((asset_size/1024/1024)) MB)"
}

# Скачивание
download() {
    local download_url=$1
    local repo=$2
    local home_dir="$HOME"

    # Создаем имя файла из названия репозитория
    local repo_name=$(basename "$repo")
    local zip_file="$home_dir/${repo_name}_latest.zip"

    log_info "Скачиваем в: $zip_file"

    # Скачиваем архив
    if ! curl -L -o "$zip_file" "$download_url"; then
        log_error "Ошибка при скачивании"
        exit 1
    fi

    # Проверяем что файл скачался
    if [ ! -f "$zip_file" ]; then
        log_error "Файл не был скачан"
        exit 1
    fi

    local file_size=$(stat -f%z "$zip_file" 2>/dev/null || stat -c%s "$zip_file" 2>/dev/null)
    log_info "Скачано: $((file_size/1024/1024)) MB"
}

# Скачивание dev образа
replace_dev() {
    local build_zip=$1
    local repo=$2
    local home_dir="$HOME"

    # Создаем имя файла из названия репозитория
    local repo_name=$(basename "$repo")
    local zip_file="$home_dir/${repo_name}_latest.zip"

    log_info "Перемещаем в: $zip_file"

    # Перемещаем архив
    mv "$build_zip" "$zip_file"

    # Проверяем что файл переместился
    if [ ! -f "$zip_file" ]; then
        log_error "Файл не был перемещен"
        exit 1
    fi

    local file_size=$(stat -f%z "$zip_file" 2>/dev/null || stat -c%s "$zip_file" 2>/dev/null)
    log_info "Перемещено: $((file_size/1024/1024)) MB"
}

# Распаковка
extract() {
    local repo=$1
    local home_dir="$HOME"
    local repo_name=$(basename "$repo")
    local zip_file="$home_dir/${repo_name}_latest.zip"
    local extract_dir="$home_dir/${repo_name}"
    # Создаем директорию для распаковки
    if [ -d "$extract_dir" ]; then
        log_warn "Директория $extract_dir уже существует, удаляем старую версию"
        rm -rf "$extract_dir"
    fi

    mkdir -p "$extract_dir"

    log_info "Распаковываем в: $extract_dir"

    # Распаковываем архив
    if ! unzip -q "$zip_file" -d "$extract_dir"; then
        log_error "Ошибка при распаковке"
        exit 1
    fi

    # Удаляем архив после успешной распаковки
    rm "$zip_file"
    log_info "Временный архив удален: $zip_file"

    # Показываем содержимое
    log_info "Содержимое распакованной директории:"
    find "$extract_dir" -type f | head -10 | while read -r file; do
        echo "  - ${file#$extract_dir/}"
    done

    local total_files=$(find "$extract_dir" -type f | wc -l)
    log_info "Всего файлов распаковано: $total_files"

    echo
    log_info "✅ Релиз успешно скачан и распакован в: $extract_dir"
}

# Основная функция
main() {
    local repo=maintainer64/finbase
    local dev=$1

    log_info "Начинаем загрузку последнего релиза для: $repo"

    # Проверяем зависимости
    check_dependencies

    # Скачиваем
    if [[ "$dev" == "dev" ]]; then
      replace_dev "build.zip" "$repo"
    else
      # Получаем URL для скачивания
      get_latest_release "$repo"
      download "$download_url" "$repo"
    fi
    # Распаковываем
    extract "$repo"
}

# Запуск скрипта
main "$@"
