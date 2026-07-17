// Юнит-тесты схемы настроек.
// Схема — единственное место заведения настроек, поэтому фиксируем её инварианты.
import {describe, expect, it} from "vitest";
import {EXPORTABLE_KEYS, SETTINGS, SettingKey} from "@/shared/settings";

describe("схема настроек", () => {
    it("у каждой настройки есть значение по умолчанию и подпись", () => {
        for (const [key, meta] of Object.entries(SETTINGS)) {
            expect(meta, `${key}: нет описания`).toBeTruthy();
            expect(meta.default, `${key}: нет default`).toBeDefined();
            expect(typeof meta.label, `${key}: нет label`).toBe("string");
        }
    });

    it("в импорт/экспорт попадает всё, кроме служебных (exportable: false)", () => {
        expect(EXPORTABLE_KEYS).not.toContain("onboarding-completed");
        // Пользовательские настройки должны переноситься между машинами
        for (const key of ["finbase-url", "finbase-token"] as SettingKey[]) {
            expect(EXPORTABLE_KEYS, `${key} должен экспортироваться`).toContain(key);
        }
    });

    it("значения по умолчанию — строки или булевы (совместимо с localStorage)", () => {
        for (const [key, meta] of Object.entries(SETTINGS)) {
            expect(["string", "boolean"], `${key}: неподдерживаемый тип`).toContain(typeof meta.default);
        }
    });
});
