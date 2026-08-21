import type {CollectionSpec} from "./finbase-schema";

export const EMPTY_RELATION_FILTER = "__empty_relation__";

const filterValue = (value: string): string => JSON.stringify(value);

const nextDay = (day: string): string => {
    const date = new Date(`${day}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString();
};

export const buildDataFilter = (
    coll: CollectionSpec,
    search: string,
    fieldFilters: Record<string, string>,
    from: string,
    to: string,
    amountKind: "" | "income" | "expense",
): string => {
    const filters: string[] = [];
    const needle = search.trim();
    if (needle) {
        const searchable = coll.fields.filter(field => field.listable
            && ["text", "textarea", "select"].includes(field.kind));
        if (searchable.length) {
            filters.push(`(${searchable.map(field => `${field.name} ~ ${filterValue(needle)}`).join(" || ")})`);
        }
    }

    for (const [fieldName, expected] of Object.entries(fieldFilters)) {
        if (!expected) continue;
        const field = coll.fields.find(item => item.name === fieldName);
        if (!field) continue;
        if (expected === EMPTY_RELATION_FILTER) {
            filters.push(field.kind === "relation-many" ? `${field.name}:length = 0` : `${field.name} = ""`);
        } else if (field.kind === "relation-many") {
            filters.push(`${field.name} ?= ${filterValue(expected)}`);
        } else {
            filters.push(`${field.name} = ${filterValue(expected)}`);
        }
    }

    const date = coll.fields.find(field => field.kind === "date" && field.listable);
    if (date && from) filters.push(`${date.name} >= ${filterValue(`${from}T00:00:00.000Z`)}`);
    if (date && to) filters.push(`${date.name} < ${filterValue(nextDay(to))}`);
    if (coll.fields.some(field => field.name === "amount")) {
        if (amountKind === "income") filters.push("amount > 0");
        if (amountKind === "expense") filters.push("amount < 0");
    }
    return filters.join(" && ");
};
