# frozen_string_literal: true

# Добавляет idempotency по external_id для API trade.
# Матчит любые entryable-типы (Trade, Transaction, Transfer), которые создаёт
# Trade::CreateForm для deposit/withdrawal без transfer_account_id.
# Если entry с таким (account_id, external_id, source) уже есть — возвращает его
# с правильным шаблоном (trades/show, transactions/show или transfers/show).
# Если создаётся новый — сохраняет external_id/source в Entry после успешного создания.
#
# Подключение: смонтировать этот файл как volume в config/initializers/trade_external_id.rb

module TradeExternalId
  def create
    ext_id = params.dig(:trade, :external_id).to_s.presence
    account_id = params.dig(:trade, :account_id).to_s.presence

    if ext_id && account_id
      source = params.dig(:trade, :source).to_s.presence || "api"
      existing = Entry.joins(:account)
        .where(accounts: { family_id: current_resource_owner.family_id })
        .find_by(external_id: ext_id, source: source)

      if existing && existing.account_id.to_s == account_id
        @entry = existing
        case existing.entryable
        when Transaction
          @transaction = existing.entryable
          return render(template: "api/v1/transactions/show", status: :ok)
        when Trade
          @trade = existing.entryable
          return render(:show, status: :ok)
        when Transfer
          @transfer = existing.entryable
          return render(template: "api/v1/transfers/show", status: :ok)
        end
      end
    end

    super

    if ext_id && response.status == 201
      entry = @entry || @transaction&.entry || @transfer&.entry
      if entry&.persisted?
        source = params.dig(:trade, :source).to_s.presence || "api"
        entry.update_columns(external_id: ext_id, source: source)
      end
    end
  end
end

Rails.application.config.after_initialize do
  Api::V1::TradesController.prepend(TradeExternalId)
end
