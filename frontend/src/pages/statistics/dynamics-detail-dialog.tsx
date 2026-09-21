import {Component, createMemo, For, onCleanup, onMount, Show} from "solid-js";
import {X} from "lucide-solid";
import {AccountRecord, CategoryRecord, TagRecord, TransactionRecord} from "@/shared/finbase/models";
import {CategoryIcon} from "@/components/ui/category-icon";
import {formatDateOnly} from "@/shared/date";
import {formatMoney as fmtMoney} from "./money";
import {SimpleTable, type SolidColumnDef} from "@simple-table/solid";
import {compactTableTheme, simpleTableIcons} from "@/components/ui/simple-table";

interface CurrencySummary {
    currency: string;
    income: number;
    expense: number;
    net: number;
}

interface DetailTransactionRow {
    id: string;
    date: string;
    accountName: string;
    note: string;
    externalId: string;
    categoryName: string;
    categoryColor: string;
    categoryIcon: string;
    tagNames: string[];
    amount: number;
    currency: string;
}

export const DynamicsDetailDialog: Component<{
    title: string;
    subtitle: string;
    transactions: TransactionRecord[];
    accounts: AccountRecord[];
    categories: CategoryRecord[];
    tags: TagRecord[];
    loading: boolean;
    error: string;
    onClose: () => void;
}> = (props) => {
    const accountMap = createMemo(() => new Map(props.accounts.map(item => [item.id, item])));
    const categoryMap = createMemo(() => new Map(props.categories.map(item => [item.id, item])));
    const tagMap = createMemo(() => new Map(props.tags.map(item => [item.id, item])));
    const tableRows = createMemo<DetailTransactionRow[]>(() => [...props.transactions]
        .sort((a, b) => b.date.localeCompare(a.date) || Math.abs(b.amount) - Math.abs(a.amount))
        .map(transaction => {
            const category = categoryMap().get(transaction.category);
            return {
                id: transaction.id,
                date: transaction.date,
                accountName: accountMap().get(transaction.account)?.name ?? transaction.account,
                note: transaction.note || "Без описания",
                externalId: transaction.external_id,
                categoryName: category?.name ?? "Без категории",
                categoryColor: category?.color || "#94a3b8",
                categoryIcon: category?.lucide_icon ?? "",
                tagNames: transaction.tags.map(tagId => tagMap().get(tagId)?.name ?? tagId),
                amount: transaction.amount,
                currency: transaction.currency,
            };
        }));
    const columns = createMemo<SolidColumnDef<DetailTransactionRow>[]>(() => [
        {
            accessor: "date",
            label: "Дата",
            width: "auto",
            maxWidth: 150,
            type: "date",
            sortable: true,
            filterable: true,
            sortingOrder: ["asc", "desc"],
            valueFormatter: ({value}) => formatDateOnly(String(value ?? "")),
            useFormattedValueForClipboard: true,
        },
        {
            accessor: "accountName",
            label: "Счёт",
            width: "auto",
            minWidth: 140,
            maxWidth: 220,
            type: "enum",
            sortable: true,
            filterable: true,
            enumOptions: props.accounts.map(account => ({label: account.name, value: account.name})),
        },
        {
            accessor: "note",
            label: "Операция",
            width: "auto",
            minWidth: 220,
            maxWidth: 360,
            type: "string",
            sortable: true,
            filterable: true,
            cellRenderer: ({row}) => (
                <div class="min-w-0">
                    <div class="truncate font-medium text-slate-700" title={row.note}>{row.note}</div>
                    <Show when={row.externalId}>
                        <div class="mt-0.5 truncate text-[10px] text-slate-300" title={row.externalId}>{row.externalId}</div>
                    </Show>
                </div>
            ),
        },
        {
            accessor: "categoryName",
            label: "Категория и теги",
            width: "auto",
            minWidth: 190,
            maxWidth: 320,
            type: "enum",
            sortable: true,
            filterable: true,
            enumOptions: [
                {label: "Без категории", value: "Без категории"},
                ...props.categories.map(category => ({label: category.name, value: category.name})),
            ],
            cellRenderer: ({row}) => (
                <div class="min-w-0">
                    <div class="flex items-center gap-1.5 text-xs text-slate-600">
                        <span class="size-2 shrink-0 rounded-full" style={{background: row.categoryColor}}/>
                        <Show when={row.categoryIcon}><CategoryIcon name={row.categoryIcon} size={14}/></Show>
                        <span class="truncate">{row.categoryName}</span>
                    </div>
                    <div class="mt-1 flex min-w-0 gap-1 overflow-hidden">
                        <Show when={row.tagNames.length > 0} fallback={<span class="text-[10px] text-slate-300">Без тегов</span>}>
                            <For each={row.tagNames}>{name => <span class="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{name}</span>}</For>
                        </Show>
                    </div>
                </div>
            ),
        },
        {
            accessor: "amount",
            label: "Сумма",
            width: "auto",
            minWidth: 130,
            maxWidth: 180,
            type: "number",
            align: "right",
            sortable: true,
            filterable: true,
            valueFormatter: ({value, row}) => fmtMoney(Number(value ?? 0), row.currency),
            useFormattedValueForClipboard: true,
            cellRenderer: ({row}) => (
                <span class={`whitespace-nowrap font-semibold tabular-nums ${row.amount >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                    {fmtMoney(row.amount, row.currency)}
                </span>
            ),
        },
    ]);
    const summaries = createMemo<CurrencySummary[]>(() => {
        const byCurrency = new Map<string, CurrencySummary>();
        for (const transaction of props.transactions) {
            const currency = transaction.currency || "RUB";
            const summary = byCurrency.get(currency) ?? {currency, income: 0, expense: 0, net: 0};
            if (transaction.amount >= 0) summary.income += transaction.amount;
            else summary.expense += -transaction.amount;
            summary.net += transaction.amount;
            byCurrency.set(currency, summary);
        }
        return [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency));
    });

    onMount(() => {
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") props.onClose();
        };
        window.addEventListener("keydown", onKeyDown);
        onCleanup(() => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener("keydown", onKeyDown);
        });
    });

    return (
        <div
            class="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-[2px] sm:p-6"
            role="presentation"
            onClick={(event) => { if (event.target === event.currentTarget) props.onClose(); }}
        >
            <section
                class="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/60 bg-white shadow-2xl"
                role="dialog"
                aria-modal="true"
                aria-labelledby="dynamics-detail-title"
            >
                <header class="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
                    <div class="min-w-0">
                        <h2 id="dynamics-detail-title" class="truncate text-lg font-semibold text-slate-800">{props.title}</h2>
                        <p class="mt-0.5 text-sm text-slate-400">{props.subtitle}</p>
                    </div>
                    <button
                        type="button"
                        class="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                        aria-label="Закрыть детализацию"
                        onClick={() => props.onClose()}
                    >
                        <X size={20}/>
                    </button>
                </header>

                <div class="overflow-y-auto px-5 py-4">
                    <Show when={props.loading}>
                        <div class="py-14 text-center text-sm text-slate-400">Загружаем операции…</div>
                    </Show>
                    <Show when={props.error}>
                        <div class="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{props.error}</div>
                    </Show>
                    <Show when={!props.loading && !props.error}>
                        <div class="mb-4 grid gap-3 sm:grid-cols-3">
                            <div class="rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-3">
                                <div class="text-xs text-emerald-600">Поступления</div>
                                <For each={summaries()}>{summary => <div class="mt-1 font-semibold tabular-nums text-emerald-700">{fmtMoney(summary.income, summary.currency)}</div>}</For>
                            </div>
                            <div class="rounded-xl border border-rose-100 bg-rose-50/70 px-4 py-3">
                                <div class="text-xs text-rose-600">Расходы</div>
                                <For each={summaries()}>{summary => <div class="mt-1 font-semibold tabular-nums text-rose-700">{fmtMoney(summary.expense, summary.currency)}</div>}</For>
                            </div>
                            <div class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                <div class="text-xs text-slate-500">Результат</div>
                                <For each={summaries()}>
                                    {summary => (
                                        <div class={`mt-1 font-semibold tabular-nums ${summary.net >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                                            {fmtMoney(summary.net, summary.currency)}
                                        </div>
                                    )}
                                </For>
                            </div>
                        </div>

                        <Show when={tableRows().length > 0} fallback={
                            <div class="py-14 text-center text-sm text-slate-400">В этом срезе операций нет.</div>
                        }>
                            <SimpleTable<DetailTransactionRow>
                                columns={columns()}
                                rows={tableRows()}
                                getRowId={({row}) => row.id}
                                maxHeight="min(52vh, 560px)"
                                theme="custom"
                                customTheme={{...compactTableTheme, rowHeight: 60}}
                                icons={simpleTableIcons}
                                autoExpandColumns
                                columnResizing
                                columnReordering
                                enableColumnEditor
                                hoverRowBackground
                                hideFooter
                                initialSortColumn="date"
                                initialSortDirection="desc"
                            />
                        </Show>
                    </Show>
                </div>
            </section>
        </div>
    );
};
