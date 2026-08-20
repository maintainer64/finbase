// Интеграционные тесты против ЖИВОГО инстанса PocketBase (см.
// finbase-integration.test.ts — там общая авторизация через impersonate).
// Здесь проверяем view-коллекции для страницы «Статистика» (единая миграция 20260820_finbase.go):
// daily_flows (потоки по дням + накопленный баланс) и category_sums (итоги по категориям).
import {beforeAll, describe, expect, it} from "vitest";
import {FinbaseService} from "@/shared/providers/services/finbase/finbase-service";
import type {Account, Transaction} from "@/shared/providers/base";

const BASE_URL = process.env.FINBASE_URL ?? "http://127.0.0.1:8090";
const SUPERUSER_EMAIL = process.env.FINBASE_SUPERUSER_EMAIL ?? "admin@finbase.local";
const SUPERUSER_PASSWORD = process.env.FINBASE_SUPERUSER_PASSWORD ?? "FinbaseAdmin2026!";
const TARGET_EMAIL = process.env.FINBASE_EMAIL ?? "test@finbase.local";

let token = "";

async function pbRequest(path: string, init?: RequestInit & {token?: string}): Promise<{ok: boolean; status: number; json: any}> {
    const res = await fetch(`${BASE_URL}/api/${path}`, {
        ...init,
        headers: {
            "Content-Type": "application/json",
            ...(init?.token ? {Authorization: `Bearer ${init.token}`} : {}),
            ...(init?.headers ?? {}),
        },
    });
    const json = await res.json();
    return {ok: res.ok, status: res.status, json};
}

const account = (domain: string): Account => ({
    name: "Тест-счёт",
    currency: "RUB",
    institution_name: domain,
    institution_domain: domain,
    provider_code: "test",
    subtype: "checking",
    accountable_type: "Depository",
});

describe("Финансовая статистика (view-коллекции)", () => {
    beforeAll(async () => {
        const superRes = await fetch(`${BASE_URL}/api/collections/_superusers/auth-with-password`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({identity: SUPERUSER_EMAIL, password: SUPERUSER_PASSWORD}),
        });
        expect(superRes.ok).toBe(true);
        const superToken = (await superRes.json()).token;

        const usersRes = await pbRequest(
            `collections/users/records?perPage=200&filter=${encodeURIComponent(`email = "${TARGET_EMAIL}"`)}`,
            {token: superToken},
        );
        const user = usersRes.json.items?.[0];
        expect(user, `Пользователь ${TARGET_EMAIL} не найден`).toBeTruthy();

        const impRes = await pbRequest(`collections/users/impersonate/${user.id}`, {
            method: "POST",
            token: superToken,
            body: JSON.stringify({duration: 31536000}),
        });
        expect(impRes.ok).toBe(true);
        token = impRes.json.token as string;
        expect(token).not.toBe("");
    });

    it("daily_flows: агрегирует потоки по дням и считает накопленный баланс", async () => {
        const runId = Date.now().toString();
        const domain = `stats-flow-${runId}`;
        const service = new FinbaseService(BASE_URL, token);

        await service.createAccountsIfNotExists([account(domain)]);
        const acc = (await service.getAccountsList()).find(a => a.external_id === domain);
        expect(acc).toBeTruthy();

        const tx: Transaction = {
            external_account_id: domain,
            date: "2026-07-01T12:00:00.000Z",
            amount: 500,
            name: "Пополнение",
            currency: "RUB",
            nature: "income",
            external_id: `stats-in-${runId}`,
            source: "integration-stats",
        };
        await service.createTransactionsIfNotExists([
            tx,
            {...tx, external_id: `stats-out-${runId}`, amount: 200, nature: "expense", date: "2026-07-03T12:00:00.000Z"},
        ]);

        const flows = await service.getDailyFlows([acc!.id]);
        const byDay = new Map(flows.map(f => [f.day, f]));
        const day1 = byDay.get("2026-07-01");
        const day3 = byDay.get("2026-07-03");

        expect(day1?.delta).toBe(500);
        expect(day1?.running).toBe(500);
        expect(day3?.delta).toBe(-200);
        expect(day3?.running).toBe(300);
        expect(day1?.currency).toBe("RUB");
    });

    it("category_sums: возвращает итоги по размеченным категориям", async () => {
        const runId = Date.now().toString();
        const domain = `stats-cat-${runId}`;

        // создаём категорию напрямую через API (расширение категории не создаёт)
        const catRes = await pbRequest("collections/categories/records", {
            method: "POST",
            token,
            body: JSON.stringify({name: `Категория-${runId}`, color: "#4caf50", lucide_icon: "tag"}),
        });
        expect(catRes.ok).toBe(true);
        const catId = catRes.json.id;

        const service = new FinbaseService(BASE_URL, token);
        await service.createAccountsIfNotExists([account(domain)]);
        const acc = (await service.getAccountsList()).find(a => a.external_id === domain);
        expect(acc).toBeTruthy();

        const tx: Transaction = {
            external_account_id: domain,
            date: "2026-07-05T12:00:00.000Z",
            amount: 100,
            name: "Покупка",
            currency: "RUB",
            nature: "expense",
            external_id: `stats-cat-tx-${runId}`,
            source: "integration-stats",
        };
        await service.createTransactionsIfNotExists([tx]);

        // размечаем созданную операцию категорией (как это делает администратор в UI PB)
        const txList = await pbRequest(`collections/transactions/records?perPage=200&filter=${encodeURIComponent(`external_id = "stats-cat-tx-${runId}"`)}`, {token});
        const savedTx = txList.json.items?.[0];
        expect(savedTx).toBeTruthy();
        const patch = await pbRequest(`collections/transactions/records/${savedTx.id}`, {
            method: "PATCH",
            token,
            body: JSON.stringify({category: catId}),
        });
        expect(patch.ok).toBe(true);

        const sums = await service.getCategorySums();
        const mine = sums.find(s => s.category === catId);
        expect(mine).toBeTruthy();
        expect(mine!.name).toBe(`Категория-${runId}`);
        expect(mine!.color).toBe("#4caf50");
        expect(mine!.total).toBe(-100);
    });
});
