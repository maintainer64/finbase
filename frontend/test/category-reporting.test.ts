import {describe, expect, it} from "vitest";
import {excludedReportCategoryIds} from "@/pages/statistics/category-reporting";
import type {CategoryRecord} from "@/shared/finbase/models";

const category = (id: string, parent = "", excluded = false): CategoryRecord => ({
    id,
    name: id,
    color: "#64748b",
    parent_category: parent,
    lucide_icon: "tag",
    excluded_from_reports: excluded,
});

describe("категории вне отчётов", () => {
    it("исключает отмеченную категорию и всю её ветку", () => {
        const excluded = excludedReportCategoryIds([
            category("food", "", true),
            category("cafe", "food"),
            category("coffee", "cafe"),
            category("transport"),
        ]);

        expect([...excluded].sort()).toEqual(["cafe", "coffee", "food"]);
    });

    it("не исключает родителя, если отмечен только один ребёнок", () => {
        const excluded = excludedReportCategoryIds([
            category("food"),
            category("cafe", "food", true),
            category("market", "food"),
        ]);

        expect([...excluded]).toEqual(["cafe"]);
    });
});
