# Офлайн-курсы валют для self-hosted стенда.
# Sure конвертирует суммы сделок в валюту счёта через Money#exchange_to,
# который без курса в БД (и без EXCHANGE_RATE_PROVIDER) падает с
# Money::ConversionError, из-за чего SyncJob не может построить holdings.
# Сид гарантирует фиксированный курс RUB/USD на весь период расчётов.
Rails.application.config.after_initialize do
  next unless ENV["SELF_HOSTED"] == "true" && ENV["EXCHANGE_RATE_PROVIDER"].blank?
  next unless ExchangeRate.table_exists?

  RUB_PER_USD = 88

  start_date = Date.new(2025, 1, 1)
  end_date = Date.today + 30

  [
    ["RUB", "USD", 1.0 / RUB_PER_USD],
    ["USD", "RUB", RUB_PER_USD.to_d]
  ].each do |from_currency, to_currency, rate|
    (start_date..end_date).each do |date|
      ExchangeRate.find_or_create_by!(from_currency: from_currency, to_currency: to_currency, date: date) do |r|
        r.rate = rate
      end
    rescue ActiveRecord::RecordNotUnique
      next
    end
  end

  Rails.logger.info("[OFFLINE_FX] Seeded exchange rates RUB/USD for #{start_date}..#{end_date}")
end
