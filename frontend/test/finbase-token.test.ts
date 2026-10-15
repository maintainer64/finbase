import {afterEach, describe, expect, it, vi} from "vitest";
import {
    finbaseTokenClaims,
    getFinbaseTokenError,
    normalizeFinbaseToken,
    requireFinbaseToken,
} from "@/shared/finbase/token";

afterEach(() => vi.restoreAllMocks());

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

    it("не принимает истёкший JWT и границу срока действия", () => {
        vi.spyOn(Date, "now").mockReturnValue(2_000_000);
        for (const exp of [1999, 2000]) {
            const token = `header.${btoa(JSON.stringify({exp}))}.signature`;
            expect(() => requireFinbaseToken(token)).toThrow("срок сеанса истёк");
        }
    });

    it("принимает JWT с неистёкшим сроком", () => {
        vi.spyOn(Date, "now").mockReturnValue(2_000_000);
        const token = `header.${btoa(JSON.stringify({exp: 2001}))}.signature`;
        expect(requireFinbaseToken(token)).toBe(token);
    });

    it("читает коллекцию из JWT, но не считает это серверной авторизацией", () => {
        const claims = {collectionId: "_pb_superusers_auth_", exp: 2001};
        const token = `header.${btoa(JSON.stringify(claims)).replace(/=+$/, "")}.signature`;
        expect(finbaseTokenClaims(`Bearer ${token}`)).toEqual(claims);
        expect(finbaseTokenClaims("header.invalid.signature")).toBeNull();
    });
});
