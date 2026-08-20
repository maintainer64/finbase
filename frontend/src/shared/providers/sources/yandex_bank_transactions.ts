import {Account, OnProgress, ProviderAny, ProviderParams, Transaction} from "../base";
import {getCookieByName, getMaxTransactions} from "@/shared/utils";
import {swFetch} from "@/shared/sw-fetch";
import {logSync} from "@/shared/sync-log";
import {getAccountName, getCurrencyCodeMap, getFullNotice, logItems, filterByConfig} from "@/shared/providers/utils";


const PREFIX_BANK = "yandex_";
const BASE_URL = "https://bank.yandex.ru";

// Получение подключенного списка продуктов
async function getHomeProducts(operationId: string) {
    const payload = {
        operationName: "HomeProductsV2",
        variables: {
            homeProductsInput: {},
        },
        extensions: {
            persistedQuery: {
                version: 1,
                sha256Hash: operationId
            }
        }
    };

    const requestOptions = {
        method: "POST",
        credentials: 'include',
        redirect: "follow",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(payload)
    } as RequestInit;
    const searchParams = new URLSearchParams({operationId} as any);
    const response = await swFetch(
        `${BASE_URL}/graphql?${searchParams.toString()}`,
        requestOptions,
    );
    return await response.json();
}

// Имена GraphQL-операций, чьи persisted-query хэши нужно достать из бандла.
// ВАЖНО: они лежат в РАЗНЫХ webpack-чанках, поэтому ищем все за один проход.
const OPERATION_NAMES = ["HomeProductsV2", "SavingsAccountsList", "GetTransactionFeedView"] as const;
type OperationName = typeof OPERATION_NAMES[number];

let operationHashes: Partial<Record<OperationName, string>> = {};
let prepared = false;

// Скачивает /my, главный бандл и webpack-чанки; вытаскивает хэши всех операций
// за один проход. onProgress отражает перебор чанков (это самый долгий этап).
async function fetchOperationHashes(onProgress?: OnProgress): Promise<Partial<Record<OperationName, string>>> {
    const result: Partial<Record<OperationName, string>> = {};
    const opts = {method: "GET", credentials: "include", redirect: "follow"} as RequestInit;

    const scan = (text: string) => {
        const re = /"(HomeProductsV2|SavingsAccountsList|GetTransactionFeedView)":"([a-f0-9]{64})"/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) !== null) {
            result[m[1] as OperationName] = m[2];
        }
    };
    const allFound = () => OPERATION_NAMES.every(n => result[n]);

    // Главный бандл страницы /my
    const htmlResp = await swFetch(`${BASE_URL}/my`, opts);
    const doc = new DOMParser().parseFromString(await htmlResp.text(), "text/html");
    const scriptHref = Array.from(doc.querySelectorAll('link[rel="preload"][as="script"][href]'))
        .map(link => link.getAttribute("href"))
        .find(href => (href ?? "").includes("cdn"));
    if (!scriptHref) return result;

    const mainText = await (await swFetch(scriptHref, opts)).text();
    scan(mainText);
    if (allFound()) return result;

    // Карта webpack-чанков из главного бандла. Ищем только шаблон имени
    // чанка "defaults-" + chunkId + "." + ({...})[chunkId] — он не зависит от
    // минификации имён переменных и стиля (arg => expr / function(s) { return }).
    const match = mainText.match(/["']defaults-["']\s*\+\s*\w+\s*\+\s*["']\.["']\s*\+\s*\(?(\{[^{}]*\})\)?\s*\[\s*\w+\s*\]/);
    if (!match) {
        console.warn("Не найдена карта webpack-чанков Яндекса");
        return result;
    }
    const cleanJson = match[1]
        .replace(/,\s*([}\]])/g, "$1")
        .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":');
    let chunks: Record<string, string>;
    try {
        chunks = JSON.parse(cleanJson);
    } catch (e) {
        console.error("Не удалось распарсить карту чанков Яндекса", e);
        return result;
    }

    const chunkBase = scriptHref.replace(/\/[^/]*$/, "/");
    const entries = Object.entries(chunks);
    let i = 0;
    for (const [chunkId, chunkHash] of entries) {
        i++;
        onProgress?.({stage: "Поиск операций Яндекса…", current: i, total: entries.length});
        try {
            const resp = await swFetch(`${chunkBase}defaults-${chunkId}.${chunkHash}.js`, opts);
            if (!resp.ok) continue;
            scan(await resp.text());
            if (allFound()) break;   // все хэши найдены — дальше можно не качать
        } catch (error) {
            console.error(`Ошибка при загрузке чанка ${chunkId}`, error);
        }
    }
    return result;
}

// Гарантирует, что хэши операций найдены (ленивый вызов из getAccounts/getTransactions).
async function ensurePrepared(): Promise<void> {
    if (prepared) return;
    operationHashes = await fetchOperationHashes();
    prepared = true;
    const missing = OPERATION_NAMES.filter((name) => !operationHashes[name]);
    if (missing.length > 0) {
        logSync(
            `Яндекс-Банк: не найдены операции в бандле: ${missing.join(", ")} — ` +
            `выгрузка по ним не сработает (возможно, банк изменил сборку)`,
            "warn",
        );
    }
}

function operationHash(name: OperationName): string {
    return operationHashes[name] || "";
}

// Получение списка операций
async function getBankOperations(operationId: string, cursor?: any) {
    const payload = {
        "operationName": "GetTransactionFeedView",
        "variables": {
            "size": 100,
            "cursor": cursor
        },
        "extensions": {
            "persistedQuery": {
                "version": 1,
                "sha256Hash": operationId
            }
        }
    }
    const requestOptions = {
        method: "POST",
        credentials: 'include',
        redirect: "follow",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload)
    } as RequestInit;
    const searchParams = new URLSearchParams({
        operationId: operationId,
    } as any);
    const response = await swFetch(
        `${BASE_URL}/graphql?${searchParams.toString()}`,
        requestOptions,
    );
    return await response.json();
}

// Получение списка SavingsAccountsList
async function getSavingsAccountsList(operationId: string) {
    const payload = {
        "operationName": "SavingsAccountsList",
        "variables": {},
        "extensions": {
            "persistedQuery": {
                "version": 1,
                "sha256Hash": operationId
            }
        }
    }
    const requestOptions = {
        method: "POST",
        credentials: 'include',
        redirect: "follow",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload)
    } as RequestInit;
    const searchParams = new URLSearchParams({
        operationId: operationId,
    } as any);
    const response = await swFetch(
        `${BASE_URL}/graphql?${searchParams.toString()}`,
        requestOptions,
    );
    return await response.json();
}

// Получение хеша операции
async function generateHashAccount(yandexLogin: string, id: string) {
    const encoder = new TextEncoder();
    const data = encoder.encode(`${yandexLogin};${id}`);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export const yandexBankTransactions: ProviderAny = {
    getName: () => 'Яндекс-Банк',
    getIcon: () => 'yandex.png',
    getUrl: () => BASE_URL,
    baseUrlLogo: () => 'pay.yandex.ru',

    // Ищет в webpack-бандле хэши всех нужных операций за один проход.
    prepare: async (_params: ProviderParams, onProgress?: OnProgress): Promise<void> => {
        operationHashes = await fetchOperationHashes(onProgress);
        prepared = true;
    },

    getTransactions: async (params: ProviderParams): Promise<[Transaction[], any?]> => {
        const [accounts] = await yandexBankTransactions.getAccounts?.(params) || [[], undefined];
        const rows: Transaction[] = [];
        const maxLimit = getMaxTransactions(params.config['general-max-transactions']);
        const yandexLogin = await getCookieByName('yandex_login', BASE_URL);
        if (!yandexLogin) return [rows, {}];
        await ensurePrepared();
        const operationId = operationHash("GetTransactionFeedView");
        if (!operationId) return [rows, {}];
        let operations = [];
        let cursor = undefined;
         
        while (true) {
            const page = await getBankOperations(operationId, cursor);
            cursor = page?.data?.getTransactionsFeedView?.cursor;
            operations.push(...(page?.data?.getTransactionsFeedView?.items || []));
            if (operations.length >= maxLimit || page?.data?.getTransactionsFeedView?.isEmptyByFilter || !cursor) {
                break;
            }
        }
        operations = operations.slice(0, maxLimit)
        for (const operation of operations) {
            if (operation?.statusCode !== "CLEAR") continue;
            const plain = operation?.title?.plain;
            const compound = operation?.title?.compound?.firstPart && operation?.title?.compound?.secondPart ? `${operation?.title?.compound?.firstPart}->${operation?.title?.compound?.secondPart}` : '';
            const account = accounts.find((account) => operation?.id?.includes(account.institution_domain?.replace(PREFIX_BANK, '')))
            rows.push({
                external_account_id: account?.institution_domain || `${PREFIX_BANK}${await generateHashAccount(yandexLogin, "CARD")}`,
                date: (new Date(operation?.date)).toISOString(),
                name: compound || plain || operation?.description || "",
                description: operation?.comment || operation?.description || compound || plain || operation?.rightSubTitle,
                notes: getFullNotice(
                    operation?.comment,
                    operation?.description,
                    compound,
                    plain,
                    operation?.rightSubTitle,
                ),
                currency: getCurrencyCodeMap(operation?.accountAmount?.currency?.name),
                nature: operation?.direction === "CREDIT" ? "income" : "expense",
                amount: parseFloat(operation?.amount?.money?.amount || "0.00"),
                external_id: operation?.id,
                source: PREFIX_BANK,
            })
        }
        const filtered = filterByConfig(rows, params.config);
        logItems("Яндекс-Банк", `операций разобрано (отфильтровано ${filtered.length} из ${rows.length})`, filtered);
        return [filtered, operations];
    },

    getConfigKeys: () => ['general-max-transactions', 'user-name', 'accounts', 'date-start', 'date-end'],

    getAccounts: async (params: ProviderParams): Promise<[Account[], any?]> => {
        const rows: Account[] = [];
        const yandexLogin = await getCookieByName('yandex_login', BASE_URL);
        if (!yandexLogin) return [rows, {}];
        await ensurePrepared();
        const homeProductsHash = operationHash("HomeProductsV2");
        const homeData = await getHomeProducts(homeProductsHash);
        const products = homeData?.data?.homeProducts?.products || [];
        // Обрабатываем только продукт CARD
        for (const product of products) {
            if (product.id === "CARD") {
                rows.push({
                    name: getAccountName(`Карта ${yandexLogin}`, params.config['user-name'], 'Яндекс-Банк'),
                    currency: getCurrencyCodeMap(product.value?.currency),
                    institution_name: yandexBankTransactions.baseUrlLogo(),
                    institution_domain: `${PREFIX_BANK}${await generateHashAccount(yandexLogin, "CARD")}`,
                    provider_code: 'yandex',
                    accountable_id: `CARD:${yandexLogin}`,
                    subtype: "checking",
                    accountable_type: "Depository",
                    notes: `Баланс: ${product.value?.amount} ${product.value?.currency}`,
                } as Account);
            }
        }
        const savingAccountHash = operationHash("SavingsAccountsList");
        const savingAccounts = await getSavingsAccountsList(savingAccountHash);
        const items = savingAccounts?.data?.bankUser?.savingsAccounts?.items || [];
        for (const item of items) {
            const isDeposit = item.productCode === "Deposit";
            const name = item.name || (isDeposit ? "Вклад" : "Накопительный счёт");
            const parts: string[] = [];
            if (item.interestRate) parts.push(`Ставка: ${item.interestRate}%`);
            if (item.accumulated?.amount) parts.push(`Начислено: ${item.accumulated.amount} ${item.accumulated.currency}`);
            if (item.expiresAt) parts.push(`До: ${item.expiresAt}`);
            const notes = parts.join(', ');
            rows.push({
                name: getAccountName(name, params.config['user-name'], 'Яндекс-Банк'),
                currency: getCurrencyCodeMap(item.balance?.currency),
                institution_name: yandexBankTransactions.getName(),
                institution_domain: `${PREFIX_BANK}${item.id}`,
                provider_code: 'yandex',
                accountable_id: item.id || '',
                subtype: "savings",
                accountable_type: "Depository",
                expiration_date: item.expiresAt || undefined,
                notes,
            } as Account);
        }
        const accountsFilter = params.config.accounts;
        const selectedSet = accountsFilter ? new Set(accountsFilter.split(',')) : null;
        const filtered = selectedSet ? rows.filter(r => selectedSet.has(r.institution_name)) : rows;
        logItems("Яндекс-Банк", `счетов разобрано (отфильтровано ${filtered.length} из ${rows.length})`, filtered, undefined);
        return [filtered, {homeData, savingAccounts}];
    }
}