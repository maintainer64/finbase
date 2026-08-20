import type {NewAccountRecord, NewTransactionRecord} from "@/shared/finbase/models";

// Провайдеры, синхронизация и UI используют тот же контракт, что и PocketBase.
// Типы создания выведены из PocketBase-моделей: системный `id` здесь намеренно
// отсутствует и всегда генерируется PocketBase. `account` операции до отправки
// содержит `external_id` счёта, который сервис разрешает в relation id.
export type Account = NewAccountRecord;
export type Transaction = NewTransactionRecord;

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
