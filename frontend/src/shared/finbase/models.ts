/**
 * Контракт данных Finbase.
 *
 * Имена и типы ниже зеркально повторяют PocketBase-коллекции из
 * backend/migrations. UI и REST-клиент используют эти записи напрямую — без
 * DTO, адаптеров и второго набора «моделей для экрана».
 */

export interface PocketBaseRecord {
    id: string;
    collectionId?: string;
    collectionName?: string;
    created?: string;
    updated?: string;
}

export type AccountType = "checking" | "savings" | "cash" | "credit";
export type TransferStatus = "pending" | "accepted" | "rejected";
export type TransactionNature = "income" | "expense";

export interface UserRecord extends PocketBaseRecord {
    email: string;
    name: string;
    verified: boolean;
}

export interface AccountRecord extends PocketBaseRecord {
    name: string;
    type: AccountType;
    balance: number;
    owner: string;
    currency: string;
    external_id: string;
    provider_code: string;
    accountable_type: string;
    accountable_id: string;
    notes: string;
    disabled_at: string;
    excluded_report_at: string;
}

export interface CategoryRecord extends PocketBaseRecord {
    name: string;
    color: string;
    parent_category: string;
    lucide_icon: string;
}

export interface TagRecord extends PocketBaseRecord {
    name: string;
    icon: string;
    color: string;
}

export interface TransactionRecord extends PocketBaseRecord {
    account: string;
    category: string;
    tags: string[];
    date: string;
    amount: number;
    currency: string;
    note: string;
    external_id: string;
}

/** Поля новой записи; системные id/created/updated всегда назначает PocketBase. */
export type NewRecord<T extends PocketBaseRecord> = Omit<T, keyof PocketBaseRecord>;
export type NewAccountRecord = NewRecord<AccountRecord>;
export type NewTransactionRecord = NewRecord<TransactionRecord>;

export interface TransferRecord extends PocketBaseRecord {
    inflow_transaction: string;
    outflow_transaction: string;
    status: TransferStatus;
    notes: string;
}

export interface TransactionRuleCondition {
    condition_type: string;
    operator: string;
    value: string | number;
}

export interface TransactionRuleAction {
    action_type: string;
    value: string | number | string[];
    value_ref?: {
        type: string;
        id: string;
        name: string;
    };
}

export interface TransactionRuleRecord extends PocketBaseRecord {
    name: string;
    resource_type: "transaction";
    active: boolean;
    effective_date: string;
    conditions: TransactionRuleCondition[];
    actions: TransactionRuleAction[];
}

export interface OperationGroupRecord extends PocketBaseRecord {
    group_key: string;
    name: string;
    transaction_type: TransactionNature;
    transactions_count: number;
    total: number;
    first_date: string;
    last_date: string;
}

export interface DailyFlowRecord extends PocketBaseRecord {
    account: string;
    day: string;
    delta: number;
    running: number;
    start_balance: number;
    currency: string;
}

export interface CategorySumRecord extends PocketBaseRecord {
    category: string;
    name: string;
    color: string;
    parent_category: string;
    lucide_icon: string;
    total: number;
}

export interface FlowSplitRecord extends PocketBaseRecord {
    account: string;
    day: string;
    category: string;
    tags: string[];
    delta: number;
}

export interface CollectionRecords {
    users: UserRecord;
    accounts: AccountRecord;
    categories: CategoryRecord;
    tags: TagRecord;
    transactions: TransactionRecord;
    transfers: TransferRecord;
    transaction_rules: TransactionRuleRecord;
    daily_flows: DailyFlowRecord;
    category_sums: CategorySumRecord;
    flow_splits: FlowSplitRecord;
    operation_groups: OperationGroupRecord;
}

export type CollectionName = keyof CollectionRecords;
export type WritableCollectionName = "accounts" | "categories" | "tags" | "transactions" | "transfers" | "transaction_rules";
export type WritableRecord = CollectionRecords[WritableCollectionName];

export interface PocketBaseListResponse<T extends PocketBaseRecord> {
    items: T[];
    page: number;
    perPage: number;
    totalItems: number;
    totalPages: number;
}
