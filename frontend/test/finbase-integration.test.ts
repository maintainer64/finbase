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
        currency: "RUB",
        institution_name: institutionName,
        institution_domain: institutionName,
        provider_code: "test",
        subtype: "checking",
        accountable_type: "Depository",
    };
}

function makeTransaction(institutionName: string, externalId: string): Transaction {
    return {
        external_account_id: institutionName,
        date: "2026-01-15",
        amount: 100,
        name: `Integration tx ${externalId}`,
        currency: "RUB",
        nature: "expense",
        external_id: externalId,
        source: "integration-test",
    };
}

async function countRecords(collection: string): Promise<number> {
    const json = await apiGet(`collections/${collection}/records?perPage=1`);
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

        const before = await countRecords("accounts");
        await service.createAccountsIfNotExists([makeAccount(domain)]);
        const after = await countRecords("accounts");

        expect(after).toBe(before);
    });

    it("external_id счёта = префиксованному ключу провайдера (institution_name)", async () => {
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
        const afterFirst = await countRecords("transactions");

        await service.createTransactionsIfNotExists(transactions);
        const afterSecond = await countRecords("transactions");

        expect(afterSecond).toBe(afterFirst);
    });

    it("созданная операция сохраняет external_id", async () => {
        const runId = Date.now().toString();
        const domain = `test-ext-${runId}`;
        const externalId = `single-${runId}`;
        const service = new FinbaseService(BASE_URL, token);
        await service.createAccountsIfNotExists([makeAccount(domain)]);
        await service.createTransactionsIfNotExists([makeTransaction(domain, externalId)]);

        const json = await apiGet(`collections/transactions/records?perPage=100&filter=${encodeURIComponent(`external_id = "${externalId}"`)}`);
        expect(json.items?.length).toBeGreaterThanOrEqual(1);
        expect(json.items?.[0]?.external_id).toBe(externalId);
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

        const json = await apiGet(`collections/transactions/records?perPage=100&filter=${encodeURIComponent(`external_id = "${externalId}"`)}`);
        const saved = json.items?.[0]?.date as string | undefined;
        expect(saved).toBeTruthy();
        // 23:30 +03:00 = 20:30 UTC — в записи должно быть время, а не полночь
        expect(saved).toContain("20:30:00");
        expect(saved).toContain("Z");
    });
});