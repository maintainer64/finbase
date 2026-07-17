import {afterEach, describe, expect, it, vi} from "vitest";
import {statisticsRangeFromParams} from "@/pages/statistics/statistics-period";

afterEach(() => vi.useRealTimers());

describe("период и детализация статистики", () => {
    it("по умолчанию выбирает текущий год", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 7, 22, 12));

        expect(statisticsRangeFromParams(new URLSearchParams())).toEqual({
            period: "year",
            from: "2026-01-01",
            to: "2026-08-22",
        });
    });

    it("сохраняет явный выбор всего времени", () => {
        expect(statisticsRangeFromParams(new URLSearchParams("period=all"))).toEqual({
            period: "all",
            from: "",
            to: "",
        });
    });
});
