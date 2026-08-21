import {afterEach, describe, expect, it, vi} from "vitest";
import {FinbaseService} from "@/shared/providers/services/finbase/finbase-service";
import {buildDataFilter} from "@/pages/data/data-filter";
import {COLLECTIONS} from "@/pages/data/finbase-schema";

const token = "aaa.bbb.ccc";

afterEach(() => vi.unstubAllGlobals());

describe("пагинация Finbase", () => {
    it("запрашивает только одну страницу переводов с серверным фильтром", async () => {
        const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({
            page: 1,
            perPage: 20,
            totalItems: 125,
            totalPages: 7,
            items: [],
        }), {status: 200, headers: {"Content-Type": "application/json"}}));
        vi.stubGlobal("fetch", fetchMock);

        const service = new FinbaseService("https://finbase.example", token);
        const result = await service.getTransfersPage(1, 20, "pending");

        expect(result.totalItems).toBe(125);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const url = new URL(String(fetchMock.mock.calls[0][0]));
        expect(url.searchParams.get("page")).toBe("1");
        expect(url.searchParams.get("perPage")).toBe("20");
        expect(url.searchParams.get("filter")).toBe('status = "pending"');
    });

    it("разбивает запрос деталей операций на ограниченные пачки", async () => {
        const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({
            page: 1,
            perPage: 40,
            totalItems: 0,
            totalPages: 0,
            items: [],
        }), {status: 200, headers: {"Content-Type": "application/json"}}));
        vi.stubGlobal("fetch", fetchMock);

        const service = new FinbaseService("https://finbase.example", token);
        await service.getTransactionsByIds(Array.from({length: 85}, (_, index) => `transaction-${index}`));

        expect(fetchMock).toHaveBeenCalledTimes(3);
        const perPages = fetchMock.mock.calls.map(call => new URL(String(call[0])).searchParams.get("perPage"));
        expect(perPages).toEqual(["40", "40", "5"]);
    });

    it("передаёт период на сервер при загрузке статистики счёта", async () => {
        const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({
            page: 1,
            perPage: 200,
            totalItems: 0,
            totalPages: 0,
            items: [],
        }), {status: 200, headers: {"Content-Type": "application/json"}}));
        vi.stubGlobal("fetch", fetchMock);

        const service = new FinbaseService("https://finbase.example", token);
        await service.getDailyFlows(["account-1"], "2026-08-01", "2026-08-31");

        const url = new URL(String(fetchMock.mock.calls[0][0]));
        expect(url.searchParams.get("filter")).toBe(
            'account = "account-1" && day >= "2026-08-01" && day <= "2026-08-31"',
        );
    });
});

describe("серверные фильтры таблицы данных", () => {
    it("собирает поиск, пустые связи, период и направление операции", () => {
        const transactions = COLLECTIONS.find(item => item.collection === "transactions")!;
        expect(buildDataFilter(
            transactions,
            "кофе",
            {category: "__empty_relation__", tags: "__empty_relation__"},
            "2026-08-01",
            "2026-08-31",
            "expense",
        )).toBe(
            '(note ~ "кофе") && category = "" && tags:length = 0'
            + ' && date >= "2026-08-01T00:00:00.000Z"'
            + ' && date < "2026-09-01T00:00:00.000Z" && amount < 0',
        );
    });
});

describe("запись операций Finbase", () => {
    it("добавляет provider_code к external_id и разрешает нулевую сумму", async () => {
        const created: Record<string, unknown>[] = [];
        const accounts = [
            {id: "account-tbank", external_id: "tbank-account", provider_code: "tbank"},
            {id: "account-sber", external_id: "sber-account", provider_code: "sber"},
        ];
        const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
            const url = new URL(String(input));
            if (url.pathname.endsWith("/collections/accounts/records")) {
                return new Response(JSON.stringify({
                    page: 1,
                    perPage: 200,
                    totalItems: accounts.length,
                    totalPages: 1,
                    items: accounts,
                }), {status: 200, headers: {"Content-Type": "application/json"}});
            }
            if (init?.method === "POST") {
                created.push(JSON.parse(String(init.body)) as Record<string, unknown>);
                return new Response(JSON.stringify({id: `transaction-${created.length}`}), {
                    status: 200,
                    headers: {"Content-Type": "application/json"},
                });
            }
            return new Response(JSON.stringify({
                page: 1,
                perPage: 200,
                totalItems: 0,
                totalPages: 0,
                items: [],
            }), {status: 200, headers: {"Content-Type": "application/json"}});
        });
        vi.stubGlobal("fetch", fetchMock);

        const service = new FinbaseService("https://finbase.example", token);
        await service.createTransactionsIfNotExists([
            {
                account: "tbank-account",
                category: "",
                tags: [],
                date: "2026-08-21T12:00:00Z",
                amount: 0,
                currency: "RUB",
                note: "Нулевая операция",
                external_id: "same-id",
            },
            {
                account: "sber-account",
                category: "",
                tags: [],
                date: "2026-08-21T12:00:00Z",
                amount: -100,
                currency: "RUB",
                note: "Расход",
                external_id: "same-id",
            },
        ]);

        expect(created).toHaveLength(2);
        expect(created[0]).toMatchObject({external_id: "tbank_same-id", amount: 0});
        expect(created[1]).toMatchObject({external_id: "sber_same-id", amount: -100});
    });
});
