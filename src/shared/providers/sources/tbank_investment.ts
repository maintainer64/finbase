import {Account, ProviderAny, ProviderParams, Trade, TradeType} from "../base";
import {getMaxTransactions} from "@/shared/utils";
import {swFetch} from "@/shared/sw-fetch";
import {getAccountName, getCurrencyCodeMap, OpeningBalanceDateDefault, logItems, filterByConfig} from "@/shared/providers/utils";
import {TINVEST_API_PROD} from "@/shared/settings";

const PREFIX_BANK = "tbank_tinvest_";
const BASE_URL = "https://www.tbank.ru/invest/portfolios/events/";

// T-Invest OpenAPI по REST (gRPC-SDK @tinkoff/invest-js в расширении не работает).
// Адрес выбирается в настройках: боевой, песочница или свой (если у банка изменится).

const CONTRACT = "tinkoff.public.invest.api.contract.v1";

/** POST в T-Invest REST: тело — JSON, авторизация — Bearer-токен OpenAPI. */
async function invest<T>(
    apiUrl: string,
    service: string,
    method: string,
    token: string,
    body: unknown,
): Promise<T> {
    const base = (apiUrl || TINVEST_API_PROD).replace(/\/+$/, "");
    try {
        const response = await swFetch(`${base}/${CONTRACT}.${service}/${method}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(body ?? {}),
        } as RequestInit);
        return (await response.json()) as T;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // Хосты T-Invest отдают сертификат «Минцифры» (Russian Trusted Sub CA),
        // которого нет в доверенных корнях Chrome — запрос падает до нашего кода.
        throw new Error(
            `T-Invest (${service}/${method}): ${message}. ` +
            `Если ошибка про сертификат (ERR_CERT_AUTHORITY_INVALID) — ${base} использует ` +
            `сертификат Минцифры. Нужно установить «Российский доверенный корневой сертификат» ` +
            `в системе, иначе Chrome не пустит запрос.`,
            {cause: error},
        );
    }
}

/** MoneyValue/Quotation у T-Invest: units (целое) + nano (9 знаков). */
function quotationToNumber(value?: { units?: string | number; nano?: number }): number {
    if (!value) return 0;
    const units = Number(value.units ?? 0);
    const nano = Number(value.nano ?? 0);
    return units + nano / 1e9;
}

// Тип операции брокера -> тип сделки Sure. Незнакомые операции пропускаем.
const TRADE_TYPE_BY_OPERATION: Record<string, TradeType> = {
    // === ПОКУПКА / УВЕЛИЧЕНИЕ ПОЗИЦИИ ПО БУМАГАМ (buy) ===
    OPERATION_TYPE_BUY: "buy",
    OPERATION_TYPE_BUY_CARD: "buy",
    OPERATION_TYPE_BUY_MARGIN: "buy",
    OPERATION_TYPE_DELIVERY_BUY: "buy",
    OPERATION_TYPE_INPUT_SECURITIES: "buy", // Ввод ценных бумаг на счет

    // === ПРОДАЖА / УМЕНЬШЕНИЕ ПОЗИЦИИ ПО БУМАГАМ (sell) ===
    OPERATION_TYPE_SELL: "sell",
    OPERATION_TYPE_SELL_CARD: "sell",
    OPERATION_TYPE_SELL_MARGIN: "sell",
    OPERATION_TYPE_DELIVERY_SELL: "sell",
    OPERATION_TYPE_OUTPUT_SECURITIES: "sell", // Вывод ценных бумаг (списание из портфеля)

    // === ПОЛУЧЕНИЕ ДОХОДНОСТИ / ДИВИДЕНДЫ (dividend) ===
    OPERATION_TYPE_DIVIDEND: "dividend",
    OPERATION_TYPE_DIV_EXT: "dividend", // Внешние дивиденды
    OPERATION_TYPE_DIVIDEND_TRANSFER: "dividend", // Перевод дивидендов

    // === ПРОЦЕНТНЫЙ ДОХОД И КУПОНЫ (interest) ===
    OPERATION_TYPE_COUPON: "interest", // Купоны по облигациям
    OPERATION_TYPE_BOND_REPAYMENT: "interest", // Погашение облигаций (увеличивает кэш/доход)
    OPERATION_TYPE_BOND_REPAYMENT_FULL: "interest", // Полное погашение облигаций
    OPERATION_TYPE_OVER_INCOME: "interest", // Доход от овернайт размещений
    OPERATION_TYPE_DFA_REDEMPTION: "interest", // Погашение ЦФА (Цифровых финансовых активов)

    // === ВВОД СРЕДСТВ И ДЕПОЗИТЫ (deposit) ===
    OPERATION_TYPE_INPUT: "deposit", // Пополнение счета
    OPERATION_TYPE_INPUT_SWIFT: "deposit", // SWIFT-пополнение
    OPERATION_TYPE_INPUT_ACQUIRING: "deposit", // Пополнение через эквайринг
    OPERATION_TYPE_INP_MULTI: "deposit", // Мультивалютное пополнение
    OPERATION_TYPE_TRANS_IIS_BS: "deposit", // Перевод между ИИС и БС (зависит от стороны, обычно как ввод)
    OPERATION_TYPE_TRANS_BS_BS: "deposit", // Внутренний перевод между счетами (ввод на текущий)

    // === ВЫВОД СРЕДСТВ, КОМИССИИ И НАЛОГИ (withdrawal) ===
    OPERATION_TYPE_OUTPUT: "withdrawal", // Вывод средств
    OPERATION_TYPE_OUTPUT_SWIFT: "withdrawal", // SWIFT-вывод
    OPERATION_TYPE_OUTPUT_ACQUIRING: "withdrawal", // Вывод через эквайринг
    OPERATION_TYPE_OUT_MULTI: "withdrawal", // Мультивалютный вывод

    // Комиссии брокера и биржи
    OPERATION_TYPE_BROKER_FEE: "withdrawal",
    OPERATION_TYPE_SERVICE_FEE: "withdrawal",
    OPERATION_TYPE_MARGIN_FEE: "withdrawal", // Комиссия за маржинальную торговлю
    OPERATION_TYPE_SUCCESS_FEE: "withdrawal", // Комиссия за успех (автоследование/ДУ)
    OPERATION_TYPE_TRACK_MFEE: "withdrawal", // Комиссия за ведение стратегии (Management fee)
    OPERATION_TYPE_TRACK_PFEE: "withdrawal", // Комиссия за результат стратегии (Performance fee)
    OPERATION_TYPE_CASH_FEE: "withdrawal", // Комиссия за снятие наличных
    OPERATION_TYPE_OUT_FEE: "withdrawal", // Комиссия за вывод
    OPERATION_TYPE_OUT_STAMP_DUTY: "withdrawal", // Гербовый сбор / налог на сделку
    OPERATION_TYPE_ADVICE_FEE: "withdrawal", // Инвестиционное консультирование
    OPERATION_TYPE_OUTPUT_PENALTY: "withdrawal", // Штрафы
    OPERATION_TYPE_OVER_COM: "withdrawal", // Комиссия по овернайту
    OPERATION_TYPE_OTHER_FEE: "withdrawal", // Прочие комиссии

    // Налоги и налоговые корректировки
    OPERATION_TYPE_TAX: "withdrawal",
    OPERATION_TYPE_BOND_TAX: "withdrawal",
    OPERATION_TYPE_DIVIDEND_TAX: "withdrawal",
    OPERATION_TYPE_BENEFIT_TAX: "withdrawal", // Налог на материальную выгоду
    OPERATION_TYPE_TAX_CORRECTION: "withdrawal", // Налоговая корректировка
    OPERATION_TYPE_TAX_PROGRESSIVE: "withdrawal", // Прогрессивный налог (15%)
    OPERATION_TYPE_BOND_TAX_PROGRESSIVE: "withdrawal",
    OPERATION_TYPE_DIVIDEND_TAX_PROGRESSIVE: "withdrawal",
    OPERATION_TYPE_BENEFIT_TAX_PROGRESSIVE: "withdrawal",
    OPERATION_TYPE_TAX_CORRECTION_PROGRESSIVE: "withdrawal",
    OPERATION_TYPE_TAX_CORRECTION_COUPON: "withdrawal",

    // Налоги по РЕПО операциям
    OPERATION_TYPE_TAX_REPO: "withdrawal",
    OPERATION_TYPE_TAX_REPO_HOLD: "withdrawal",
    OPERATION_TYPE_TAX_REPO_REFUND: "withdrawal",
    OPERATION_TYPE_TAX_REPO_HOLD_PROGRESSIVE: "withdrawal",
    OPERATION_TYPE_TAX_REPO_REFUND_PROGRESSIVE: "withdrawal",
};

interface InvestAccount {
    id: string;
    name?: string;
    type?: string;
    status?: string;
    openedDate?: string;
}

interface InvestOperation {
    id?: string;
    type?: string;
    operationType?: string;
    date?: string;
    instrumentUid?: string;
    figi?: string;
    name?: string;
    ticker?: string;
    description?: string;
    state?: string;
    quantity?: string | number;
    payment?: { units?: string; nano?: number; currency?: string };
    price?: { units?: string; nano?: number; currency?: string };
}

/** Токен обязателен: без него лучше явная ошибка, чем пустая выгрузка. */
function requireToken(params: ProviderParams): string {
        const token = params.config["tbank-invest-token"];
    if (!token) {
        throw new Error(
            "Не задан токен T-Invest OpenAPI. Укажите его в настройках расширения " +
            "(Т-Инвестиции → «Токен для OpenAPI»).",
        );
    }
    return token;
}

/** Кэш uid инструмента -> тикер, чтобы не дёргать справочник на каждую операцию. */
const resolveTickerCache = new Map<string, string>();

async function resolveTicker(
    id: string | undefined,
    idType: "INSTRUMENT_ID_TYPE_UID" | "INSTRUMENT_ID_TYPE_FIGI" | "INSTRUMENT_ID_TYPE_TICKER",
    apiUrl: string,
    token: string,
): Promise<string> {
    if (!id) return "";
    const key = `${idType}:${id}`
    const cached = resolveTickerCache.get(key);
    if (cached !== undefined) return cached;
    try {
        const data = await invest<{ instrument?: { ticker?: string } }>(
            apiUrl,
            "InstrumentsService",
            "GetInstrumentBy",
            token,
            {idType, id},
        );
        const ticker = data?.instrument?.ticker ?? "";
        resolveTickerCache.set(key, ticker);
        return ticker;
    } catch (error) {
        console.warn(`T-Invest: не удалось получить тикер для ${key}`, error);
        resolveTickerCache.set(key, "");
        return "";
    }
}

export const tbankInvestment: ProviderAny = {
    getName: () => "Т-Инвестиции",

    getKind: () => "investment" as const,

    // Провайдер ходит по токену OpenAPI, а не по кукам вкладки
    getConfigKeys: () => ['tbank-invest-token', 'tbank-invest-api-url', 'general-max-transactions', 'user-name', 'accounts', 'date-start', 'date-end'],

    getIcon: () => "tbank.png",

    baseUrlLogo: () => "tbank.ru",

    getUrl: () => BASE_URL,

    getAccounts: async (params: ProviderParams): Promise<[Account[], any?]> => {
        console.log(params);
        const rows: Account[] = [];
        const token = requireToken(params);
        const apiUrl = params.config["tbank-invest-api-url"] || TINVEST_API_PROD;

        const data = await invest<{ accounts?: InvestAccount[] }>(
            apiUrl,
            "UsersService",
            "GetAccounts",
            token,
            {},
        );
        const accounts = data?.accounts ?? [];

        for (const account of accounts) {
            rows.push({
                name: getAccountName(
                    account.name || "Брокерский счёт",
                    params.config['user-name'],
                    tbankInvestment.getName(),
                ),
                currency: "RUB", // брокерский счёт мультивалютный; базовая валюта — рубль
                opening_balance_date: (account.openedDate
                        ? new Date(account.openedDate)
                        : OpeningBalanceDateDefault
                ).toISOString().split("T")[0],
                institution_name: `${PREFIX_BANK}${account.id}`,
                institution_domain: tbankInvestment.baseUrlLogo(),
                subtype: "",
                accountable_type: "Investment",
                notes: [account.type, account.status].filter(Boolean).join(", "),
            } as Account);
        }
        const accountsFilter = params.config.accounts;
        const selectedSet = accountsFilter ? new Set(accountsFilter.split(',')) : null;
        const filteredRows = selectedSet ? rows.filter(r => selectedSet.has(r.institution_name)) : rows;
        logItems("Т-Инвестиции", `счетов получено (отфильтровано ${filteredRows.length} из ${rows.length})`, filteredRows, undefined);
        return [filteredRows, accounts];
    },

    getTrades: async (params: ProviderParams): Promise<[Trade[], any?]> => {
        const rows: Trade[] = [];
        const token = requireToken(params);
        const apiUrl = params.config["tbank-invest-api-url"] || TINVEST_API_PROD;

        const [accounts] = await tbankInvestment.getAccounts?.(params) || [[], undefined];
        const maxLimit = getMaxTransactions(params.config['general-max-transactions']);
        const rawOperations: InvestOperation[] = [];

        for (const account of accounts) {
            const accountId = account.institution_name.replace(PREFIX_BANK, "");
            let cursor: string | undefined = undefined;

            while (rows.length < maxLimit) {
                const page: any = await invest(
                    apiUrl,
                    "OperationsService",
                    "GetOperationsByCursor",
                    token,
                    {accountId, cursor, limit: 1000},
                );
                const items: InvestOperation[] = page?.items ?? [];
                if (items.length === 0) break;

                for (const operation of items) {
                    if (operation?.state !== "OPERATION_STATE_EXECUTED") continue;
                    rawOperations.push(operation);
                    const opType = operation.operationType ?? operation.type ?? "";
                    const tradeType = TRADE_TYPE_BY_OPERATION[opType];
                    if (!tradeType) {
                        logItems("Т-Инвестиции", "неизвестный тип операции", opType);
                        console.log(operation);
                        continue;
                    }
                    // Sure требует идентификатор бумаги для buy/sell. Если справочник
                    // не отдал тикер — берём figi/uid, чтобы сделка не потерялась.
                    const ticker = await resolveTicker(operation.instrumentUid, "INSTRUMENT_ID_TYPE_UID", apiUrl, token) ||
                        await resolveTicker(operation.figi, "INSTRUMENT_ID_TYPE_FIGI", apiUrl, token) ||
                        await resolveTicker(operation.ticker, "INSTRUMENT_ID_TYPE_TICKER", apiUrl, token) || operation?.ticker
                        || operation.figi || operation.instrumentUid || "";
                    const payment = Math.abs(quotationToNumber(operation.payment));
                    const currency = getCurrencyCodeMap(
                        (operation.payment?.currency ?? operation.price?.currency ?? "rub").toUpperCase(),
                    );
                    const genExtId = () => {
                        const raw = operation.date ?? "";
                        const ts = raw.replace(/[^0-9T:-]/g, "").slice(0, 19);
                        return `${PREFIX_BANK}gen_${ts}_${opType}_${payment}_${currency}`;
                    };
                    const trade: Trade = {
                        external_account_id: account.institution_name,
                        date: operation.date ?? '',
                        type: tradeType,
                        ticker,
                        name: operation?.name || operation?.description || opType,
                        currency,
                        country_code: "RU",
                        external_id: operation.id || genExtId(),
                        source: PREFIX_BANK,
                        dataProviders: ["moex_public", "tinkoff_invest"]
                    };
                    if (tradeType === "buy" || tradeType === "sell") {
                        trade.qty = Math.abs(Number(operation.quantity ?? 0));
                        trade.price = Math.max(quotationToNumber(operation.price), 0.0000001);
                    } else {
                        trade.amount = payment;
                    }
                    rows.push(trade);
                    if (rows.length >= maxLimit) break;
                }

                cursor = page?.nextCursor;
                if (!cursor || !page?.hasNext) break;
            }
        }

        logItems("Т-Инвестиции", "операций получено", rawOperations);
        const filtered = filterByConfig(rows, params.config);
        logItems("Т-Инвестиции", `сделок разобрано (отфильтровано ${filtered.length} из ${rows.length})`, filtered);
        return [filtered.slice(0, maxLimit), rawOperations];
    },
};
