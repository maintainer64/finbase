import {beforeAll, describe, expect, it} from "vitest";
import {SureService} from "@/shared/providers/services/sure/intex";
import {Api} from "@/shared/providers/services/sure/sureClient/Api";
import type {Trade, Transaction} from "@/shared/providers/base";

const BASE_URL = process.env.SURE_BASE_URL ?? "http://localhost";
const API_KEY = process.env.SURE_API_KEY ?? "";
const DOMAIN = process.env.SURE_INVEST_DOMAIN ?? "tinvest-test";
const ACCOUNT_NAME = "Брокерский счёт (тест)";

const api = new Api({
    baseUrl: BASE_URL,
    baseApiParams: {headers: {"X-Api-Key": API_KEY}},
});

async function getAccountId(): Promise<string> {
    const res = await api.v1AccountsList({per_page: 100, include_disabled: true});
    const json = await res.json();
    const found = json.accounts.find(
        (a: {institution_name?: string}) => a.institution_name === DOMAIN,
    );
    if (!found) throw new Error(`Account ${DOMAIN} not found`);
    return found.id;
}

describe("Sure инвестиции (живой инстанс)", () => {
    beforeAll(() => {
        expect(API_KEY, "SURE_API_KEY должен быть задан").not.toEqual("");
    });

    it("инвестиционный счёт доступен для сделок", async () => {
        const res = await api.v1AccountsList({per_page: 100, include_disabled: true});
        const json = await res.json();
        const found = json.accounts.find(
            (a: {institution_name?: string}) => a.institution_name === DOMAIN,
        );
        expect(found, `счёт ${DOMAIN} не найден (прогоните test/sure-seed-investment.rb)`).toBeTruthy();
        expect(found.account_type?.toLowerCase()).toContain("investment");
    });

  describe("идемпотентность trade_external_id initializer", () => {
    it("buy/sell — повтор с тем же external_id не дублирует", async () => {
      const accountId = await getAccountId();
      const extId = `test-buy-${Date.now()}`;

      // Первый запрос: создаём buy
      const res1 = await api.v1TradesCreate({
        trade: {account_id: accountId, date: "2026-03-01", type: "buy",
                ticker: "SBER", qty: 10, price: 150, currency: "RUB",
                external_id: extId, source: "test"},
      });
      expect(res1.status).toBe(201);

      // Второй запрос: тот же external_id, но type=sell
      const res2 = await api.v1TradesCreate({
        trade: {account_id: accountId, date: "2026-03-01", type: "sell",
                ticker: "SBER", qty: 10, price: 150, currency: "RUB",
                external_id: extId, source: "test"},
      });
      expect(res2.status).toBe(200); // initializer вернул существующий

      const body2 = await res2.json();
      expect(body2.id).toBe((await res1.json()).id);
    });

    it("deposit/withdrawal — повтор с тем же external_id не дублирует", async () => {
      const accountId = await getAccountId();
      const extId = `test-dep-${Date.now()}`;

      // Первый: deposit
      const res1 = await api.v1TradesCreate({
        trade: {account_id: accountId, date: "2026-03-02", type: "deposit",
                amount: 50000, currency: "RUB",
                external_id: extId, source: "test"},
      });
      expect(res1.status).toBe(201);

      // Второй: тот же external_id, но withdrawal
      const res2 = await api.v1TradesCreate({
        trade: {account_id: accountId, date: "2026-03-02", type: "withdrawal",
                amount: 50000, currency: "RUB",
                external_id: extId, source: "test"},
      });
      expect(res2.status).toBe(200);

      // Оба ответа должны указывать на один Entry
      const body2 = await res2.json();
      expect(body2.external_id).toBe(extId);
    });

    it("разные external_id — создаются разные записи", async () => {
      const accountId = await getAccountId();
      const extId1 = `test-unique-a-${Date.now()}`;
      const extId2 = `test-unique-b-${Date.now()}`;

      const r1 = await api.v1TradesCreate({
        trade: {account_id: accountId, date: "2026-03-03", type: "buy",
                ticker: "SBER", qty: 5, price: 200, currency: "RUB",
                external_id: extId1, source: "test"},
      });
      expect(r1.status).toBe(201);

      const r2 = await api.v1TradesCreate({
        trade: {account_id: accountId, date: "2026-03-03", type: "buy",
                ticker: "SBER", qty: 5, price: 200, currency: "RUB",
                external_id: extId2, source: "test"},
      });
      expect(r2.status).toBe(201);

      // Разные ID записей
      expect((await r1.json()).id).not.toBe((await r2.json()).id);
    });
  });

  describe("SureService.createTradesIfNotExists", () => {
    it("создаёт buy/sell/dividend — повтор не дублирует", async () => {
      const runId = Date.now().toString();
      const trades = [
        {external_account_id: DOMAIN, date: "2026-02-02", type: "buy" as const,
         ticker: "SBER", name: "Сбербанк", qty: 10, price: 5,
         currency: "USD", external_id: `op-buy-${runId}`, source: "tinvest_",
         dataProviders: ["moex_public"]},
        {external_account_id: DOMAIN, date: "2026-02-03", type: "sell" as const,
         ticker: "SBER", name: "Сбербанк", qty: 4, price: 6,
         currency: "USD", external_id: `op-sell-${runId}`, source: "tinvest_",
         dataProviders: ["moex_public"]},
        {external_account_id: DOMAIN, date: "2026-02-04", type: "dividend" as const,
         ticker: "SBER", name: "Дивиденды Сбербанк", amount: 12,
         currency: "USD", external_id: `op-div-${runId}`, source: "tinvest_",
         dataProviders: ["moex_public"]},
      ];
      const service = new SureService(BASE_URL, API_KEY);

      await service.createTradesIfNotExists(trades);
      const afterFirst = await api.v1TradesList({per_page: 100});

      await service.createTradesIfNotExists(trades);
      const afterSecond = await api.v1TradesList({per_page: 100});

      expect((await afterSecond.json()).trades?.length)
        .toBe((await afterFirst.json()).trades?.length);
    });

    it("создаёт позицию (holdings) из сделок", async () => {
      const runId = Date.now().toString();
      const accountId = await getAccountId();
      const trades = [
        {external_account_id: DOMAIN, date: "2026-02-05", type: "buy" as const,
         ticker: "SBER", name: "Сбербанк", qty: 10, price: 5,
         currency: "USD", external_id: `op-h-${runId}`, source: "tinvest_",
         dataProviders: ["moex_public"]},
        {external_account_id: DOMAIN, date: "2026-02-06", type: "sell" as const,
         ticker: "SBER", name: "Сбербанк", qty: 4, price: 6,
         currency: "USD", external_id: `op-h-${runId}-s`, source: "tinvest_",
         dataProviders: ["moex_public"]},
      ];
      const service = new SureService(BASE_URL, API_KEY);
      await service.createTradesIfNotExists(trades);

      type Holding = {date?: string; qty?: string; security?: {ticker?: string}};
      let holding: Holding | undefined;
      for (let attempt = 0; attempt < 20 && !holding; attempt++) {
        const res = await api.v1HoldingsList({per_page: 100, account_id: accountId});
        const sber = ((await res.json()).holdings ?? [])
          .filter((h: Holding) => h.security?.ticker === "SBER");
        holding = sber.sort((a: Holding, b: Holding) =>
          (b.date ?? "").localeCompare(a.date ?? ""))[0];
        if (!holding) await new Promise((r) => setTimeout(r, 1000));
      }
      expect(holding, "позиция по SBER не появилась").toBeTruthy();
      expect(Number(holding!.qty)).toBeGreaterThan(0);
    }, 60000);
  });
});
