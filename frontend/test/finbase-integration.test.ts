// Интеграционные тесты против ЖИВОГО инстанса PocketBase (localhost:8090,
// каталог /Users/gubanov/golang/finbase). Гоняем реальный клиент расширения
// (FinbaseService) с API-токеном, выпущенным суперюзером (impersonate) — то есть
// тот же код и тот же механизм доступа, что в синхронизации.
import {beforeAll, describe, expect, it} from "vitest";
import {FinbaseService} from "@/shared/providers/services/finbase/finbase-service";
import type {Account, Transaction} from "@/shared/providers/base";

const BASE_URL = process.env.FINBASE_URL ?? "http://127.0.0.1:8090";
const SUPERUSER_EMAIL = process.env.FINBASE_SUPERUSER_EMAIL ?? "admin@finbase.local";
const SUPERUSER_PASSWORD = process.env.FINBASE_SUPERUSER_PASSWORD ?? "FinbaseAdmin2026!";
const TARGET_EMAIL = process.env.FINBASE_EMAIL ?? "test@finbase.local";

let token = "";

async function apiGet(path: string): Promise<any> {
    const res = await fetch(`${BASE_URL}/api/${path}`, {
        headers: {Authorization: `Bearer ${token}`},
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`${path}: ${JSON.stringify(json)}`);
    return json;
}

async function apiGetUsers(superToken: string): Promise<{items: {id: string; email: string}[]}> {
    const res = await fetch(
        `${BASE_URL}/api/collections/users/records?perPage=200&filter=${encodeURIComponent(`email = "${TARGET_EMAIL}"`)}`,
        {headers: {Authorization: `Bearer ${superToken}`}},
    );
    const json = await res.json();
    if (!res.ok) throw new Error(`users list: ${JSON.stringify(json)}`);
    return json;
}

function makeAccount(institutionName: string): Account {
    return {
        name: `Интеграционный счёт`,
        type: "checking",
        balance: 0,
        owner: "",
        currency: "RUB",
        external_id: institutionName,
        provider_code: "test",
        accountable_type: "Depository",
        accountable_id: institutionName,
        notes: "",
        disabled_at: "",
        excluded_report_at: "",
    };
}

function makeTransaction(institutionName: string, externalId: string): Transaction {
    return {
        account: institutionName,
        category: "",
        tags: [],
        date: "2026-01-15",
        amount: -100,
        currency: "RUB",
        note: `Integration tx ${externalId}`,
        external_id: externalId,
    };
}

async function countRecordsByExternalId(collection: string, externalId: string): Promise<number> {
    const filter = encodeURIComponent(`external_id = "${externalId}"`);
    const json = await apiGet(`collections/${collection}/records?perPage=1&filter=${filter}`);
    return json.totalItems as number;
}

describe("Finbase integration (живой PocketBase)", () => {
    beforeAll(async () => {
        // Логинимся суперюзером и выпускаем долгий токен для тестового пользователя
        // (тот же процесс, что в scripts/issue-token.ts).
        const superRes = await fetch(`${BASE_URL}/api/collections/_superusers/auth-with-password`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({identity: SUPERUSER_EMAIL, password: SUPERUSER_PASSWORD}),
        });
        expect(superRes.ok, "FINBASE_SUPERUSER_EMAIL/FINBASE_SUPERUSER_PASSWORD не подходят").toBe(true);
        const superToken = (await superRes.json()).token;

        const usersRes = await apiGetUsers(superToken);
        const user = usersRes.items[0];
        expect(user, `Пользователь ${TARGET_EMAIL} не найден`).toBeTruthy();

        const impRes = await fetch(`${BASE_URL}/api/collections/users/impersonate/${user.id}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${superToken}`,
            },
            body: JSON.stringify({duration: 31536000}),
        });
        expect(impRes.ok).toBe(true);
        token = (await impRes.json()).token;
        expect(token).not.toBe("");
    });

    it(" создаёт счёт и не дублирует при повторе", async () => {
        const domain = `test-${Date.now()}`;
        const service = new FinbaseService(BASE_URL, token);
        await service.createAccountsIfNotExists([makeAccount(domain)]);

        const before = await countRecordsByExternalId("accounts", domain);
        await service.createAccountsIfNotExists([makeAccount(domain)]);
        const after = await countRecordsByExternalId("accounts", domain);

        expect(before).toBe(1);
        expect(after).toBe(before);
    });

    it("external_id счёта = префиксованному ключу провайдера", async () => {
        const domain = `test-ext-${Date.now()}`;
        const service = new FinbaseService(BASE_URL, token);
        await service.createAccountsIfNotExists([makeAccount(domain)]);

        const json = await apiGet(`collections/accounts/records?perPage=100&filter=${encodeURIComponent(`external_id = "${domain}"`)}`);
        expect(json.items?.length).toBeGreaterThanOrEqual(1);
        expect(json.items?.[0]?.external_id).toBe(domain);
        expect(json.items?.[0]?.name).toBe("Интеграционный счёт");
        expect(json.items?.[0]?.provider_code).toBe("test");
    });

    it("создаёт операции и не дублирует при повторе", async () => {
        const runId = Date.now().toString();
        const domain = `test-tx-${runId}`;
        const service = new FinbaseService(BASE_URL, token);
        await service.createAccountsIfNotExists([makeAccount(domain)]);

        const transactions = [
            makeTransaction(domain, `a-${runId}`),
            makeTransaction(domain, `b-${runId}`),
        ];

        await service.createTransactionsIfNotExists(transactions);
        const afterFirst = await Promise.all(
            transactions.map(transaction => countRecordsByExternalId("transactions", `test_${transaction.external_id}`)),
        );

        await service.createTransactionsIfNotExists(transactions);
        const afterSecond = await Promise.all(
            transactions.map(transaction => countRecordsByExternalId("transactions", `test_${transaction.external_id}`)),
        );

        expect(afterFirst).toEqual([1, 1]);
        expect(afterSecond).toEqual(afterFirst);
    });

    it("созданная операция сохраняет external_id", async () => {
        const runId = Date.now().toString();
        const domain = `test-ext-${runId}`;
        const externalId = `single-${runId}`;
        const service = new FinbaseService(BASE_URL, token);
        await service.createAccountsIfNotExists([makeAccount(domain)]);
        await service.createTransactionsIfNotExists([makeTransaction(domain, externalId)]);

        const namespacedExternalId = `test_${externalId}`;
        const json = await apiGet(`collections/transactions/records?perPage=100&filter=${encodeURIComponent(`external_id = "${namespacedExternalId}"`)}`);
        expect(json.items?.length).toBeGreaterThanOrEqual(1);
        expect(json.items?.[0]?.external_id).toBe(namespacedExternalId);
    });

    it("даты сохраняются как полный ISO (дата+время, UTC)", async () => {
        const runId = Date.now().toString();
        const domain = `test-date-${runId}`;
        const externalId = `date-${runId}`;
        const service = new FinbaseService(BASE_URL, token);
        await service.createAccountsIfNotExists([makeAccount(domain)]);

        // Локальное время с офсетом -> в PB должно уйти как $время$ в UTC
        const tx = makeTransaction(domain, externalId);
        tx.date = "2026-03-05T23:30:00+03:00";
        await service.createTransactionsIfNotExists([tx]);

        const json = await apiGet(`collections/transactions/records?perPage=100&filter=${encodeURIComponent(`external_id = "test_${externalId}"`)}`);
        const saved = json.items?.[0]?.date as string | undefined;
        expect(saved).toBeTruthy();
        // 23:30 +03:00 = 20:30 UTC — в записи должно быть время, а не полночь
        expect(saved).toContain("20:30:00");
        expect(saved).toContain("Z");
    });

    it("ищет ручные операции и сохраняет найденную автодетектором пару", async () => {
        const runId = Date.now().toString();
        const sourceDomain = `manual-source-${runId}`;
        const targetDomain = `manual-target-${runId}`;
        const service = new FinbaseService(BASE_URL, token);
        await service.createAccountsIfNotExists([makeAccount(sourceDomain), makeAccount(targetDomain)]);
        const accounts = await service.getAccountsList();
        const source = accounts.find(account => account.external_id === sourceDomain);
        const target = accounts.find(account => account.external_id === targetDomain);
        expect(source).toBeTruthy();
        expect(target).toBeTruthy();

        const date = "2026-08-25T10:00:00.000Z";
        const outflow = await service.createRecord("transactions", {
            account: source!.id,
            category: "",
            tags: [],
            date,
            amount: -777,
            currency: "RUB",
            note: `Ручной перевод ${runId}`,
            external_id: `test_manual_out_${runId}`,
        });
        const inflow = await service.createRecord("transactions", {
            account: target!.id,
            category: "",
            tags: [],
            date,
            amount: 777,
            currency: "RUB",
            note: `Ручной перевод ${runId}`,
            external_id: `test_manual_in_${runId}`,
        });

        const found = await service.searchTransactions(runId, "income");
        expect(found.map(item => item.id)).toContain(inflow.id);

        const transfer = await service.saveTransfer({
            inflow_transaction: inflow.id,
            outflow_transaction: outflow.id,
            status: "accepted",
            notes: "Создано из интерфейса",
        });
        expect(transfer.status).toBe("accepted");
    });
});
