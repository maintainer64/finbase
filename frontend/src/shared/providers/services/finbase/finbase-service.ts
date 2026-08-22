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

export interface TransactionImportResult {
    created: number;
    skipped: number;
    failures: {index: number; message: string}[];
}

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
const TRANSFER_CATEGORY_NAME = "Переводы";
// SQLite LOWER() без ICU меняет регистр только ASCII. Используем ту же
// нормализацию, что и operation_groups, иначе русские названия не совпадут.
const sqliteLower = (value: string): string => value.replace(/[A-Z]/g, letter => letter.toLowerCase());

/** Добавляет банковскому id операции пространство имён её провайдера. */
export const providerExternalId = (providerCode: string, externalId: unknown): string => {
    const code = providerCode.trim();
    const value = String(externalId ?? "").trim();
    if (!code || !value) return value;
    const prefix = `${code}_`;
    return value.startsWith(prefix) ? value : `${prefix}${value}`;
};

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
        const accountByExternalId = new Map(accounts.map(account => [account.external_id, account]));

        const total = transactions.length;
        let current = 0;
        for (const transaction of transactions) {
            current++;
            onProgress?.({stage: "Отправка операций в Finbase", current, total});
            const account = accountByExternalId.get(transaction.account)
                ?? [...accountByExternalId.entries()].find(([externalId]) => (
                    externalId && transaction.account.startsWith(externalId)
                ))?.[1];
            if (!account) {
                logSync(`Пропуск операции: счёт «${transaction.account}» не найден`, "warn");
                continue;
            }
            const externalId = providerExternalId(account.provider_code, transaction.external_id);
            const duplicateIds = [...new Set([externalId, transaction.external_id].filter(Boolean))];
            if (duplicateIds.length > 0) {
                const externalIdFilter = duplicateIds
                    .map(id => `external_id = ${filterValue(id)}`)
                    .join(" || ");
                const dupFilter = `account = ${filterValue(account.id)} && (${externalIdFilter})`;
                if (await this.find("transactions", dupFilter)) continue;
            }
            await this.request("POST", "collections/transactions/records", {
                account: account.id,
                category: transaction.category,
                tags: transaction.tags,
                date: normalizeDate(transaction.date),
                amount: transaction.amount,
                currency: transaction.currency,
                note: transaction.note,
                external_id: externalId,
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

    /** Постраничное чтение коллекции/view (perPage=5000, цикл по страницам). */
    async listAll<K extends CollectionName>(collection: K, filter = ""): Promise<CollectionRecords[K][]> {
        const items: CollectionRecords[K][] = [];
        let page = 1;
        while (true) {
            const result = await this.request<PocketBaseListResponse<CollectionRecords[K]>>(
                "GET",
                `collections/${collection}/records?perPage=5000&page=${page}&filter=${encodeURIComponent(filter)}`,
            );
            items.push(...result.items);
            if (items.length >= result.totalItems || result.items.length === 0) return items;
            page++;
        }
    }

    /** Одна страница PocketBase без автоматической выгрузки всей коллекции. */
    async listPage<K extends CollectionName>(
        collection: K,
        page: number,
        perPage: number,
        options: {filter?: string; sort?: string} = {},
    ): Promise<PocketBaseListResponse<CollectionRecords[K]>> {
        const query = new URLSearchParams({
            page: String(page),
            perPage: String(perPage),
        });
        if (options.filter) query.set("filter", options.filter);
        if (options.sort) query.set("sort", options.sort);
        return this.request<PocketBaseListResponse<CollectionRecords[K]>>(
            "GET",
            `collections/${collection}/records?${query.toString()}`,
        );
    }

    async getAccountsList(): Promise<AccountRecord[]> {
        return this.listAll("accounts");
    }

    async getUsers(): Promise<UserRecord[]> {
        return this.listAll("users");
    }

    private statisticsFilter(accountIds: string[], from = "", to = ""): string {
        const filters: string[] = [];
        if (accountIds.length) {
            const accounts = accountIds.map(id => `account = ${filterValue(id)}`).join(" || ");
            filters.push(accountIds.length > 1 ? `(${accounts})` : accounts);
        }
        if (from) filters.push(`day >= ${filterValue(from)}`);
        if (to) filters.push(`day <= ${filterValue(to)}`);
        return filters.join(" && ");
    }

    /** Потоки по дням для выбранных счетов и периода. */
    async getDailyFlows(accountIds: string[], from = "", to = ""): Promise<DailyFlowRecord[]> {
        return this.listAll("daily_flows", this.statisticsFilter(accountIds, from, to));
    }

    /** Итоги по размеченным категориям (все время). */
    async getCategorySums(): Promise<CategorySumRecord[]> {
        return this.listAll("category_sums");
    }

    /** Размеченные потоки: (день, счёт, категория, теги) — для фильтров статистики. */
    async getFlowSplits(accountIds: string[], from = "", to = ""): Promise<FlowSplitRecord[]> {
        return this.listAll("flow_splits", this.statisticsFilter(accountIds, from, to));
    }

    /** Список категорий (id, имя, цвет, родитель) — для фильтров и иерархии диаграмм. */
    async getCategories(): Promise<CategoryRecord[]> {
        const categories = await this.listAll("categories");
        return categories.filter(category => category.name !== TRANSFER_CATEGORY_NAME);
    }

    /** Список тегов (id, имя, цвет). */
    async getTags(): Promise<TagRecord[]> {
        return this.listAll("tags");
    }

    /** Операции для ленивой детализации сводной таблицы. */
    async getTransactions(filter = ""): Promise<TransactionRecord[]> {
        return this.listAll("transactions", filter);
    }

    /** Детали только тех операций, которые нужны загруженной странице переводов. */
    async getTransactionsByIds(ids: string[], batchSize = 40): Promise<TransactionRecord[]> {
        const uniqueIds = [...new Set(ids.filter(Boolean))];
        const records: TransactionRecord[] = [];
        for (let offset = 0; offset < uniqueIds.length; offset += batchSize) {
            const batch = uniqueIds.slice(offset, offset + batchSize);
            const filter = batch.map(id => `id = ${filterValue(id)}`).join(" || ");
            const page = await this.listPage("transactions", 1, batch.length, {filter});
            records.push(...page.items);
        }
        return records;
    }

    /** Идемпотентный импорт операций: существующие external_id пропускаются. */
    async importTransactions(
        transactions: Partial<TransactionRecord>[],
        concurrency = 4,
        onProgress?: (completed: number, total: number) => void,
    ): Promise<TransactionImportResult> {
        const externalIds = [...new Set(transactions.map(item => item.external_id?.trim()).filter(Boolean) as string[])];
        const existing = new Set<string>();
        for (let offset = 0; offset < externalIds.length; offset += 40) {
            const batch = externalIds.slice(offset, offset + 40);
            const filter = batch.map(id => `external_id = ${filterValue(id)}`).join(" || ");
            const result = await this.listPage("transactions", 1, batch.length, {filter});
            result.items.forEach(item => existing.add(item.external_id));
        }

        const seen = new Set(existing);
        const queue: {index: number; transaction: Partial<TransactionRecord>}[] = [];
        let skipped = 0;
        transactions.forEach((transaction, index) => {
            const externalId = transaction.external_id?.trim() ?? "";
            if (externalId && seen.has(externalId)) {
                skipped++;
                return;
            }
            if (externalId) seen.add(externalId);
            queue.push({index, transaction});
        });

        let next = 0;
        let completed = skipped;
        let created = 0;
        const failures: TransactionImportResult["failures"] = [];
        onProgress?.(completed, transactions.length);
        const worker = async () => {
            while (next < queue.length) {
                const item = queue[next++];
                try {
                    await this.createRecord("transactions", item.transaction);
                    created++;
                } catch (reason) {
                    failures.push({index: item.index, message: reason instanceof Error ? reason.message : String(reason)});
                } finally {
                    completed++;
                    onProgress?.(completed, transactions.length);
                }
            }
        };
        await Promise.all(Array.from({length: Math.min(concurrency, queue.length)}, () => worker()));
        failures.sort((a, b) => a.index - b.index);
        return {created, skipped, failures};
    }

    async getTransactionRules(): Promise<TransactionRuleRecord[]> {
        return this.listAll("transaction_rules");
    }

    async getOperationGroupsPage(page: number, perPage: number): Promise<PocketBaseListResponse<OperationGroupRecord>> {
        return this.listPage("operation_groups", page, perPage, {sort: "-transactions_count"});
    }

    /** Неразмеченные операции конкретной группы, без выгрузки всей истории. */
    async getOperationGroupTransactionsPage(
        group: OperationGroupRecord,
        page: number,
        perPage: number,
    ): Promise<PocketBaseListResponse<TransactionRecord>> {
        const natureFilter = group.transaction_type === "income" ? "amount >= 0" : "amount < 0";
        const filter = [
            `category = ""`,
            `note:lower = ${filterValue(sqliteLower(group.name))}`,
            natureFilter,
        ].join(" && ");
        return this.listPage("transactions", page, perPage, {filter, sort: "-date"});
    }

    /** Назначает категорию только выбранным операциям, небольшими параллельными пачками. */
    async categorizeTransactions(ids: string[], category: string, concurrency = 5): Promise<void> {
        const queue = [...new Set(ids.filter(Boolean))];
        let next = 0;
        const worker = async () => {
            while (next < queue.length) {
                const id = queue[next++];
                await this.updateRecord("transactions", id, {category});
            }
        };
        await Promise.all(Array.from({length: Math.min(concurrency, queue.length)}, () => worker()));
    }

    async getTransfersPage(
        page: number,
        perPage: number,
        status: "pending" | "history",
    ): Promise<PocketBaseListResponse<TransferRecord>> {
        return this.listPage("transfers", page, perPage, {
            filter: status === "pending" ? `status = "pending"` : `status != "pending"`,
            sort: status === "pending" ? "-created" : "-updated",
        });
    }
}
