import type {CategoryRecord} from "@/shared/finbase/models";

/** Исключённая родительская категория исключает из круговой всю ветку. */
export const excludedReportCategoryIds = (categories: CategoryRecord[]): Set<string> => {
    const byId = new Map(categories.map(category => [category.id, category]));
    const directlyExcluded = new Set(categories
        .filter(category => category.excluded_from_reports)
        .map(category => category.id));
    const result = new Set(directlyExcluded);

    for (const category of categories) {
        const visited = new Set<string>();
        let parent = category.parent_category;
        while (parent && !visited.has(parent)) {
            if (directlyExcluded.has(parent)) {
                result.add(category.id);
                break;
            }
            visited.add(parent);
            parent = byId.get(parent)?.parent_category ?? "";
        }
    }
    return result;
};
