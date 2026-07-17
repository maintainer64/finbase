import {Component, createMemo, For, onCleanup, onMount, Show} from "solid-js";
import {X} from "lucide-solid";
import {AccountRecord, CategoryRecord, TagRecord, TransactionRecord} from "@/shared/finbase/models";
import {CategoryIcon} from "@/components/ui/category-icon";

interface CurrencySummary {
    currency: string;
    income: number;
    expense: number;
    net: number;
}

const dateFmt = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
});

const moneyFormatters = new Map<string, Intl.NumberFormat>();
const fmtMoney = (value: number, currency: string): string => {
    const code = currency || "RUB";
    let formatter = moneyFormatters.get(code);
    if (!formatter) {
        formatter = new Intl.NumberFormat("ru-RU", {
            style: "currency",
            currency: code,
            maximumFractionDigits: 0,
        });
        moneyFormatters.set(code, formatter);
    }
    return formatter.format(value);
};

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
    const orderedTransactions = createMemo(() => [...props.transactions].sort((a, b) =>
        b.date.localeCompare(a.date) || Math.abs(b.amount) - Math.abs(a.amount),
    ));
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

                        <Show when={orderedTransactions().length > 0} fallback={
                            <div class="py-14 text-center text-sm text-slate-400">В этом срезе операций нет.</div>
                        }>
                            <div class="overflow-x-auto rounded-xl border border-slate-200">
                                <table class="min-w-full text-sm">
                                    <thead class="bg-slate-50 text-xs text-slate-400">
                                    <tr>
                                        <th class="whitespace-nowrap px-3 py-2.5 text-left font-medium">Дата</th>
                                        <th class="min-w-36 px-3 py-2.5 text-left font-medium">Счёт</th>
                                        <th class="min-w-64 px-3 py-2.5 text-left font-medium">Операция</th>
                                        <th class="min-w-40 px-3 py-2.5 text-left font-medium">Категория и теги</th>
                                        <th class="whitespace-nowrap px-3 py-2.5 text-right font-medium">Сумма</th>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    <For each={orderedTransactions()}>
                                        {(transaction) => {
                                            const category = () => categoryMap().get(transaction.category);
                                            return (
                                                <tr class="border-t border-slate-100 align-top hover:bg-slate-50/70">
                                                    <td class="whitespace-nowrap px-3 py-3 text-xs text-slate-500">{dateFmt.format(new Date(transaction.date))}</td>
                                                    <td class="px-3 py-3 text-slate-600">{accountMap().get(transaction.account)?.name ?? transaction.account}</td>
                                                    <td class="px-3 py-3">
                                                        <div class="font-medium text-slate-700">{transaction.note || "Без описания"}</div>
                                                        <Show when={transaction.external_id}>
                                                            <div class="mt-0.5 max-w-64 truncate text-[10px] text-slate-300">{transaction.external_id}</div>
                                                        </Show>
                                                    </td>
                                                    <td class="px-3 py-3">
                                                        <div class="flex items-center gap-1.5 text-xs text-slate-600">
                                                            <Show when={category()} fallback={<span class="text-slate-400">Без категории</span>}>
                                                                {(item) => (
                                                                    <>
                                                                        <span class="h-2 w-2 rounded-full" style={{background: item().color || "#94a3b8"}}/>
                                                                        <CategoryIcon name={item().lucide_icon} size={14}/>
                                                                        <span>{item().name}</span>
                                                                    </>
                                                                )}
                                                            </Show>
                                                        </div>
                                                        <div class="mt-1 flex flex-wrap gap-1">
                                                            <Show when={transaction.tags.length > 0} fallback={<span class="text-[10px] text-slate-300">Без тегов</span>}>
                                                                <For each={transaction.tags}>
                                                                    {(tagId) => {
                                                                        const tag = () => tagMap().get(tagId);
                                                                        return <span class="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{tag()?.name ?? tagId}</span>;
                                                                    }}
                                                                </For>
                                                            </Show>
                                                        </div>
                                                    </td>
                                                    <td class={`whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums ${transaction.amount >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                                                        {fmtMoney(transaction.amount, transaction.currency)}
                                                    </td>
                                                </tr>
                                            );
                                        }}
                                    </For>
                                    </tbody>
                                </table>
                            </div>
                        </Show>
                    </Show>
                </div>
            </section>
        </div>
    );
};
