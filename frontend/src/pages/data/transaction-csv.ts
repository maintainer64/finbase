import {parse} from "csv-parse/browser/esm/sync";
import type {TransactionRecord} from "@/shared/finbase/models";

export const TRANSACTION_CSV_EXAMPLE = `date;amount;currency;account;category;tags;note;external_id
2026-08-21T09:30:00+05:00;-450.50;RUB;Карта (Имя) (Банк);Кафе;Повседневное, Работа;Кофе и завтрак;csv-example-001
2026-08-22;25000;RUB;Карта (Имя) (Банк);Оплата труда;;Зарплата;csv-example-002
2026-08-22;-120;RUB;Карта (Имя) (Банк);;Транспорт;Операция без категории;
`;

type CsvSourceRow = Record<string, string>;

export interface TransactionCsvRow {
    line: number;
    source: CsvSourceRow;
    transaction: Partial<TransactionRecord>;
}

export interface TransactionCsvIssue {
    line: number;
    message: string;
}

export interface TransactionCsvPreview {
    rows: TransactionCsvRow[];
    issues: TransactionCsvIssue[];
    totalRows: number;
    delimiter: "," | ";";
}

export interface TransactionCsvLookups {
    accounts: NamedRecord[];
    categories: NamedRecord[];
    tags: NamedRecord[];
}

interface NamedRecord {
    id: string;
    name: string;
}

const HEADER_ALIASES: Record<string, string> = {
    date: "date",
    "дата": "date",
    amount: "amount",
    "сумма": "amount",
    currency: "currency",
    "валюта": "currency",
    account: "account",
    account_name: "account",
    full_account_name: "account",
    "счет": "account",
    "счёт": "account",
    "полное наименование счета": "account",
    "полное наименование счёта": "account",
    category: "category",
    "категория": "category",
    tags: "tags",
    "теги": "tags",
    note: "note",
    name: "note",
    description: "note",
    "описание": "note",
    "наименование": "note",
    external_id: "external_id",
    "внешний id": "external_id",
    "внешний_id": "external_id",
};

const normalizedName = (value: string): string => value.trim().toLocaleLowerCase("ru");

const normalizedHeader = (value: string): string => {
    const normalized = normalizedName(value.replace(/^\uFEFF/, "")).replace(/[-\s]+/g, "_");
    return HEADER_ALIASES[normalized] ?? HEADER_ALIASES[normalized.replace(/_/g, " ")] ?? normalized;
};

const delimiterOf = (content: string): "," | ";" => {
    const header = content.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
    return (header.match(/;/g)?.length ?? 0) > (header.match(/,/g)?.length ?? 0) ? ";" : ",";
};

const hashString = (value: string): string => {
    let hash = 14695981039346656037n;
    for (let index = 0; index < value.length; index++) {
        hash ^= BigInt(value.charCodeAt(index));
        hash = BigInt.asUintN(64, hash * 1099511628211n);
    }
    return hash.toString(36);
};

const parseAmount = (value: string): number | null => {
    const normalized = value.replace(/[\s\u00a0]/g, "").replace(",", ".");
    if (!normalized) return null;
    const amount = Number(normalized);
    return Number.isFinite(amount) ? amount : null;
};

const parseDate = (value: string): string | null => {
    const normalized = value.trim();
    if (!normalized) return null;
    const russian = normalized.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    const candidate = russian
        ? `${russian[3]}-${russian[2]}-${russian[1]}T${russian[4] ?? "00"}:${russian[5] ?? "00"}:${russian[6] ?? "00"}`
        : /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? `${normalized}T00:00:00` : normalized;
    const date = new Date(candidate);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const lookup = <T extends {name: string}>(items: T[]): Map<string, T[]> => {
    const result = new Map<string, T[]>();
    for (const item of items) {
        const key = normalizedName(item.name);
        result.set(key, [...(result.get(key) ?? []), item]);
    }
    return result;
};

const resolveNamed = <T extends {name: string}>(
    value: string,
    items: Map<string, T[]>,
    label: string,
    issues: string[],
): T | undefined => {
    const matches = items.get(normalizedName(value)) ?? [];
    if (matches.length === 0) issues.push(`${label} «${value}» не найден`);
    if (matches.length > 1) issues.push(`${label} «${value}» неоднозначен`);
    return matches.length === 1 ? matches[0] : undefined;
};

export const parseTransactionCsv = (content: string, lookups: TransactionCsvLookups): TransactionCsvPreview => {
    const delimiter = delimiterOf(content);
    const records = parse<CsvSourceRow>(content, {
        bom: true,
        columns: (headers: string[]) => headers.map(normalizedHeader),
        delimiter,
        skip_empty_lines: true,
        trim: true,
    });
    const accounts = lookup(lookups.accounts);
    const categories = lookup(lookups.categories);
    const tags = lookup(lookups.tags);
    const rows: TransactionCsvRow[] = [];
    const previewIssues: TransactionCsvIssue[] = [];

    records.forEach((source, index) => {
        const line = index + 2;
        const issues: string[] = [];
        const date = parseDate(source.date ?? "");
        const amount = parseAmount(source.amount ?? "");
        const accountName = (source.account ?? "").trim();
        if (!date) issues.push("укажите корректную дату");
        if (amount === null) issues.push("укажите корректную сумму");
        if (!accountName) issues.push("укажите полное наименование счёта");
        const account = accountName ? resolveNamed(accountName, accounts, "Счёт", issues) : undefined;

        const categoryName = (source.category ?? "").trim();
        const category = categoryName ? resolveNamed(categoryName, categories, "Категория", issues) : undefined;
        const tagNames = (source.tags ?? "").split(",").map(item => item.trim()).filter(Boolean);
        const tagRecords = tagNames.map(name => resolveNamed(name, tags, "Тег", issues)).filter((item): item is NamedRecord => Boolean(item));
        const currency = (source.currency || "RUB").trim().toUpperCase();
        if (!/^[A-Z]{3}$/.test(currency)) issues.push("валюта должна быть трёхбуквенным кодом, например RUB");

        if (issues.length) {
            previewIssues.push({line, message: issues.join("; ")});
            return;
        }
        rows.push({
            line,
            source,
            transaction: {
                account: account!.id,
                category: category?.id ?? "",
                tags: [...new Set(tagRecords.map(item => item.id))],
                date: date!,
                amount: amount!,
                currency,
                note: (source.note ?? "").trim(),
                external_id: (source.external_id ?? "").trim() || `csv_${hashString(`${JSON.stringify(source)}:${line}`)}`,
            },
        });
    });

    return {rows, issues: previewIssues, totalRows: records.length, delimiter};
};
