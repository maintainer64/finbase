export interface Transaction {
    external_account_id: string; // Account ID (required)
    date: string;  // Transaction date + time
    amount: number; // Transaction amount
    name: string;  // Transaction name/description
    description?: string;  // Alternative to name field
    notes?: string;  // Additional notes
    currency: string;  // Currency code (defaults to family currency)
    nature: "income" | "expense" | "inflow" | "outflow";  // Transaction nature (determines sign)
    external_id: string;  // Optional external idempotency key scoped to account and source
    source: string;  // Optional source namespace for external_id. Requires external_id and defaults to api when external_id is provided
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
    name: string; // Название счёта
    currency: string; // Валюта
    opening_balance_date: string; // Дата открытия баланса
    institution_name: string; // ID внешний для связки
    institution_domain: string; // Название банка
    subtype: AccountSubtype; // Подтип
    expiration_date?: string; // Дата окончания срока
    available_credit?: string;           // Для кредиток доступный кредитный лимит (число как строка)
    minimum_payment?: string;            // Для кредиток минимальный платёж
    apr?: string;                        // Для кредиток годовая процентная ставка
    accountable_type?: AccountTypes; // Тип счёта
    notes?: string; // Дата создания или другая удобная информация для пользователя
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


// Сделка по бумаге для инвестиционного счёта (модель Sure: trades -> holdings).
// qty/price нужны для buy/sell, amount — для dividend/deposit/withdrawal/interest.
export type TradeType = 'buy' | 'sell' | 'dividend' | 'deposit' | 'withdrawal' | 'interest';

export interface Trade {
    external_account_id: string; // institution_domain инвестиционного счёта
    date: string;                // YYYY-MM-DD
    type: TradeType;
    ticker: string;              // тикер бумаги (для денежных операций может быть пустым)
    name: string;                // название бумаги/операции
    qty?: number;                // количество (buy/sell)
    price?: number;              // цена за штуку (buy/sell)
    amount?: number;             // сумма (dividend/deposit/withdrawal/interest)
    currency: string;
    country_code?: string;       // ISO 3166-1 alpha-2 код страны (для Security::Resolver)
    external_id: string;         // id операции у брокера (для дедупа на клиенте)
    source: string;
    dataProviders: string[];
}

export interface ProviderParams {
    config: Record<string, string>
}

// Категория сервиса — по ней раскладываем провайдеров по вкладкам
// и включаем разную логику (банки -> транзакции, инвестиции -> сделки, магазины -> заказы).
export type ProviderKind = 'bank' | 'investment' | 'shop';

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

    getTrades?(params: ProviderParams): Promise<[Trade[], any?]>;
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

    // Сделки по инвестиционным счетам. Необязательный метод: поддерживают не все сервисы.
    createTradesIfNotExists?(trades: Trade[], onProgress?: OnProgress): Promise<void>;
}

export interface ProviderFormatCSV {
    accountsToCSV(accounts: Account[]): Promise<any[]>;

    transactionsToCSV(transactions: Transaction[]): Promise<any[]>;
}