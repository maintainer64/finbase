export interface Transaction {
    external_account_id: string; // relation account: внешний ключ (external_id счёта) для связки
    date: string;  // date: дата и время операции (ISO 8601, UTC)
    amount: number; // number: сумма операции (без знака; знак определяет nature)
    name: string;  // note: назначение операции (заголовок)
    description?: string;  // note: альтернативный заголовок (если name пусто)
    notes?: string;  // note: дополнительные заметки
    currency: string;  // currency: код валюты (RUB, USD...)
    nature: "income" | "expense" | "inflow" | "outflow";  // определяет знак суммы (income/inflow = +)
    external_id: string;  // external_id: идемпотентный ключ операции (из провайдера, unique в БД)
    source: string;  // namespace источника для external_id
}

export type AccountTypes =
    'Depository'
    | 'Investment'
    | 'Crypto'
    | 'Property'
    | 'Vehicle'
    | 'CreditCard'
    | 'Loan'
    | 'OtherAsset'
    | 'OtherLiability';

export type AccountSubtype =
// Depository
    "checking" |
    "savings" |
    "hsa" |
    "cd" |
    "money_market" |
    ""

export interface AccountTypeWithSubtype {
    subtype: AccountSubtype;
    accountable_type: AccountTypes;
    isMine?: boolean;
}

export interface Account {
    name: string; // name: название счёта
    currency: string; // currency: код валюты (3 символа)
    institution_name: string; // название банка (для отображения)
    institution_domain: string; // external_id: внешний ключ счёта для связки (unique в БД)
    provider_code: string; // provider_code: код провайдера (tbank | sber | yandex | ...)
    subtype: AccountSubtype; // type: подтип счёта -> checking/savings/cash/credit
    expiration_date?: string; // период окончания счёта (вклада/карты)
    available_credit?: string;           // Для кредиток доступный кредитный лимит (число как строка)
    minimum_payment?: string;            // Для кредиток минимальный платёж
    apr?: string;                        // Для кредиток годовая процентная ставка
    accountable_type?: AccountTypes; // accountable_type: тип счёта у провайдера
    accountable_id?: string; // accountable_id: внутренний id счёта у провайдера
    notes?: string; // notes: заметки (номер счёта, ставка и пр.)
}

export interface Product {
    name: string
    product_id: string
    date: string
    shop_id: string
    shop_location: string
    quantity: number
    weight_uom_code: string
    image: string
    price_per_unit: number
    price_per_quantity: number
    discounted_price_per_unit: number
    discounted_price_per_quantity: number
    type: string
    import_from: 'LavkaYandex' | 'X5' | 'LifeMart'
    uniform_id: string
}

export interface ProviderParams {
    config: Record<string, string>
}

// Категория сервиса — по ней раскладываем провайдеров по вкладкам
// и включаем разную логику (банки -> транзакции, магазины -> заказы).
export type ProviderKind = 'bank' | 'shop';

export interface ProviderAny {
    getName(): string;

    getIcon(): string;

    baseUrlLogo(): string;

    getUrl(): string;

    // По умолчанию (если не задано) считаем провайдера банком.
    getKind?(): ProviderKind;

    getConfigKeys?(): string[];

    prepare?(params: ProviderParams, onProgress?: OnProgress): Promise<void>;

    getTransactions?(params: ProviderParams): Promise<[Transaction[], any?]>;

    getAccounts?(params: ProviderParams): Promise<[Account[], any?]>;

    getProducts?(params: ProviderParams): Promise<Product[]>;
}

// Прогресс синхронизации: текущий этап + опциональный счётчик N из M.
export interface SyncProgress {
    stage: string;
    current?: number;
    total?: number;
}

export type OnProgress = (progress: SyncProgress) => void;

export interface ProviderSync {
    getName(): string;

    createAccountsIfNotExists(accounts: Account[], onProgress?: OnProgress): Promise<void>;

    createTransactionsIfNotExists(transactions: Transaction[], onProgress?: OnProgress): Promise<void>;
}