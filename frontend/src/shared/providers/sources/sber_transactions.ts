import {Account, ProviderAny, ProviderParams, Transaction} from "../base";
import {swFetch} from "@/shared/sw-fetch";
import {getMaxTransactions} from "@/shared/utils";
import {getAccountName, getCurrencyCodeMap, getFullNotice, logItems, filterByConfig} from "@/shared/providers/utils";

const PREFIX = "sber_";
const URL = "https://online.sberbank.ru/app/main";
const BASE_URL_LOGO = "sberbank.ru";
const BASE_URL = "https://web-node4.online.sberbank.ru";

let cachedBaseUrl: string | null = null;

async function getBaseUrl(): Promise<string> {
    if (cachedBaseUrl) return cachedBaseUrl;

    try {
        const mainPageResp = await swFetch('https://online.sberbank.ru/app/main');
        const html = await mainPageResp.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const hosts = new Set<string>();
        doc.querySelectorAll('script[src]').forEach(script => {
            const src = script.getAttribute('src');
            if (src) {
                const match = src.match(/https:\/\/([^\\/]+\.online\.sberbank\.ru)/);
                if (match) hosts.add(match[1]);
            }
        });

        for (const host of hosts) {
            try {
                const resp = await swFetch(`https://${host}/main`);
                const text = await resp.text();
                const found = text.match(/"ufs\.block\.root\.url"\s*:\s*"([^"]+)"/);
                if (found) {
                    cachedBaseUrl = found[1].replace(/\/+$/, '');
                    return cachedBaseUrl;
                }
            } catch {
                continue;
            }
        }
    } catch { /* fallback to default */
    }

    cachedBaseUrl = BASE_URL;
    return cachedBaseUrl;
}

async function getAccountsMainScreen() {
    const baseUrl = await getBaseUrl();
    const requestOptions = {
        method: "POST",
        credentials: 'include',
        redirect: "follow",
        body: JSON.stringify({
            withData: true,
            forceUpdate: true,
        }),
        headers: {
            'x-requested-with': 'XMLHttpRequest',
            'content-type': 'application/json;charset=UTF-8'
        }
    } as RequestInit;
    const response = await swFetch(
        `${baseUrl}/main-screen/rest/v2/m1/web/section/meta`,
        requestOptions,
    );
    return await response.json();
}

async function getSberTransactions(limit: number = 100, offset: number = 0) {
    const baseUrl = await getBaseUrl();
    const requestOptions = {
        method: "POST",
        credentials: 'include',
        redirect: "follow",
        body: JSON.stringify({
            "paginationOffset": offset,
            "paginationSize": limit,
            "showHidden": false,
            "showNotTransactionBonuses": true,
            "showOpenBanking": true
        }),
        headers: {
            'x-requested-with': 'XMLHttpRequest',
            'content-type': 'application/json;charset=UTF-8'
        }
    } as RequestInit;
    const response = await swFetch(
        `${baseUrl}/uoh-bh/v1/operations/list`,
        requestOptions,
    );
    return await response.json();
}

interface MapAccount {
    id: string;
    number?: string;
    cardHolder?: string;
    type?: string;
    externalId: string;
}

async function fetchMapResourceToAccountId(): Promise<MapAccount[]> {
    const mapAccounts: MapAccount[] = [];
    const resp = await getAccountsMainScreen();
    const productData = resp?.body?.sections?.technicalSection?.sectionProductData;
    if (!productData) return mapAccounts;

    for (const acct of productData?.ctaccounts?.data || []) {
        mapAccounts.push({
            id: `ct-account:${acct.id}`,
            number: acct?.number,
            cardHolder: undefined,
            type: 'debit',
            externalId: `${PREFIX}ct-account:${acct.id}`
        });
    }

    for (const dep of productData.accounts.data) {
        mapAccounts.push({
            id: `account:${dep.id}`,
            number: dep?.number,
            cardHolder: undefined,
            type: 'debit',
            externalId: `${PREFIX}account:${dep.id}`,
        });
    }

    for (const card of productData?.cardsInWallet?.data || []) {
        const account = mapAccounts.find(
            (acc) => card.cardAccount === acc.number
        )
        mapAccounts.push({
            id: `card:${card.id}`,
            number: card?.cardAccount,
            cardHolder: card?.cardHolder,
            type: card?.type,
            externalId: account?.externalId || '',
        })
    }
    return mapAccounts
}


export const sberTransactions: ProviderAny = {
    getName: () => 'Сбер',
    getIcon: () => 'sber.png',
    getUrl: () => URL,
    baseUrlLogo: () => BASE_URL_LOGO,

    getConfigKeys: () => ['general-max-transactions', 'user-name', 'accounts', 'date-start', 'date-end'],

    getTransactions: async (params: ProviderParams): Promise<[Transaction[], any?]> => {
        const rows: Transaction[] = [];
        const maxLimit = getMaxTransactions(params.config['general-max-transactions']);
        let operations = [];
         
        while (true) {
            const page = await getSberTransactions(100, operations.length);
            const operationsPage = page?.body?.operations || [];
            operations.push(...operationsPage);
            if (operations.length >= maxLimit || operationsPage.length <= 0) {
                break;
            }
        }
        operations = operations.slice(0, maxLimit);
        const mapAccounts = await fetchMapResourceToAccountId();
        for (const operation of operations) {
            if (operation?.state?.category?.toLowerCase() !== "executed") continue;
            if (!operation?.externalId) {
                console.warn("Operation has not externalId", operation);
            }
            const isoDate = (operation?.date ? new Date(operation.date.replace(/^(\d{2})\.(\d{2})\.(\d{4})/, '$3-$2-$1') + "+03:00") : new Date()).toISOString();
            const base = {
                date: isoDate,
                amount: Math.abs(parseFloat(operation?.operationAmount?.amount || "0.00")),
                name: operation?.description || operation?.correspondent,
                description: operation?.correspondent,
                notes: getFullNotice(
                    operation?.classificationCode,
                    operation?.type,
                    operation?.form,
                    operation?.imageUrl,
                ),
                currency: getCurrencyCodeMap(operation?.operationAmount?.currencyCode),
                external_id: operation?.externalId,
                source: PREFIX,
                external_account_id: '',
                nature: parseFloat(operation?.operationAmount?.amount || "0.00") > 0 ? 'income' : 'expense',
            } as Transaction
            if (operation?.fromResource?.id) {
                const account = mapAccounts.find((acc) => acc.id === operation?.fromResource?.id) || mapAccounts?.[0]
                rows.push({
                    ...base,
                    external_account_id: account.externalId,
                    nature: 'expense',
                })
            }
            if (operation?.toResource?.id) {
                const account = mapAccounts.find((acc) => acc.id === operation?.toResource?.id) || mapAccounts?.[0]
                rows.push({
                    ...base,
                    external_id: operation?.fromResource?.id ? `${operation?.externalId}_transfer` : `${operation?.externalId}`,
                    external_account_id: account.externalId,
                    nature: 'income',
                })
            }
        }
        const filtered = filterByConfig(rows, params.config);
        logItems("Сбер", `операций разобрано (отфильтровано ${filtered.length} из ${rows.length})`, filtered, undefined);
        return [filtered, operations];
    },

    getAccounts: async (params: ProviderParams): Promise<[Account[], any?]> => {
        const rows: Account[] = [];
        const resp = await getAccountsMainScreen();
        const productData = resp?.body?.sections?.technicalSection?.sectionProductData;
        if (!productData) return [rows, {}];

        for (const acct of productData?.ctaccounts?.data || []) {
            rows.push({
                name: getAccountName(acct.name || 'Платёжный счёт', params.config['user-name'], 'Сбер'),
                currency: getCurrencyCodeMap(acct.balance?.currency?.code),
                institution_name: `${PREFIX}ct-account:${acct.id}`,
                institution_domain: BASE_URL_LOGO,
                provider_code: 'sber',
                accountable_id: acct.id || '',
                subtype: 'checking',
                accountable_type: 'Depository',
                notes: acct.number ? `Счёт: ${acct.number}` : undefined,
            } as Account);
        }

        for (const dep of productData?.accounts?.data || []) {
            const notesParts = [];
            if (dep.rate) notesParts.push(`Ставка: ${dep.rate}%`);
            if (dep.number) notesParts.push(`Счёт: ${dep.number}`);

            rows.push({
                name: getAccountName(dep.name || 'Вклад', params.config['user-name'], 'Сбер'),
                currency: getCurrencyCodeMap(dep.balance?.currency?.code),
                institution_name: `${PREFIX}account:${dep.id}`,
                institution_domain: BASE_URL_LOGO,
                provider_code: 'sber',
                accountable_id: dep.id || '',
                subtype: 'savings',
                accountable_type: 'Depository',
                expiration_date: dep.closeDate || undefined,
                notes: notesParts.join(';') || undefined,
            } as Account);
        }
        const accountsFilter = params.config.accounts;
        const selectedSet = accountsFilter ? new Set(accountsFilter.split(',')) : null;
        const filtered = selectedSet ? rows.filter(r => selectedSet.has(r.institution_name)) : rows;
        logItems("Сбер", `счетов разобрано (отфильтровано ${filtered.length} из ${rows.length})`, filtered, undefined);
        return [filtered, resp];
    },
}
