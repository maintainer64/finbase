import {describe, expect, it} from "vitest";
import {
    getFinbaseTokenError,
    getFinbaseAuthRecordId,
    normalizeFinbaseToken,
    requireFinbaseToken,
} from "@/shared/finbase/token";

describe("токен Finbase", () => {
    it("очищает пробелы и необязательный Bearer", () => {
        expect(normalizeFinbaseToken("  Bearer aaa.bbb.ccc  ")).toBe("aaa.bbb.ccc");
    });

    it("принимает ASCII-токен PocketBase", () => {
        expect(getFinbaseTokenError("aaa-bbb.ccc_ddd.eee")).toBeNull();
        expect(requireFinbaseToken(" aaa.bbb.ccc ")).toBe("aaa.bbb.ccc");
    });

    it("не передаёт кириллицу и переносы строк в заголовок fetch", () => {
        expect(() => requireFinbaseToken("токен")).toThrow("недопустимые символы");
        expect(() => requireFinbaseToken("aaa.\nббб.ccc")).toThrow("недопустимые символы");
    });

    it("объясняет отсутствие сеанса", () => {
        expect(() => requireFinbaseToken("   ")).toThrow("нет активного сеанса");
    });

    it("извлекает владельца счёта из PocketBase JWT", () => {
        expect(getFinbaseAuthRecordId("aaa.eyJpZCI6InVzZXIxMjMifQ.ccc")).toBe("user123");
        expect(getFinbaseAuthRecordId("not-a-jwt")).toBe("");
    });
});
