import {Component, createEffect, createSignal, onCleanup} from "solid-js";
import {toast} from "solid-toast";
import {SearchableSelect, type SelectOption} from "@/components/ui/searchable-select";
import type {TransactionRecord} from "@/shared/finbase/models";
import {FinbaseService} from "@/shared/providers/services/finbase/finbase-service";

export interface RelationOption {
    id: string;
    label: string;
    color?: string;
    icon?: string;
    account?: string;
    amount?: number;
    currency?: string;
    date?: string;
    externalId?: string;
    providerCode?: string;
}

const transactionDate = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
});

const selectOption = (
    transaction: Pick<TransactionRecord, "id" | "account" | "amount" | "currency" | "date" | "note" | "external_id">,
    accounts: RelationOption[],
): SelectOption => {
    const account = accounts.find(item => item.id === transaction.account);
    const date = new Date(transaction.date);
    const dateLabel = Number.isNaN(date.getTime()) ? transaction.date : transactionDate.format(date);
    const amount = new Intl.NumberFormat("ru-RU", {maximumFractionDigits: 2}).format(transaction.amount);
    return {
        value: transaction.id,
        label: transaction.note || "Без описания",
        description: [dateLabel, account?.label || "Счёт не найден", `${amount} ${transaction.currency}`, transaction.external_id]
            .filter(Boolean)
            .join(" · "),
    };
};

interface TransactionRelationInputProps {
    service: FinbaseService;
    value: string;
    nature: "income" | "expense";
    transactions: RelationOption[];
    accounts: RelationOption[];
    onChange: (value: string) => void;
    onCreate: () => void;
}

export const TransactionRelationInput: Component<TransactionRelationInputProps> = (props) => {
    const initialOptions = () => props.transactions
        .filter(item => props.nature === "income" ? Number(item.amount) > 0 : Number(item.amount) < 0)
        .map(item => selectOption({
            id: item.id,
            account: item.account ?? "",
            amount: item.amount ?? 0,
            currency: item.currency ?? "",
            date: item.date ?? "",
            note: item.label,
            external_id: item.externalId ?? "",
        }, props.accounts));
    const [options, setOptions] = createSignal<SelectOption[]>(initialOptions());
    const [loading, setLoading] = createSignal(false);
    let searchTimer: number | undefined;
    let requestId = 0;
    let loadedSelected = "";

    const mergeOptions = (incoming: SelectOption[]) => {
        setOptions(current => {
            const byId = new Map(current.map(item => [item.value, item]));
            for (const item of incoming) byId.set(item.value, item);
            return [...byId.values()];
        });
    };

    createEffect(() => mergeOptions(initialOptions()));

    createEffect(() => {
        const selected = props.value;
        if (!selected || loadedSelected === selected || options().some(item => item.value === selected)) return;
        loadedSelected = selected;
        const service = props.service;
        const accounts = props.accounts;
        void service.getTransactionsByIds([selected]).then(items => {
            mergeOptions(items.map(item => selectOption(item, accounts)));
        });
    });

    const search = (query: string) => {
        if (searchTimer !== undefined) window.clearTimeout(searchTimer);
        const currentRequest = ++requestId;
        const service = props.service;
        const nature = props.nature;
        const accounts = props.accounts;
        const selectedValue = props.value;
        setLoading(true);
        searchTimer = window.setTimeout(() => {
            const needle = query.trim().toLocaleLowerCase("ru-RU");
            const accountIds = needle
                ? accounts
                    .filter(account => `${account.label} ${account.providerCode ?? ""}`.toLocaleLowerCase("ru-RU").includes(needle))
                    .map(account => account.id)
                : [];
            void service.searchTransactions(query, nature, accountIds)
                .then(items => {
                    if (requestId !== currentRequest) return;
                    const incoming = items.map(item => selectOption(item, accounts));
                    setOptions(current => {
                        const selected = current.find(item => item.value === selectedValue);
                        return selected && !incoming.some(item => item.value === selected.value)
                            ? [selected, ...incoming]
                            : incoming;
                    });
                })
                .catch(cause => {
                    if (requestId === currentRequest) toast.error(cause instanceof Error ? cause.message : String(cause));
                })
                .finally(() => {
                    if (requestId === currentRequest) setLoading(false);
                });
        }, query ? 250 : 0);
    };

    onCleanup(() => {
        if (searchTimer !== undefined) window.clearTimeout(searchTimer);
        requestId++;
    });

    return (
        <SearchableSelect
            value={props.value}
            options={options()}
            onChange={props.onChange}
            onSearch={search}
            loading={loading()}
            placeholder={props.nature === "income" ? "Выберите поступление…" : "Выберите расход…"}
            searchPlaceholder="Описание, счёт, сумма или внешний id…"
            emptyText="Подходящих операций не найдено"
            actionLabel={props.nature === "income" ? "Создать поступление" : "Создать расход"}
            onAction={props.onCreate}
            clearable={false}
        />
    );
};
