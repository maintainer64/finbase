import {Component, createMemo, createSignal} from "solid-js";
import {SimpleTable, type SolidColumnDef} from "@simple-table/solid";
import {compactTableTheme, simpleTableIcons} from "@/components/ui/simple-table";

export type DynamicsBucket = "year" | "month" | "week";

export interface DynamicsCell {
    income: number;
    expense: number;
    net: number;
}

export interface DynamicsAccountRow {
    id: string;
    name: string;
    color: string;
    currency: string;
    cells: Map<string, DynamicsCell>;
    total: DynamicsCell;
}

export interface DynamicsSelection {
    accountId?: string;
    period?: string;
}

type DynamicsGridRow = Record<string, unknown> & {
    id: string;
    name: string;
    color: string;
    currency: string;
    total: number;
    isTotal: boolean;
    source?: DynamicsAccountRow;
    details: Record<string, DynamicsCell>;
};

const fmt = new Intl.NumberFormat("ru-RU", {maximumFractionDigits: 0});
const monthFmt = new Intl.DateTimeFormat("ru-RU", {month: "short", year: "numeric", timeZone: "UTC"});
const emptyCell = (): DynamicsCell => ({income: 0, expense: 0, net: 0});

const amount = (value: number): string => {
    if (value === 0) return "—";
    return `${value > 0 ? "+" : "−"}${fmt.format(Math.abs(value))}`;
};

const amountClass = (value: number): string =>
    value > 0 ? "text-emerald-700" : value < 0 ? "text-rose-600" : "text-slate-300";

export const dynamicsPeriodLabel = (period: string, bucket: DynamicsBucket): string => {
    if (bucket === "week") {
        const [year, week] = period.split("-W");
        return `${week} нед. · ${year}`;
    }
    if (bucket === "month") return monthFmt.format(new Date(`${period}-01T00:00:00Z`));
    return period;
};

const cellTitle = (cell: DynamicsCell): string =>
    `Поступления: ${fmt.format(cell.income)} · Расходы: ${fmt.format(cell.expense)} · Результат: ${fmt.format(cell.net)}`;

export const AccountDynamicsTable: Component<{
    periods: string[];
    rows: DynamicsAccountRow[];
    bucket: DynamicsBucket;
    onSelect: (selection: DynamicsSelection) => void;
}> = (props) => {
    const [sort, setSort] = createSignal<{key: string; direction: "asc" | "desc"}>({key: "total", direction: "desc"});

    const totals = createMemo(() => {
        const details: Record<string, DynamicsCell> = Object.fromEntries(props.periods.map(period => [period, emptyCell()]));
        const total = emptyCell();
        for (const row of props.rows) {
            for (const period of props.periods) {
                const cell = row.cells.get(period) ?? emptyCell();
                details[period].income += cell.income;
                details[period].expense += cell.expense;
                details[period].net += cell.net;
            }
            total.income += row.total.income;
            total.expense += row.total.expense;
            total.net += row.total.net;
        }
        details.total = total;
        return details;
    });

    const accountRows = createMemo<DynamicsGridRow[]>(() => props.rows.map(row => {
        const details = Object.fromEntries(props.periods.map(period => [period, row.cells.get(period) ?? emptyCell()]));
        details.total = row.total;
        return {
            id: row.id,
            name: row.name,
            color: row.color,
            currency: row.currency,
            total: row.total.net,
            isTotal: false,
            source: row,
            details,
            ...Object.fromEntries(props.periods.map(period => [period, details[period].net])),
        };
    }));

    const tableRows = createMemo<DynamicsGridRow[]>(() => {
        const state = sort();
        const direction = state.direction === "asc" ? 1 : -1;
        const rows = [...accountRows()].sort((left, right) => {
            if (state.key === "name") return left.name.localeCompare(right.name, "ru") * direction;
            return (Number(left[state.key] ?? 0) - Number(right[state.key] ?? 0)) * direction;
        });
        const details = totals();
        return [...rows, {
            id: "__all_accounts__",
            name: "Все счета",
            color: "",
            currency: "",
            total: details.total.net,
            isTotal: true,
            details,
            ...Object.fromEntries(props.periods.map(period => [period, details[period].net])),
        }];
    });

    const amountButton = (row: DynamicsGridRow, key: string, label: string) => {
        const cell = row.details[key] ?? emptyCell();
        const available = row.isTotal || key === "total" || Boolean(row.source?.cells.has(key));
        return (
            <button
                type="button"
                class={`finbase-st-money-cell ${amountClass(cell.net)}`}
                title={`${cellTitle(cell)}. Нажмите для детализации`}
                aria-label={`${row.name}, ${label}: ${cellTitle(cell)}`}
                disabled={!available}
                onClick={() => props.onSelect({
                    accountId: row.isTotal ? undefined : row.id,
                    period: key === "total" ? undefined : key,
                })}
            >
                {amount(cell.net)}
            </button>
        );
    };

    const columns = createMemo<SolidColumnDef<DynamicsGridRow>[]>(() => [
        {
            accessor: "name",
            label: "Счёт",
            width: "auto",
            minWidth: 190,
            maxWidth: 260,
            type: "string",
            sortable: true,
            sortingOrder: ["asc", "desc"],
            pinned: "left",
            essential: true,
            cellRenderer: ({row}) => row.isTotal ? (
                <span class="font-semibold text-slate-600">Все счета</span>
            ) : (
                <div class="flex min-w-0 items-center gap-2">
                    <span class="size-2.5 shrink-0 rounded-full" style={{background: row.color}}/>
                    <span class="min-w-0">
                        <span class="block truncate font-medium text-slate-700">{row.name}</span>
                        <span class="block text-[10px] uppercase tracking-wide text-slate-400">{row.currency}</span>
                    </span>
                </div>
            ),
        },
        ...props.periods.map((period): SolidColumnDef<DynamicsGridRow> => ({
            accessor: period,
            label: dynamicsPeriodLabel(period, props.bucket),
            width: "auto",
            minWidth: 116,
            maxWidth: 160,
            type: "number",
            align: "right",
            sortable: true,
            sortingOrder: ["asc", "desc"],
            valueFormatter: ({value}) => amount(Number(value ?? 0)),
            useFormattedValueForClipboard: true,
            cellRenderer: ({row}) => amountButton(row, period, dynamicsPeriodLabel(period, props.bucket)),
        })),
        {
            accessor: "total",
            label: "Итого",
            width: "auto",
            minWidth: 116,
            maxWidth: 160,
            type: "number",
            align: "right",
            sortable: true,
            sortingOrder: ["asc", "desc"],
            pinned: "right",
            essential: true,
            valueFormatter: ({value}) => amount(Number(value ?? 0)),
            useFormattedValueForClipboard: true,
            cellRenderer: ({row}) => amountButton(row, "total", "Итого"),
        },
    ]);

    return (
        <>
            <div class="mb-3">
                <h2 class="text-sm font-medium text-gray-600">Динамика по счетам</h2>
                <p class="mt-0.5 text-xs text-gray-400">Чистое движение денег за каждый период</p>
            </div>

            <SimpleTable<DynamicsGridRow>
                columns={columns()}
                rows={tableRows()}
                getRowId={({row}) => row.id}
                getRowClass={({row}) => row.isTotal ? "finbase-st-total-row" : undefined}
                maxHeight="min(56vh, 620px)"
                theme="custom"
                customTheme={{...compactTableTheme, rowHeight: 52}}
                icons={simpleTableIcons}
                autoExpandColumns
                columnResizing
                columnReordering
                hoverRowBackground
                hideFooter
                externalSortHandling
                initialSortColumn="total"
                initialSortDirection="desc"
                onSortChange={(nextSort) => {
                    if (!nextSort) return;
                    setSort({key: String(nextSort.key.accessor), direction: nextSort.direction});
                }}
            />
            <p class="mt-2 text-[11px] text-slate-400">Нажмите на сумму, чтобы открыть операции и подробности.</p>
        </>
    );
};
