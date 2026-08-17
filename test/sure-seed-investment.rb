# Сид инвестиционного счёта для тестов trades.
# Счета создаются в расширении через internal CSRF-флоу (нужен DOMParser, браузер),
# поэтому в Node-тестах заводим счёт напрямую — проверяем именно путь trades.
#
# Запуск: docker compose exec -T -e SEED_INVEST_DOMAIN=... web bin/rails runner - < test/sure-seed-investment.rb

domain = ENV.fetch("SEED_INVEST_DOMAIN", "tinvest-test")
family = Family.first or abort("Нет семьи — сначала прогоните test/sure-seed.rb")

unless family.accounts.exists?(institution_domain: domain)
  user = family.users.first or abort("Нет пользователя — сначала прогоните test/sure-seed.rb")
  family.accounts.create_and_sync(
    {
      accountable_type: "Investment",
      name: "Брокерский счёт (тест)",
      currency: "USD",
      balance: 0,
      institution_name: domain,
      institution_domain: "Т-Инвестиции",
      owner_id: user.id,
      accountable_attributes: {}
    },
    opening_balance_date: Date.today - 30
  )
end

puts "SEED_INVEST_OK domain=#{domain}"
