import {SureInternalApi} from "@/shared/providers/services/sure/sureInternalClient/base";
import {Api as SureExternalApi} from "@/shared/providers/services/sure/sureClient/Api";
import {
    AccountCollection,
    AccountDetail,
    SecurityCollection,
    Trade as SureTrade,
    Transaction as SureTransaction
} from "./sureClient/data-contracts";
import {Account, OnProgress, ProviderFormatCSV, ProviderSync, Trade, Transaction} from "@/shared/providers/base";
import {mapAccountToParams} from "@/shared/providers/services/sure/map";
import {logSync} from "@/shared/sync-log";
import {searchTrade, searchTransaction} from "@/shared/providers/services/sure/searchTrade";

const MAX_PAGES = 1000;

export class SureService implements ProviderSync, ProviderFormatCSV {
    private readonly internalApi: SureInternalApi;
    private readonly externalApi: SureExternalApi;

    // apiKey задаётся в настройках и прокидывается сюда напрямую
    // (без регенерации через /settings/api_key).
    constructor(baseUrl: string, apiKey: string) {
        this.internalApi = new SureInternalApi(baseUrl)
        this.externalApi = new SureExternalApi({
            baseUrl,
            baseApiParams: {
                credentials: 'same-origin',
                headers: {
                    "X-Api-Key": apiKey,
                },
            },
        })
    }


    getName(): string {
        return "Sure"
    }

    async accountsToCSV(accounts: Account[]): Promise<any[]> {
        return accounts.map(a => ({
            "Account type*": a.accountable_type || '',
            "Name*": a.name + ", " + a.institution_domain,
            "Balance*": 0,
            "Currency": a.currency || "",
            "Balance Date": a.opening_balance_date || "",
        }));
    }

    async transactionsToCSV(transactions: Transaction[]): Promise<any[]> {
        return transactions.map(t => ({
            "date*": t.date,
            "amount*": t.nature === "income" || t.nature === "inflow" ? t.amount : -t.amount,
            "name": t.name || t.description,
            "currency": t.currency,
            "category": '',
            "tags": '',
            "account": t.external_account_id,
            "notes": t.notes,
        }));
    }

    async createTransactionsIfNotExists(transactions: Transaction[], onProgress?: OnProgress): Promise<void> {
        onProgress?.({stage: "Проверка счетов в Sure…"});
        const accountsInDb = await this.getFullAccountsInDb();
        const externalApi = this.externalApi;

        const total = transactions.length;
        let current = 0;
        for (const transaction of transactions) {
            const accountInDb = this.getAccountsInDbById(
                accountsInDb,
                transaction.external_account_id,
            )
            if (!accountInDb) throw Error(`Невозможно найти счёт ${transaction.external_account_id}`);
            await externalApi.v1TransactionsCreate({
                transaction: {
                    account_id: accountInDb.id,
                    date: transaction.date,
                    amount: transaction.amount,
                    name: transaction.name,
                    description: transaction.description,
                    notes: transaction.notes,
                    currency: transaction.currency,
                    nature: transaction.nature,
                    external_id: transaction.external_id,
                    source: transaction.source,
                },
            })
            current++;
            onProgress?.({stage: "Отправка операций в Sure", current, total});
        }
    }

    private async getFullAccountsInDb(): Promise<AccountDetail[]> {
        const externalApi = this.externalApi;
        const accountsInDb = [];

        for (let page = 1; page <= MAX_PAGES; page++) {
            const response = await externalApi.v1AccountsList({
                include_disabled: true,
                page: page,
                per_page: 100
            });

            // Расширяем интерфейс ответа, добавляя туда поле pagination
            const result: AccountCollection = await response.json();

            // Если данных нет вообще — выходим
            if (!result.accounts || result.accounts.length === 0) {
                break;
            }

            accountsInDb.push(...result.accounts);

            // Условие выхода: если в ответе есть пагинация и текущая страница
            // равна или больше общего количества страниц — прекращаем цикл
            if (result.pagination && page >= result.pagination.total_pages) {
                break;
            }
        }
        return accountsInDb;
    }

    private getAccountsInDbById(db: AccountDetail[], id?: string): AccountDetail | undefined {
        return db.find((account) => {
            // Защита на случай, если name окажется undefined или null
            if (!account.institution_name || !id) {
                return false;
            }
            if (account.status === "pending_deletion") {
                return false
            }

            // Проверяем, начинается ли домен из БД с домена из account
            return account.institution_name.startsWith(id);
        });
    }

    async createAccountsIfNotExists(accounts: Account[], onProgress?: OnProgress): Promise<void> {
        onProgress?.({stage: "Проверка счетов в Sure…"});
        const accountsInDb = await this.getFullAccountsInDb()
        const total = accounts.length;
        let current = 0;
        for (const account of accounts) {
            const accountInDb = this.getAccountsInDbById(
                accountsInDb,
                account.institution_name
            )
            current++;
            onProgress?.({stage: "Создание счетов в Sure", current, total});
            if (accountInDb) continue;
            if (!account.accountable_type) {
                console.warn("Счёт не имеет типа", account);
            }
            const response = await this.internalApi.createDepository(mapAccountToParams(account))
            if (!response.ok) {
                throw Error(`Не удалось синхронизировать счёт ${account.name} ${account.institution_name}`)
            }
        }
    }

    private async getExistingTrades({accountId, date}: { accountId: string, date: string }): Promise<SureTrade[]> {
        const result: SureTrade[] = [];
        for (let page = 1; page <= MAX_PAGES; page++) {
            const response = await this.externalApi.v1TradesList({
                account_id: accountId,
                page,
                per_page: 100,
                start_date: date,
                end_date: date,
            });
            const json = await response.json();
            const trades = json?.trades ?? [];
            result.push(...trades);
            if (trades.length === 0 || !json.pagination || page >= json.pagination.total_pages) break;
        }
        return result;
    }

    private async getExistingTransaction({accountId, date}: {
        accountId: string,
        date: string
    }): Promise<SureTransaction[]> {
        const result: SureTransaction[] = [];
        for (let page = 1; page <= MAX_PAGES; page++) {
            const response = await this.externalApi.v1TransactionsList({
                account_ids: [accountId],
                page,
                per_page: 100,
                start_date: date,
                end_date: date,
            });
            const json = await response.json();
            const transactions = json?.transactions ?? [];
            result.push(...transactions);
            if (transactions.length === 0 || !json.pagination || page >= json.pagination.total_pages) break;
        }
        return result;
    }

    private async getExistingTicker(trade: Trade): Promise<{
        security_id?: string,
        ticker?: string,
        manual_ticker?: string
    }> {
        if (!trade.ticker) return {};
        const securityCollectionResponse = await this.externalApi.v1SecuritiesList({
            page: 1,
            per_page: 1,
            ticker: trade.ticker,
        })
        const securityCollection: SecurityCollection = await securityCollectionResponse.json();
        for (const securityItem of securityCollection.securities) {
            if (securityItem.id) {
                return {security_id: securityItem.id}
            }
        }
        const tickerListExternal = await this.internalApi.getTickerByName(trade.ticker, trade.dataProviders, trade.country_code);
        for (const tickerExternal of tickerListExternal) {
            const securityCollectionResponse = await this.externalApi.v1SecuritiesList({
                page: 1,
                per_page: 1,
                ticker: tickerExternal,
            })
            const securityCollection: SecurityCollection = await securityCollectionResponse.json();
            for (const securityItem of securityCollection.securities) {
                if (securityItem.id) {
                    return {security_id: securityItem.id}
                }
            }
        }
        for (const tickerExternal of tickerListExternal) {
            if (tickerExternal){
                return {ticker: tickerExternal}
            }
        }
        logSync(`Не найден ID ценной бумаги ${trade.ticker}`, "info")
        return {manual_ticker: trade.ticker};
    }

    async createTradesIfNotExists(trades: Trade[], onProgress?: OnProgress): Promise<void> {
        if (trades.length === 0) return;
        onProgress?.({stage: "Проверка сделок в Sure…"});
        const accountsInDb = await this.getFullAccountsInDb();

        // Счета Sure, затронутые этими сделками
        const accountIdByDomain = new Map<string, string>();
        for (const trade of trades) {
            if (accountIdByDomain.has(trade.external_account_id)) continue;
            const accountInDb = this.getAccountsInDbById(accountsInDb, trade.external_account_id);
            if (!accountInDb) throw Error(`Невозможно найти счёт ${trade.external_account_id}`);
            accountIdByDomain.set(trade.external_account_id, accountInDb.id);
        }

        // Тикеты ценные бумаги
        onProgress?.({stage: "Получение цен на все ценные бумаги..."});

        const total = trades.length;
        let current = 0;
        let created = 0;
        const skippedNoTicker: string[] = [];
        for (const trade of trades) {
            const accountId = accountIdByDomain.get(trade.external_account_id)!;
            current++;
            onProgress?.({stage: "Отправка сделок в Sure", current, total});

            // Если у трейда есть external_id — сервер сам сдублирует (initializer).
            // Без external_id (fallback) — проверяем через существующие трейды.
            if (!trade.external_id) {
                const tradeDate = trade.date.slice(0, 10);
                const [existTrades, existTransactions] = await Promise.all([
                    this.getExistingTrades({accountId: accountId, date: tradeDate}),
                    this.getExistingTransaction({accountId: accountId, date: tradeDate}),
                ]);
                if (searchTrade(existTrades, trade, accountId)) continue;
                if (searchTransaction(existTransactions, trade, accountId)) continue;
            }

            // Для buy/sell Sure обязательно требует бумагу (security_id/ticker/
            // manual_ticker). Без тикера запрос гарантированно упадёт с
            // «Security identifier required» — пропускаем и говорим об этом явно.
            if ((trade.type === "buy" || trade.type === "sell") && !trade.ticker) {
                skippedNoTicker.push(`${trade.date} ${trade.type} ${trade.name || trade.external_id}`);
                continue;
            }
            const tickerPayload = await this.getExistingTicker(trade);
            const base: Record<string, unknown> = {
                account_id: accountId,
                date: trade.date.slice(0, 10),
                type: trade.type,
                currency: trade.currency,
                ...(trade.qty !== undefined ? {qty: trade.qty} : {}),
                ...(trade.price !== undefined ? {price: trade.price} : {}),
                ...(trade.amount !== undefined ? {amount: trade.amount} : {}),
                ...(trade.external_id ? {external_id: trade.external_id, source: trade.source || 'api'} : {}),
                ...(tickerPayload ?? {}),
            };
            try {
                await this.externalApi.v1TradesCreate({
                    trade: base as any,
                });
                created++
            } catch (e) {
                logSync(`Не удалось подключить бумагу ${trade.ticker}: ${e}`);
                break
            }
        }
        if (skippedNoTicker.length > 0) {
            logSync(
                `Пропущено сделок без бумаги: ${skippedNoTicker.length} ` +
                `(Sure требует ticker для buy/sell). Например: ${skippedNoTicker.slice(0, 3).join("; ")}`,
                "warn",
            );
        }
        logSync(`Создано: ${created} операций с бумагами`)
    }
}