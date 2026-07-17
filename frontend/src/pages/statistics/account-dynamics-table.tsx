import {Component, createMemo, createSignal, For, Show} from "solid-js";
import {ArrowDown, ArrowUp, ArrowUpDown} from "lucide-solid";

export type DynamicsBucket = "day" | "week" | "month";

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

const BUCKET_OPTIONS: [DynamicsBucket, string][] = [
    ["day", "День"],
    ["week", "Неделя"],
    ["month", "Месяц"],
];

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
    const [year, month, day] = period.split("-");
    return `${day}.${month}.${year.slice(2)}`;
};

const cellTitle = (cell: DynamicsCell): string =>
    `Поступления: ${fmt.format(cell.income)} · Расходы: ${fmt.format(cell.expense)} · Результат: ${fmt.format(cell.net)}`;

export const AccountDynamicsTable: Component<{
    periods: string[];
    rows: DynamicsAccountRow[];
    bucket: DynamicsBucket;
    onBucketChange: (bucket: DynamicsBucket) => void;
    onSelect: (selection: DynamicsSelection) => void;
}> = (props) => {
    const [sort, setSort] = createSignal<{key: "name" | "total" | string; direction: "asc" | "desc"}>({key: "total", direction: "desc"});
    const toggleSort = (key: string) => setSort((current) => ({
        key,
        direction: current.key === key && current.direction === "desc" ? "asc" : "desc",
    }));
    const sortedRows = createMemo(() => {
        const state = sort();
        const direction = state.direction === "asc" ? 1 : -1;
        return [...props.rows].sort((left, right) => {
            if (state.key === "name") return left.name.localeCompare(right.name, "ru") * direction;
            const leftValue = state.key === "total" ? left.total.net : left.cells.get(state.key)?.net ?? 0;
            const rightValue = state.key === "total" ? right.total.net : right.cells.get(state.key)?.net ?? 0;
            return (leftValue - rightValue) * direction;
        });
    });
    const sortIcon = (key: string) => (
        <Show when={sort().key === key} fallback={<ArrowUpDown size={12} class="opacity-35"/>}>
            {sort().direction === "asc" ? <ArrowUp size={12}/> : <ArrowDown size={12}/>} 
        </Show>
    );

    const periodTotal = (period: string): DynamicsCell => props.rows.reduce(
        (total, row) => {
            const cell = row.cells.get(period) ?? emptyCell();
            total.income += cell.income;
            total.expense += cell.expense;
            total.net += cell.net;
            return total;
        },
        emptyCell(),
    );

    const overallTotal = (): DynamicsCell => props.rows.reduce(
        (total, row) => {
            total.income += row.total.income;
            total.expense += row.total.expense;
            total.net += row.total.net;
            return total;
        },
        emptyCell(),
    );

    return (
        <>
            <div class="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 class="text-sm font-medium text-gray-600">Динамика по счетам</h2>
                    <p class="mt-0.5 text-xs text-gray-400">Чистое движение денег за каждый период</p>
                </div>
                <div class="flex gap-1 rounded-lg bg-slate-100 p-1">
                    <For each={BUCKET_OPTIONS}>
                        {([key, label]) => (
                            <button
                                type="button"
                                class={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                                    props.bucket === key
                                        ? "bg-white font-medium text-slate-800 shadow-sm"
                                        : "text-slate-500 hover:text-slate-700"
                                }`}
                                onClick={() => props.onBucketChange(key)}
                            >
                                {label}
                            </button>
                        )}
                    </For>
                </div>
            </div>

            <div class="screener-table-wrap max-w-full overflow-auto rounded-xl border border-slate-200">
                <table class="min-w-full border-separate border-spacing-0 text-xs">
                    <thead>
                    <tr>
                        <th class="sticky left-0 top-0 z-30 min-w-48 border-b border-r border-slate-200 bg-slate-50 p-0 text-left font-medium text-slate-500">
                            <button class="flex w-full items-center gap-1 px-3 py-2.5" onClick={() => toggleSort("name")}>Счёт {sortIcon("name")}</button>
                        </th>
                        <For each={props.periods}>
                            {(period) => (
                                <th class="sticky top-0 z-20 min-w-28 whitespace-nowrap border-b border-slate-200 bg-slate-50 p-0 text-right font-medium text-slate-500">
                                    <button class="flex w-full items-center justify-end gap-1 px-3 py-2.5" onClick={() => toggleSort(period)}>{dynamicsPeriodLabel(period, props.bucket)} {sortIcon(period)}</button>
                                </th>
                            )}
                        </For>
                        <th class="sticky right-0 top-0 z-30 min-w-28 border-b border-l border-slate-200 bg-slate-100 p-0 text-right font-semibold text-slate-600">
                            <button class="flex w-full items-center justify-end gap-1 px-3 py-2.5" onClick={() => toggleSort("total")}>Итого {sortIcon("total")}</button>
                        </th>
                    </tr>
                    </thead>
                    <tbody>
                    <For each={sortedRows()}>
                        {(row) => (
                            <tr class="group">
                                <th class="sticky left-0 z-10 border-b border-r border-slate-100 bg-white px-3 py-2.5 text-left font-normal group-hover:bg-slate-50">
                                    <div class="flex items-center gap-2">
                                        <span class="h-2.5 w-2.5 shrink-0 rounded-full" style={{background: row.color}}/>
                                        <span class="min-w-0">
                                            <span class="block truncate font-medium text-slate-700">{row.name}</span>
                                            <span class="block text-[10px] uppercase tracking-wide text-slate-400">{row.currency}</span>
                                        </span>
                                    </div>
                                </th>
                                <For each={props.periods}>
                                    {(period) => {
                                        const cell = () => row.cells.get(period) ?? emptyCell();
                                        return (
                                            <td class="border-b border-slate-100 p-0 group-hover:bg-slate-50">
                                                <button
                                                    type="button"
                                                    class={`w-full whitespace-nowrap px-3 py-2.5 text-right tabular-nums outline-none hover:bg-blue-50 focus-visible:bg-blue-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400 ${amountClass(cell().net)}`}
                                                    title={`${cellTitle(cell())}. Нажмите для детализации`}
                                                    aria-label={`${row.name}, ${dynamicsPeriodLabel(period, props.bucket)}: ${cellTitle(cell())}`}
                                                    disabled={!row.cells.has(period)}
                                                    onClick={() => props.onSelect({accountId: row.id, period})}
                                                >
                                                    {amount(cell().net)}
                                                </button>
                                            </td>
                                        );
                                    }}
                                </For>
                                <td class="sticky right-0 z-10 border-b border-l border-slate-200 bg-slate-50 p-0">
                                    <button
                                        type="button"
                                        class={`w-full whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums outline-none hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400 ${amountClass(row.total.net)}`}
                                        title={`${cellTitle(row.total)}. Нажмите для детализации`}
                                        onClick={() => props.onSelect({accountId: row.id})}
                                    >
                                        {amount(row.total.net)}
                                    </button>
                                </td>
                            </tr>
                        )}
                    </For>
                    </tbody>
                    <tfoot>
                    <tr>
                        <th class="sticky bottom-0 left-0 z-30 border-r border-t border-slate-200 bg-slate-100 px-3 py-2.5 text-left font-semibold text-slate-600">
                            Все счета
                        </th>
                        <For each={props.periods}>
                            {(period) => {
                                const total = () => periodTotal(period);
                                return (
                                    <td class="sticky bottom-0 border-t border-slate-200 bg-slate-50 p-0">
                                        <button
                                            type="button"
                                            class={`w-full whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums outline-none hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400 ${amountClass(total().net)}`}
                                            title={`${cellTitle(total())}. Нажмите для детализации`}
                                            onClick={() => props.onSelect({period})}
                                        >
                                            {amount(total().net)}
                                        </button>
                                    </td>
                                );
                            }}
                        </For>
                        <td class="sticky bottom-0 right-0 z-30 border-l border-t border-slate-300 bg-slate-100 p-0">
                            <button
                                type="button"
                                class={`w-full whitespace-nowrap px-3 py-2.5 text-right font-bold tabular-nums outline-none hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400 ${amountClass(overallTotal().net)}`}
                                title={`${cellTitle(overallTotal())}. Нажмите для детализации`}
                                onClick={() => props.onSelect({})}
                            >
                                {amount(overallTotal().net)}
                            </button>
                        </td>
                    </tr>
                    </tfoot>
                </table>
            </div>
            <p class="mt-2 text-[11px] text-slate-400">Нажмите на сумму, чтобы открыть операции и подробности.</p>
        </>
    );
};
