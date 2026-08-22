import {describe, expect, it} from "vitest";
import {parseTransactionCsv} from "@/pages/data/transaction-csv";

const lookups = {
    accounts: [{id: "account-1", name: "Карта (Имя) (Банк)"}],
    categories: [{id: "category-cafe", name: "Кафе"}],
    tags: [{id: "tag-work", name: "Работа"}, {id: "tag-daily", name: "Повседневное"}],
};

describe("импорт операций CSV", () => {
    it("сопоставляет счёт, категорию и несколько тегов по названию", () => {
        const preview = parseTransactionCsv(
            "date;amount;currency;account;category;tags;note;external_id\n"
            + "2026-08-21T09:30:00+05:00;-450,50;RUB;Карта (Имя) (Банк);кафе;Работа, Повседневное;Кофе;csv-1\n",
            lookups,
        );

        expect(preview.issues).toEqual([]);
        expect(preview.rows).toHaveLength(1);
        expect(preview.rows[0].transaction).toMatchObject({
            account: "account-1",
            category: "category-cafe",
            tags: ["tag-work", "tag-daily"],
            amount: -450.5,
            currency: "RUB",
            external_id: "csv-1",
            date: "2026-08-21T04:30:00.000Z",
        });
    });

    it("разрешает пустые категорию и теги и создаёт стабильный external_id", () => {
        const csv = "Дата,Сумма,Счёт,Категория,Теги,Описание\n"
            + "2026-08-22,0,Карта (Имя) (Банк),,,Корректировка\n";
        const first = parseTransactionCsv(csv, lookups);
        const second = parseTransactionCsv(csv, lookups);

        expect(first.issues).toEqual([]);
        expect(first.rows[0].transaction).toMatchObject({category: "", tags: [], amount: 0, currency: "RUB"});
        expect(first.rows[0].transaction.external_id).toMatch(/^csv_[a-z0-9]+$/);
        expect(second.rows[0].transaction.external_id).toBe(first.rows[0].transaction.external_id);
    });

    it("читает теги в кавычках в CSV с запятыми", () => {
        const preview = parseTransactionCsv(
            "date,amount,account,tags,note\n"
            + "2026-08-22,-100,Карта (Имя) (Банк),\"Работа, Повседневное\",Покупка\n",
            lookups,
        );

        expect(preview.issues).toEqual([]);
        expect(preview.rows[0].transaction.tags).toEqual(["tag-work", "tag-daily"]);
    });

    it("не пропускает строку с неизвестными справочниками", () => {
        const preview = parseTransactionCsv(
            "date;amount;account;category;tags\n2026-08-22;-100;Другой счёт;Неизвестная;Новый тег\n",
            lookups,
        );

        expect(preview.rows).toEqual([]);
        expect(preview.issues[0].message).toContain("Счёт «Другой счёт» не найден");
        expect(preview.issues[0].message).toContain("Категория «Неизвестная» не найден");
        expect(preview.issues[0].message).toContain("Тег «Новый тег» не найден");
    });
});
