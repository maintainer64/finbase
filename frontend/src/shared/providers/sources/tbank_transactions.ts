import {
    Account,
    ProviderAny,
    ProviderParams,
    Transaction
} from "../base";
import type {AccountType} from "@/shared/finbase/models";
import {getCookieByName, getMaxTransactions} from "@/shared/utils";
import {swFetch} from "@/shared/sw-fetch";
import {getAccountName, getCurrencyCodeMap, getFullNotice, logItems} from "@/shared/providers/utils";
import {logSync} from "@/shared/sync-log";

const PREFIX = "tbank_";
const URL = "https://www.tbank.ru/mybank/operations";
const BASE_URL = "https://www.tbank.ru/api/common/v1";
const BASE_URL_LOGO = "tbank.ru";

interface TBankAccountType {
    type: AccountType;
    accountable_type: string;
    isMine: boolean;
}

const ACCOUNT_TYPES = new Map<string, TBankAccountType>([
    ['Current', {
        accountable_type: 'Depository',
        type: 'checking',
        isMine: true,
    }],
    ['SharedCurrent', {
        accountable_type: 'Depository',
        type: 'checking',
        isMine: false,
    }],
    ['SharedCredit', {
        accountable_type: 'CreditCard',
        type: 'credit',
        isMine: false,
    }],
    ['Credit', {
        accountable_type: 'CreditCard',
        type: 'credit',
        isMine: true,
    }],
    ['Saving', {
        accountable_type: 'Depository',
        type: 'savings',
        isMine: true,
    }],
])

const DEFAULT_ACCOUNT_TYPE: TBankAccountType = {
    accountable_type: 'Depository',
    type: 'checking',
    isMine: true,
};

interface OperationParams {
    rangeStart?: string;
    rangeEnd?: string;
    accounts?: string;
}

async function getParamsOperation(params: OperationParams) {
    const sessionId = await getCookieByName('psid', URL);
    const requestOptions = {
        method: "GET",
        credentials: 'include',
        redirect: "follow"
    } as RequestInit;

    const now = new Date();

    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const searchParams = new URLSearchParams({
        appName: 'web',
        appVersion: '0.0.1',
        origin: 'web,ib5,platform',
        sessionid: sessionId,
        end: params.rangeEnd || lastDay.getTime(),
        start: params.rangeStart || firstDay.getTime(),
        accounts: params.accounts || '',
    } as any);
    const response = await swFetch(
        `${BASE_URL}/operations?${searchParams.toString()}`,
        requestOptions,
    );
    return await response.json();
}

async function getAccountsList() {
    const sessionId = await getCookieByName('psid', URL);
    const requestOptions = {
        method: "GET",
        credentials: 'include',
        redirect: "follow"
    } as RequestInit;
    const searchParams = new URLSearchParams({
        appName: 'web',
        appVersion: '0.0.1',
        origin: 'web,ib5,platform',
        sessionid: sessionId,
    } as any);
    const response = await swFetch(
        `${BASE_URL}/accounts_light_ib?${searchParams.toString()}`,
        requestOptions,
    );
    return await response.json();
}

export const tBankTransactions: ProviderAny = {
    getName: () => 'Т-Банк',
    getIcon: () => 'tbank.png',
    getUrl: () => URL,
    baseUrlLogo: () => BASE_URL_LOGO,

    getConfigKeys: () => ['date-start', 'date-end', 'general-max-transactions', 'user-name', 'accounts'],

    getTransactions: async (params: ProviderParams): Promise<[Transaction[], any?]> => {
        const rawAccounts = params.config.accounts ?? '';
        const operationSettings: OperationParams = {
            rangeStart: params.config['date-start'] ?? '',
            rangeEnd: params.config['date-end'] ?? '',
            accounts: rawAccounts.split(',').map(a => a.replace(PREFIX, '')).filter(Boolean).join(','),
        };
        console.log('Происходит выгрузка CSV файла с параметрами', operationSettings);
        const resp = await getParamsOperation(operationSettings);
        const rows: Transaction[] = [];
        const maxLimit = getMaxTransactions(params.config['general-max-transactions']);
        const payload = (resp?.payload || []).slice(0, maxLimit)
        payload?.map((operation: any) => {
            if (operation?.status !== "OK") return;
            const title = operation?.description || operation?.brand?.name || operation?.spendingCategory?.name || "";
            const absoluteAmount = Math.abs(Number(operation?.accountAmount?.value || 0));
            rows.push({
                account: `${PREFIX}${operation?.account || operation?.payment?.bankAccountId}`,
                category: "",
                tags: [],
                date: (new Date(operation?.operationTime?.milliseconds)).toISOString(),
                amount: operation?.type === "Credit" ? absoluteAmount : -absoluteAmount,
                currency: getCurrencyCodeMap(operation?.accountAmount?.currency?.name),
                note: getFullNotice(
                    title,
                    operation?.brand?.name,
                    operation?.spendingCategory?.name,
                    operation?.payment?.fieldsValues?.message,
                    operation?.spendingCategory?.name,
                    operation?.subcategory,
                    operation?.cardNumber,
                    operation?.card
                ),
                external_id: operation?.id || operation?.operationId?.value,
            })
        })
        return [rows, resp];
    },

    getAccounts: async (params: ProviderParams): Promise<[Account[], any?]> => {
        const resp = await getAccountsList();
        const rows: Account[] = [];

        const payload = resp?.payload;
        logItems('Т-Банк', "счетов в ответе", payload, resp);
        if (Array.isArray(payload) && payload.length > 0) {
            const types = payload.reduce((acc: Record<string, number>, a: any) => {
                const key = a?.accountType ?? "без типа";
                acc[key] = (acc[key] ?? 0) + 1;
                return acc;
            }, {});
            logSync(
                `Т-Банк: типы счетов — ` +
                Object.entries(types).map(([type, n]) => `${type}×${n}`).join(", "),
            );
        }

        resp?.payload?.map((account: any) => {
            if (!account?.id) {
                logSync(`Т-Банк: счёт без id пропущен (тип "${account?.accountType}")`, "warn");
                return;
            }
            if (!ACCOUNT_TYPES.has(account.accountType)) {
                logSync(
                    `Т-Банк: неизвестный тип счёта "${account.accountType}" (${account.id}) — пропускаем`,
                    "warn",
                );
                return;
            }
            const accountType = ACCOUNT_TYPES.get(account.accountType) ?? DEFAULT_ACCOUNT_TYPE;
            const notes = getFullNotice(
                account?.dueDate?.milliseconds
                    ? `Действует до: ${(new Date(account.dueDate.milliseconds)).toISOString().split('T')[0]}`
                    : "",
                account?.creditLimit?.value ? `Кредитный лимит: ${account.creditLimit.value}` : "",
                account?.currentMinimalPayment?.value ? `Минимальный платёж: ${account.currentMinimalPayment.value}` : "",
            );
            rows.push({
                name: getAccountName(account?.name || 'Счёт', params.config['user-name'], 'Т-Банк'),
                type: accountType.type,
                balance: 0,
                owner: "",
                currency: account?.currency?.name || '',
                external_id: `${PREFIX}${account?.id}`,
                provider_code: 'tbank',
                accountable_id: account?.id || '',
                accountable_type: accountType.accountable_type,
                notes,
                disabled_at: "",
                excluded_report_at: "",
            })
        });
        const accountsFilter = params.config.accounts;
        const selectedAccounts = accountsFilter ? new Set(accountsFilter.split(',')) : null;
        const filtered = selectedAccounts ? rows.filter(r => selectedAccounts.has(r.external_id)) : rows;
        logItems('Т-Банк', `счетов разобрано (отфильтровано ${filtered.length} из ${rows.length})`, filtered, undefined);
        return [filtered, resp];
    }
}
