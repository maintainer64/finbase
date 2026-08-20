import {Account, OnProgress, ProviderSync, Transaction} from "@/shared/providers/base";
import {logSync} from "@/shared/sync-log";
import {requireFinbaseToken} from "@/shared/finbase/token";
import {
    AccountRecord,
    CategoryRecord,
    CategorySumRecord,
    CollectionName,
    CollectionRecords,
    DailyFlowRecord,
    FlowSplitRecord,
    OperationGroupRecord,
    PocketBaseListResponse,
    TagRecord,
    TransactionRecord,
    TransactionRuleRecord,
    TransferRecord,
    UserRecord,
    WritableCollectionName,
} from "@/shared/finbase/models";

// Тонкий REST-клиент PocketBase без DTO-маппинга. Токен выдаётся штатным
// PocketBase OIDC-флоу (или вручную для диагностики) и передаётся как Bearer.

export type {
    AccountRecord,
    CategoryRecord,
    CategorySumRecord,
    DailyFlowRecord,
    FlowSplitRecord,
    OperationGroupRecord,
    PocketBaseRecord,
    TagRecord,
    TransactionRecord,
    TransactionRuleRecord,
    TransferRecord,
    UserRecord,
} from "@/shared/finbase/models";

// PocketBase принимает любой ISO 8601 (с Z или офсетом) и хранит в UTC; читает
// в UTC. Нормализуем всё к полному ISO с временем, чтобы источник не мог
// протолкнуть «голую» дату без времени.
export function normalizeDate(value: string): string {
    if (!value) return value;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        logSync(`Некорректная дата "${value}" — пропускаем нормализацию`, "warn");
        return value;
    }
    return date.toISOString();
}

const filterValue = (value: string): string => JSON.stringify(value);

export class FinbaseService implements ProviderSync {
    private readonly baseUrl: string;
    private readonly token: string;
    private ownerId = "";

    constructor(baseUrl: string, token: string) {
        this.baseUrl = baseUrl.replace(/\/+$/, "");
        this.token = token;
    }

    getName(): string {
        return "Finbase";
    }

    private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
        const token = requireFinbaseToken(this.token);
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
        };
        const response = await fetch(`${this.baseUrl}/api/${path}`, {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        if (!response.ok) {
            const details = await response.text().catch(() => "");
            let message = details;
            try {
                const payload = JSON.parse(details) as {
                    message?: string;
                    data?: Record<string, {message?: string; code?: string}>;
                };
                const fields = Object.entries(payload.data ?? {})
                    .map(([field, error]) => `${field}: ${error.message || error.code || "некорректное значение"}`)
                    .join("; ");
                message = [payload.message, fields].filter(Boolean).join(" — ") || details;
            } catch {
                // PocketBase/nginx иногда возвращает обычный текст.
            }
            throw Error(`PocketBase HTTP ${response.status}: ${message || response.statusText}`);
        }
        if (response.status === 204) return undefined as T;
        return (await response.json()) as T;
    }

    private async list<K extends CollectionName>(collection: K, filter: string): Promise<CollectionRecords[K][]> {
        const result = await this.request<PocketBaseListResponse<CollectionRecords[K]>>("GET", `collections/${collection}/records?perPage=200&filter=${encodeURIComponent(filter)}`);
        return result.items;
    }

    private async find<K extends CollectionName>(collection: K, filter: string): Promise<CollectionRecords[K] | undefined> {
        const items = await this.list(collection, filter);
        return items[0];
    }

    /** Получаем владельца из действующей сессии, не полагаясь только на разбор JWT в браузере. */
    private async resolveOwnerId(): Promise<string> {
        if (this.ownerId) return this.ownerId;
        const auth = await this.request<{record: UserRecord}>("POST", "collections/users/auth-refresh");
        this.ownerId = auth.record?.id || "";
        if (!this.ownerId) {
            throw new Error("Finbase: PocketBase не вернул id пользователя. Выйдите и войдите через OIDC заново.");
        }
        return this.ownerId;
    }

    async createAccountsIfNotExists(accounts: Account[], onProgress?: OnProgress): Promise<void> {
        onProgress?.({stage: "Проверка счетов в Finbase…"});
        const defaultOwnerId = accounts.some(account => !account.owner)
            ? await this.resolveOwnerId()
            : "";
        const total = accounts.length;
        let current = 0;
        for (const account of accounts) {
            current++;
            onProgress?.({stage: "Создание счетов в Finbase", current, total});
            const existing = await this.find("accounts", `external_id = ${filterValue(account.external_id)}`);
            if (existing) continue;
            const payload: Partial<AccountRecord> = {
                name: account.name,
                type: account.type,
                currency: account.currency || "RUB",
                owner: account.owner || defaultOwnerId,
                external_id: account.external_id,
                provider_code: account.provider_code || "",
                accountable_type: account.accountable_type || "",
                accountable_id: account.accountable_id || "",
                notes: account.notes || "",
            };
            if (account.disabled_at) payload.disabled_at = account.disabled_at;
            if (account.excluded_report_at) payload.excluded_report_at = account.excluded_report_at;
            await this.request("POST", "collections/accounts/records", payload);
        }
    }

    async createTransactionsIfNotExists(transactions: Transaction[], onProgress?: OnProgress): Promise<void> {
        const accounts = await this.listAll("accounts");
        const accountByExternalId = new Map(accounts.map(a => [a.external_id as string, a.id]));

        const total = transactions.length;
        let current = 0;
        for (const transaction of transactions) {
            current++;
            onProgress?.({stage: "Отправка операций в Finbase", current, total});
            const accountId = accountByExternalId.get(transaction.account)
                ?? [...accountByExternalId.entries()].find(([extId]) => extId && transaction.account.startsWith(extId))?.[1];
            if (!accountId) {
                logSync(`Пропуск операции: счёт «${transaction.account}» не найден`, "warn");
                continue;
            }
            const dupFilter = `account = ${filterValue(accountId)} && external_id = ${filterValue(transaction.external_id)}`;
            if (await this.find("transactions", dupFilter)) continue;
            await this.request("POST", "collections/transactions/records", {
                account: accountId,
                category: transaction.category,
                tags: transaction.tags,
                date: normalizeDate(transaction.date),
                amount: transaction.amount,
                currency: transaction.currency,
                note: transaction.note,
                external_id: transaction.external_id || "",
            });
        }
    }

    // ==================== Универсальный CRUD (раздел «Данные») ====================

    /** Создание записи любой коллекции. */
    async createRecord<K extends WritableCollectionName>(collection: K, data: Partial<CollectionRecords[K]>): Promise<CollectionRecords[K]> {
        return this.request<CollectionRecords[K]>("POST", `collections/${collection}/records`, data);
    }

    /** Обновление записи любой коллекции (частичный патч). */
    async updateRecord<K extends WritableCollectionName>(collection: K, id: string, data: Partial<CollectionRecords[K]>): Promise<CollectionRecords[K]> {
        return this.request<CollectionRecords[K]>("PATCH", `collections/${collection}/records/${id}`, data);
    }

    /** Удаление записи любой коллекции. */
    async deleteRecord(collection: WritableCollectionName, id: string): Promise<void> {
        await this.request("DELETE", `collections/${collection}/records/${id}`);
    }

    // ==================== Чтение данных для страницы «Статистика» ====================

    /** Постраничное чтение коллекции/view (perPage=200, цикл по страницам). */
    async listAll<K extends CollectionName>(collection: K, filter = ""): Promise<CollectionRecords[K][]> {
        const items: CollectionRecords[K][] = [];
        let page = 1;
        while (true) {
            const result = await this.request<PocketBaseListResponse<CollectionRecords[K]>>(
                "GET",
                `collections/${collection}/records?perPage=200&page=${page}&filter=${encodeURIComponent(filter)}`,
            );
            items.push(...result.items);
            if (items.length >= result.totalItems || result.items.length === 0) return items;
            page++;
        }
    }

    async getAccountsList(): Promise<AccountRecord[]> {
        return this.listAll("accounts");
    }

    async getUsers(): Promise<UserRecord[]> {
        return this.listAll("users");
    }

    /** Потоки по дням для выбранных счетов (фильтр "account = 'id' || account = 'id2'"). */
    async getDailyFlows(accountIds: string[]): Promise<DailyFlowRecord[]> {
        const filter = accountIds.length
            ? accountIds.map(id => `account = ${filterValue(id)}`).join(" || ")
            : "";
        return this.listAll("daily_flows", filter);
    }

    /** Итоги по размеченным категориям (все время). */
    async getCategorySums(): Promise<CategorySumRecord[]> {
        return this.listAll("category_sums");
    }

    /** Размеченные потоки: (день, счёт, категория, теги) — для фильтров статистики. */
    async getFlowSplits(accountIds: string[]): Promise<FlowSplitRecord[]> {
        const filter = accountIds.length
            ? accountIds.map(id => `account = ${filterValue(id)}`).join(" || ")
            : "";
        return this.listAll("flow_splits", filter);
    }

    /** Список категорий (id, имя, цвет, родитель) — для фильтров и иерархии диаграмм. */
    async getCategories(): Promise<CategoryRecord[]> {
        return this.listAll("categories");
    }

    /** Список тегов (id, имя, цвет). */
    async getTags(): Promise<TagRecord[]> {
        return this.listAll("tags");
    }

    /** Операции для ленивой детализации сводной таблицы. */
    async getTransactions(filter = ""): Promise<TransactionRecord[]> {
        return this.listAll("transactions", filter);
    }

    async getTransactionRules(): Promise<TransactionRuleRecord[]> {
        return this.listAll("transaction_rules");
    }

    async getOperationGroups(): Promise<OperationGroupRecord[]> {
        return this.listAll("operation_groups");
    }

    async getTransfers(): Promise<TransferRecord[]> {
        return this.listAll("transfers");
    }
}
