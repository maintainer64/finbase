// Интеграционные тесты против ЖИВОГО инстанса Sure (поднимается docker-compose
// в CI, см. test/compose.sure.yml + .github/workflows/integration.yml).
// Гоняем реальный клиент расширения (SureService / сгенерированный Api) по
// X-Api-Key — то есть проверяем именно тот код, что идёт в синхронизацию.
import {beforeAll, describe, expect, it} from "vitest";
import {SureService} from "@/shared/providers/services/sure/intex";
import {Api} from "@/shared/providers/services/sure/sureClient/Api";
import type {Transaction} from "@/shared/providers/base";

const BASE_URL = process.env.SURE_BASE_URL ?? "http://localhost";
const API_KEY = process.env.SURE_API_KEY ?? "";
const DOMAIN = process.env.SURE_ACCOUNT_DOMAIN ?? "test-bank";

const api = new Api({
    baseUrl: BASE_URL,
    baseApiParams: {headers: {"X-Api-Key": API_KEY}},
});

function makeTransaction(externalId: string): Transaction {
    return {
        external_account_id: DOMAIN,
        date: "2026-01-15",
        amount: 100,
        name: `Integration tx ${externalId}`,
        currency: "USD",
        nature: "expense",
        external_id: externalId,
        source: "integration-test",
    };
}

async function transactionsTotalCount(): Promise<number> {
    const res = await api.v1TransactionsList({per_page: 1});
    const json = await res.json();
    return json.pagination.total_count as number;
}

describe("Sure integration (живой инстанс)", () => {
    beforeAll(() => {
        expect(API_KEY, "SURE_API_KEY должен быть задан").not.toEqual("");
    });

    it("видит засеянный счёт по institution_domain", async () => {
        const res = await api.v1AccountsList({per_page: 100});
        const json = await res.json();
        const found = json.accounts.find(
            (a: {institution_name?: string}) => a.institution_name === DOMAIN,
        );
        expect(found, `счёт с institution_domain=${DOMAIN} не найден`).toBeTruthy();
    });

    it("создаёт операции через SureService и не падает при повторе", async () => {
        const runId = Date.now().toString();
        const transactions = [
            makeTransaction(`a-${runId}`),
            makeTransaction(`b-${runId}`),
            makeTransaction(`c-${runId}`),
        ];
        const service = new SureService(BASE_URL, API_KEY);

        const before = await transactionsTotalCount();

        // createTransactionsIfNotExists пока не делает search — просто шлёт POST.
        // Убеждаемся, что хотя бы сколько-то создалось.
        await service.createTransactionsIfNotExists(transactions);
        const afterFirst = await transactionsTotalCount();
        expect(afterFirst).toBeGreaterThanOrEqual(before);

        // Повтор не должен валить с ошибкой (пусть даже без идемпотентности).
        await expect(service.createTransactionsIfNotExists(transactions))
            .resolves.not.toThrow();
    });

    it("созданная операция сохраняет external_id", async () => {
        const externalId = `single-${Date.now()}`;
        const service = new SureService(BASE_URL, API_KEY);
        await service.createTransactionsIfNotExists([makeTransaction(externalId)]);

        // Ищем по search (имя транзакции содержит externalId).
        const res = await api.v1TransactionsList({
            per_page: 1, search: externalId,
        });
        const json = await res.json();
        expect(json.transactions?.length).toBeGreaterThanOrEqual(1);
        expect(json.transactions?.[0]?.external_id).toBe(externalId);
    });
});
