# frozen_string_literal: true

# Твики для self-hosted тестового стенда. Работает только при SELF_HOSTED=true
# (см. test/compose.sure.yml), в боевой инстанс попасть не может.
if ENV["SELF_HOSTED"] == "true"
  # Отключаем Rack::Attack rate limiting для локального тестирования
  Rack::Attack.enabled = false
  Rails.logger.warn("[SELF_HOSTED] Rack::Attack rate limiting ОТКЛЮЧЁН (SELF_HOSTED=true)") if Rails.logger
end

# Единый лимит размера загружаемых файлов. Образ Sure по умолчанию ограничивает
# вложения/импорты 10 MB в трёх местах:
#   - Transaction::MAX_ATTACHMENT_SIZE  (вложения к транзакциям)
#   - Import::MAX_CSV_SIZE              (CSV-импорт)
#   - SureImport::MAX_NDJSON_SIZE       (NDJSON-импорт)
# Поднимаем все три одной переменной SURE_MAX_UPLOAD_SIZE_MB.
Rails.application.config.after_initialize do
  next unless ENV["SELF_HOSTED"] == "true"

  max_mb = ENV.fetch("SURE_MAX_UPLOAD_SIZE_MB", 100).to_i

  {
    Transaction => :MAX_ATTACHMENT_SIZE,
    Import => :MAX_CSV_SIZE,
    SureImport => :MAX_NDJSON_SIZE
  }.each do |klass, const_name|
    next unless klass.const_defined?(const_name)

    klass.send(:remove_const, const_name)
    klass.const_set(const_name, max_mb.megabytes)
  end

  Rails.logger.warn("[SELF_HOSTED] Upload size limits raised to #{max_mb} MB") if Rails.logger

  # Бесконечный лимит строк импорта: SURE_IMPORT_MAX_ROWS=infinity/unlimited/none.
  imr = ENV["SURE_IMPORT_MAX_ROWS"].to_s.strip.downcase
  if %w[infinity unlimited none].include?(imr)
    # SureImport#max_row_count делегирует в SureImport.max_row_count, so классового
    # переопределения достаточно как для API/preflight, так и для инстанса.
    SureImport.define_singleton_method(:max_row_count) { Float::INFINITY }
    Rails.logger.warn("[SELF_HOSTED] Import max row count set to INFINITY") if Rails.logger
  end
end
