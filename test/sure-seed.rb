# Идемпотентный сид Sure для интеграционных тестов расширения.
# Запуск: docker compose exec -T -e SEED_API_KEY=... -e SEED_ACCOUNT_DOMAIN=... \
#           web bin/rails runner - < test/sure-seed.rb
#
# Создаёт семью, пользователя, API-ключ с известным значением и один счёт
# с заданным institution_domain (по нему тест находит счёт и шлёт операции).

api_key_value = ENV.fetch("SEED_API_KEY")
domain = ENV.fetch("SEED_ACCOUNT_DOMAIN", "test-bank")

family = Family.first || Family.create!(
  name: "Integration Family",
  currency: "USD",
  locale: "en",
  date_format: "%m-%d-%Y"
)

user = User.find_by(email: "integration@example.com") || family.users.create!(
  email: "integration@example.com",
  password: "password123",
  password_confirmation: "password123"
)

unless ApiKey.active.find_by(display_key: api_key_value)
  ApiKey.create!(
    user: user,
    name: "integration-#{SecureRandom.hex(4)}",
    key: api_key_value,
    scopes: %w[read_write],
    source: "web"
  )
end

unless family.accounts.exists?(institution_domain: domain)
  family.accounts.create_and_sync(
    {
      accountable_type: "Depository",
      name: "Integration Bank",
      currency: "USD",
      balance: 0,
      institution_name: domain,
      institution_domain: "Integration Bank",
      owner_id: user.id,
      accountable_attributes: {}
    },
    opening_balance_date: Date.today - 30
  )
end

puts "SEED_OK user=#{user.email} domain=#{domain}"
