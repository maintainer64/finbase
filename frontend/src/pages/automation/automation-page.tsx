import {Component, createEffect, createMemo, createSignal, For, Show, untrack} from "solid-js";
import {toast} from "solid-toast";
import {
    ArrowDownLeft,
    ArrowRight,
    ArrowUpRight,
    Check,
    CircleDollarSign,
    Layers3,
    Pencil,
    Plus,
    RefreshCw,
    Scale,
    Trash2,
    WandSparkles,
    X,
} from "lucide-solid";
import {FaSolidSpinner} from "solid-icons/fa";
import {Space} from "@/components/ui/card";
import {CategoryIcon} from "@/components/ui/category-icon";
import {
    AccountRecord,
    CategoryRecord,
    OperationGroupRecord,
    TransactionRecord,
    TransactionRuleRecord,
    TransferRecord,
    UserRecord,
} from "@/shared/finbase/models";
import {FinbaseService} from "@/shared/providers/services/finbase/finbase-service";
import {openFinbaseTab, useFullAppWindow} from "@/shared/open-finbase";
import {useSetting} from "@/shared/settings";

type RuleDraft = {
    id?: string;
    name: string;
    match: string;
    nature: "income" | "expense";
    category: string;
    effectiveDate: string;
    active: boolean;
};

const emptyDraft = (): RuleDraft => ({
    name: "",
    match: "",
    nature: "expense",
    category: "",
    effectiveDate: "",
    active: true,
});

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100";
const money = new Intl.NumberFormat("ru-RU", {style: "currency", currency: "RUB", maximumFractionDigits: 2});
const shortDate = new Intl.DateTimeFormat("ru-RU", {day: "2-digit", month: "short", year: "numeric"});
const dateTime = new Intl.DateTimeFormat("ru-RU", {day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"});

const formatDate = (value?: string, withTime = false): string => {
    if (!value) return "—";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return (withTime ? dateTime : shortDate).format(parsed);
};

const transactionType = (rule: TransactionRuleRecord): "income" | "expense" => {
    const condition = rule.conditions?.find((item) => ["transaction_type", "type"].includes(item.condition_type));
    return condition?.value === "income" ? "income" : "expense";
};

const transactionName = (rule: TransactionRuleRecord): string =>
    String(rule.conditions?.find((item) => ["transaction_name", "name", "note"].includes(item.condition_type))?.value ?? "");

const ruleCategoryName = (rule: TransactionRuleRecord): string => {
    const action = rule.actions?.find((item) => ["set_transaction_category", "set_category"].includes(item.action_type));
    return action?.value_ref?.name || String(action?.value ?? "");
};

const RuleDialog: Component<{
    initial: RuleDraft;
    categories: CategoryRecord[];
    saving: boolean;
    onSave: (draft: RuleDraft) => void;
    onClose: () => void;
}> = (props) => {
    const [draft, setDraft] = createSignal<RuleDraft>({...untrack(() => props.initial)});
    const change = <K extends keyof RuleDraft>(key: K, value: RuleDraft[K]) =>
        setDraft((current) => ({...current, [key]: value}));

    const submit = () => {
        const value = draft();
        if (!value.name.trim() || !value.match.trim() || !value.category) {
            toast.error("Заполните название, текст операции и категорию");
            return;
        }
        props.onSave(value);
    };

    return (
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" onClick={() => props.onClose()}>
            <div class="w-full max-w-xl rounded-3xl border border-white/60 bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
                <div class="mb-5 flex items-center justify-between">
                    <div>
                        <div class="text-xs font-semibold uppercase tracking-[.18em] text-blue-500">Правило операций</div>
                        <h2 class="mt-1 text-xl font-semibold text-slate-900">{draft().id ? "Изменить правило" : "Новое правило"}</h2>
                    </div>
                    <button class="flex size-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => props.onClose()} aria-label="Закрыть">
                        <X size={19}/>
                    </button>
                </div>

                <div class="grid gap-4 sm:grid-cols-2">
                    <label class="sm:col-span-2">
                        <span class="mb-1.5 block text-xs font-medium text-slate-500">Название правила</span>
                        <input class={inputClass} value={draft().name} onInput={(e) => change("name", e.currentTarget.value)} placeholder="Например, РЖД"/>
                    </label>
                    <label class="sm:col-span-2">
                        <span class="mb-1.5 block text-xs font-medium text-slate-500">Название операции содержит</span>
                        <input class={inputClass} value={draft().match} onInput={(e) => change("match", e.currentTarget.value)} placeholder="Текст из банковской операции"/>
                    </label>
                    <label>
                        <span class="mb-1.5 block text-xs font-medium text-slate-500">Тип операции</span>
                        <select class={inputClass} value={draft().nature} onInput={(e) => change("nature", e.currentTarget.value as RuleDraft["nature"])}>
                            <option value="expense">Расход</option>
                            <option value="income">Поступление</option>
                        </select>
                    </label>
                    <label>
                        <span class="mb-1.5 block text-xs font-medium text-slate-500">Категория</span>
                        <select class={inputClass} value={draft().category} onInput={(e) => change("category", e.currentTarget.value)}>
                            <option value="">— выберите —</option>
                            <For each={props.categories}>{(category) => <option value={category.id}>{category.name}</option>}</For>
                        </select>
                    </label>
                    <label>
                        <span class="mb-1.5 block text-xs font-medium text-slate-500">Действует с даты</span>
                        <input type="date" class={inputClass} value={draft().effectiveDate} onInput={(e) => change("effectiveDate", e.currentTarget.value)}/>
                    </label>
                    <label class="flex items-end">
                        <span class="flex h-[38px] w-full cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-3 text-sm text-slate-700">
                            <input type="checkbox" checked={draft().active} onChange={(e) => change("active", e.currentTarget.checked)}/>
                            Применять автоматически
                        </span>
                    </label>
                </div>

                <div class="mt-6 flex justify-end gap-2">
                    <button class="rounded-xl px-4 py-2 text-sm text-slate-600 hover:bg-slate-100" onClick={() => props.onClose()}>Отмена</button>
                    <button class="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50" disabled={props.saving} onClick={submit}>
                        <Show when={!props.saving} fallback={<FaSolidSpinner class="animate-spin"/>}><Check size={16}/></Show>
                        Сохранить
                    </button>
                </div>
            </div>
        </div>
    );
};

export const AutomationPage: Component = () => {
    const standalone = useFullAppWindow();
    const [finbaseUrl] = useSetting("finbase-url");
    const [finbaseToken] = useSetting("finbase-token");
    const service = createMemo(() => finbaseUrl() ? new FinbaseService(finbaseUrl(), finbaseToken()) : null);

    const [accounts, setAccounts] = createSignal<AccountRecord[]>([]);
    const [users, setUsers] = createSignal<UserRecord[]>([]);
    const [categories, setCategories] = createSignal<CategoryRecord[]>([]);
    const [rules, setRules] = createSignal<TransactionRuleRecord[]>([]);
    const [groups, setGroups] = createSignal<OperationGroupRecord[]>([]);
    const [transfers, setTransfers] = createSignal<TransferRecord[]>([]);
    const [transactions, setTransactions] = createSignal<TransactionRecord[]>([]);
    const [groupCategories, setGroupCategories] = createSignal<Record<string, string>>({});
    const [loading, setLoading] = createSignal(true);
    const [error, setError] = createSignal("");
    const [saving, setSaving] = createSignal(false);
    const [dialog, setDialog] = createSignal<RuleDraft | null>(null);

    const accountById = createMemo(() => new Map(accounts().map((item) => [item.id, item])));
    const userById = createMemo(() => new Map(users().map((item) => [item.id, item])));
    const accountName = (account?: AccountRecord): string => {
        if (!account) return "Неизвестный счёт";
        const owner = userById().get(account.owner);
        const ownerName = owner?.name || owner?.email;
        return ownerName ? `${account.name} · ${ownerName}` : account.name;
    };
    const categoryById = createMemo(() => new Map(categories().map((item) => [item.id, item])));
    const transactionById = createMemo(() => new Map(transactions().map((item) => [item.id, item])));
    const pendingTransfers = createMemo(() => transfers().filter((item) => item.status === "pending"));
    const transferHistory = createMemo(() => transfers()
        .filter((item) => item.status !== "pending")
        .sort((a, b) => String(b.updated || b.created).localeCompare(String(a.updated || a.created))));

    const load = async () => {
        const api = service();
        if (!api || !standalone()) {
            setLoading(false);
            return;
        }
        setLoading(true);
        setError("");
        try {
            const [accountList, userList, categoryList, ruleList, groupList, transferList] = await Promise.all([
                api.getAccountsList(), api.getUsers(), api.getCategories(), api.getTransactionRules(), api.getOperationGroups(), api.getTransfers(),
            ]);
            setAccounts(accountList);
            setUsers(userList);
            setCategories(categoryList.sort((a, b) => a.name.localeCompare(b.name, "ru")));
            setRules(ruleList.sort((a, b) => a.name.localeCompare(b.name, "ru")));
            setGroups(groupList.sort((a, b) => b.transactions_count - a.transactions_count));
            setTransfers(transferList);
            const ids = [...new Set(transferList.flatMap((item) => [item.inflow_transaction, item.outflow_transaction]).filter(Boolean))];
            setTransactions(ids.length
                ? await api.getTransactions(ids.map((id) => `id = ${JSON.stringify(id)}`).join(" || "))
                : []);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setLoading(false);
        }
    };

    createEffect(() => {
        finbaseUrl();
        finbaseToken();
        standalone();
        void load();
    });

    const draftFromRule = (rule: TransactionRuleRecord): RuleDraft => {
        const categoryAction = rule.actions?.find((item) => ["set_transaction_category", "set_category"].includes(item.action_type));
        const categoryId = categoryAction?.value_ref?.id;
        const categoryName = categoryAction?.value_ref?.name || String(categoryAction?.value ?? "");
        return {
            id: rule.id,
            name: rule.name,
            match: transactionName(rule),
            nature: transactionType(rule),
            category: categoryById().has(categoryId || "")
                ? categoryId!
                : categories().find((item) => item.name === categoryName)?.id || "",
            effectiveDate: String(rule.effective_date || "").split(/[T ]/)[0],
            active: rule.active,
        };
    };

    const saveRule = async (draft: RuleDraft) => {
        const api = service();
        const category = categoryById().get(draft.category);
        if (!api || !category) return;
        setSaving(true);
        try {
            const payload = {
                name: draft.name.trim(),
                resource_type: "transaction" as const,
                active: draft.active,
                effective_date: draft.effectiveDate ? `${draft.effectiveDate}T00:00:00.000Z` : "",
                conditions: [
                    {condition_type: "transaction_name", operator: "like", value: draft.match.trim()},
                    {condition_type: "transaction_type", operator: "=", value: draft.nature},
                ],
                actions: [{
                    action_type: "set_transaction_category",
                    value: category.name,
                    value_ref: {type: "Category", id: category.id, name: category.name},
                }],
            };
            if (draft.id) await api.updateRecord("transaction_rules", draft.id, payload);
            else await api.createRecord("transaction_rules", payload);
            toast.success(draft.id ? "Правило обновлено" : "Правило создано и применено к истории");
            setDialog(null);
            await load();
        } catch (reason) {
            toast.error(`Не удалось сохранить правило: ${String(reason)}`);
        } finally {
            setSaving(false);
        }
    };

    const createRuleFromGroup = async (group: OperationGroupRecord) => {
        const category = groupCategories()[group.id];
        if (!category) {
            toast.error("Сначала выберите категорию");
            return;
        }
        await saveRule({
            name: group.name,
            match: group.name,
            nature: group.transaction_type,
            category,
            effectiveDate: "",
            active: true,
        });
    };

    const toggleRule = async (rule: TransactionRuleRecord) => {
        const api = service();
        if (!api) return;
        try {
            await api.updateRecord("transaction_rules", rule.id, {active: !rule.active});
            toast.success(rule.active ? "Правило выключено" : "Правило включено");
            await load();
        } catch (reason) {
            toast.error(`Не удалось изменить правило: ${String(reason)}`);
        }
    };

    const deleteRule = async (rule: TransactionRuleRecord) => {
        const api = service();
        if (!api || !window.confirm(`Удалить правило «${rule.name}»?`)) return;
        try {
            await api.deleteRecord("transaction_rules", rule.id);
            toast.success("Правило удалено");
            await load();
        } catch (reason) {
            toast.error(`Не удалось удалить правило: ${String(reason)}`);
        }
    };

    const setTransferStatus = async (transfer: TransferRecord, status: "accepted" | "rejected") => {
        const api = service();
        if (!api) return;
        try {
            await api.updateRecord("transfers", transfer.id, {status});
            toast.success(status === "accepted" ? "Перевод подтверждён" : "Совпадение отклонено");
            await load();
        } catch (reason) {
            toast.error(`Не удалось изменить перевод: ${String(reason)}`);
        }
    };

    const transactionCard = (transactionId: string, direction: "in" | "out") => {
        const transaction = transactionById().get(transactionId);
        const account = transaction ? accountById().get(transaction.account) : undefined;
        return (
            <div class="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <div class="mb-2 flex items-center gap-2 text-xs font-medium text-slate-500">
                    {direction === "out" ? <ArrowUpRight size={15} class="text-rose-500"/> : <ArrowDownLeft size={15} class="text-emerald-500"/>}
                    {direction === "out" ? "Списание" : "Поступление"} · {accountName(account)}
                </div>
                <div class={`text-lg font-semibold ${direction === "out" ? "text-rose-600" : "text-emerald-600"}`}>
                    {transaction ? money.format(transaction.amount) : "—"}
                </div>
                <div class="mt-1 truncate text-sm text-slate-700" title={transaction?.note}>{transaction?.note || "Без описания"}</div>
                <div class="mt-1 text-xs text-slate-400">{formatDate(transaction?.date, true)}</div>
            </div>
        );
    };

    return (
        <Show when={standalone()} fallback={
            <Space class="m-4 p-8 text-center">
                <WandSparkles class="mx-auto mb-3 text-blue-500" size={34}/>
                <h1 class="text-lg font-semibold text-slate-900">Автоматика открывается на большом экране</h1>
                <p class="mx-auto mt-2 max-w-md text-sm text-slate-500">Там помещаются группы операций, правила и проверка найденных переводов.</p>
                <button class="mt-5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white" onClick={() => openFinbaseTab("automation")}>Открыть Finbase</button>
            </Space>
        }>
            <div class="mx-auto flex max-w-7xl flex-col gap-6 p-4 pb-12 sm:p-6">
                <header class="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.2em] text-blue-500"><WandSparkles size={15}/> Автоматика</div>
                        <h1 class="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Разметка и переводы</h1>
                        <p class="mt-1 text-sm text-slate-500">Баланс счетов считается автоматически по операциям.</p>
                    </div>
                    <div class="flex gap-2">
                        <button class="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm hover:bg-slate-50" disabled={loading()} onClick={load}>
                            <RefreshCw size={16} class={loading() ? "animate-spin" : ""}/> Обновить
                        </button>
                        <button class="flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800" onClick={() => setDialog(emptyDraft())}>
                            <Plus size={16}/> Правило
                        </button>
                    </div>
                </header>

                <Show when={error()}>
                    <div class="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error()}</div>
                </Show>

                <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <For each={[
                        {label: "Активные правила", value: rules().filter((item) => item.active).length, icon: WandSparkles, tone: "text-blue-600 bg-blue-50"},
                        {label: "Группы без категории", value: groups().length, icon: Layers3, tone: "text-violet-600 bg-violet-50"},
                        {label: "Ждут проверки", value: pendingTransfers().length, icon: Scale, tone: "text-amber-600 bg-amber-50"},
                        {label: "Счетов в балансе", value: accounts().length, icon: CircleDollarSign, tone: "text-emerald-600 bg-emerald-50"},
                    ]}>{(item) => (
                        <div class="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
                            <div class={`mb-3 flex size-9 items-center justify-center rounded-xl ${item.tone}`}><item.icon size={18}/></div>
                            <div class="text-2xl font-semibold text-slate-900">{item.value}</div>
                            <div class="text-xs text-slate-500">{item.label}</div>
                        </div>
                    )}</For>
                </div>

                <Show when={!loading()} fallback={<div class="flex justify-center py-20 text-blue-500"><FaSolidSpinner class="animate-spin text-2xl"/></div>}>
                    <section class="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                        <div class="border-b border-slate-100 px-5 py-4">
                            <h2 class="font-semibold text-slate-900">Похожие операции без категории</h2>
                            <p class="mt-1 text-xs text-slate-500">Повторяющиеся названия собраны автоматически. Выберите категорию — правило применится и к уже загруженной истории.</p>
                        </div>
                        <Show when={groups().length} fallback={<div class="p-8 text-center text-sm text-slate-400">Повторяющихся неразмеченных операций нет.</div>}>
                            <div class="divide-y divide-slate-100">
                                <For each={groups()}>{(group) => (
                                    <div class="grid items-center gap-3 px-5 py-4 md:grid-cols-[minmax(0,1.4fr)_110px_150px_minmax(180px,.8fr)_auto]">
                                        <div class="min-w-0">
                                            <div class="truncate font-medium text-slate-800" title={group.name}>{group.name}</div>
                                            <div class="mt-1 text-xs text-slate-400">{formatDate(group.first_date)} — {formatDate(group.last_date)}</div>
                                        </div>
                                        <span class={`w-fit rounded-full px-2.5 py-1 text-xs font-medium ${group.transaction_type === "income" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                                            {group.transaction_type === "income" ? "Поступление" : "Расход"}
                                        </span>
                                        <div class="text-sm text-slate-600"><b>{group.transactions_count}</b> операций<br/><span class="text-xs text-slate-400">{money.format(group.total)}</span></div>
                                        <select class={inputClass} value={groupCategories()[group.id] || ""} onInput={(e) => setGroupCategories((current) => ({...current, [group.id]: e.currentTarget.value}))}>
                                            <option value="">Выберите категорию…</option>
                                            <For each={categories()}>{(category) => <option value={category.id}>{category.name}</option>}</For>
                                        </select>
                                        <button class="whitespace-nowrap rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700" onClick={() => void createRuleFromGroup(group)}>Создать правило</button>
                                    </div>
                                )}</For>
                            </div>
                        </Show>
                    </section>

                    <section class="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                        <div class="border-b border-slate-100 px-5 py-4">
                            <h2 class="font-semibold text-slate-900">Переводы на проверке</h2>
                            <p class="mt-1 text-xs text-slate-500">Равные входящая и исходящая операции между разными счетами, найденные в 30-минутном окне.</p>
                        </div>
                        <Show when={pendingTransfers().length} fallback={<div class="p-8 text-center text-sm text-slate-400">Новых совпадений нет.</div>}>
                            <div class="divide-y divide-slate-100">
                                <For each={pendingTransfers()}>{(transfer) => (
                                    <div class="p-5">
                                        <div class="flex flex-col items-stretch gap-3 md:flex-row md:items-center">
                                            {transactionCard(transfer.outflow_transaction, "out")}
                                            <ArrowRight class="hidden shrink-0 text-slate-300 md:block" size={21}/>
                                            {transactionCard(transfer.inflow_transaction, "in")}
                                            <div class="flex shrink-0 justify-end gap-2 md:flex-col">
                                                <button class="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100" title="Подтвердить перевод" aria-label="Подтвердить перевод" onClick={() => void setTransferStatus(transfer, "accepted")}><Check size={19}/></button>
                                                <button class="flex size-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100" title="Отклонить совпадение" aria-label="Отклонить совпадение" onClick={() => void setTransferStatus(transfer, "rejected")}><X size={19}/></button>
                                            </div>
                                        </div>
                                        <Show when={transfer.notes}><div class="mt-2 text-xs text-slate-400">{transfer.notes}</div></Show>
                                    </div>
                                )}</For>
                            </div>
                        </Show>
                    </section>

                    <section class="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                        <div class="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                            <div>
                                <h2 class="font-semibold text-slate-900">Правила разметки</h2>
                                <p class="mt-1 text-xs text-slate-500">Формат условий и действий хранится в PocketBase без промежуточных моделей.</p>
                            </div>
                            <span class="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">{rules().length}</span>
                        </div>
                        <Show when={rules().length} fallback={<div class="p-8 text-center text-sm text-slate-400">Правил пока нет.</div>}>
                            <div class="divide-y divide-slate-100">
                                <For each={rules()}>{(rule) => {
                                    const category = () => categories().find((item) => item.name === ruleCategoryName(rule));
                                    return (
                                        <div class={`grid items-center gap-3 px-5 py-4 md:grid-cols-[minmax(160px,.8fr)_minmax(220px,1.3fr)_minmax(160px,.8fr)_auto] ${rule.active ? "" : "opacity-55"}`}>
                                            <div>
                                                <div class="font-medium text-slate-800">{rule.name}</div>
                                                <div class="mt-1 text-xs text-slate-400">{rule.effective_date ? `с ${formatDate(rule.effective_date)}` : "без ограничения по дате"}</div>
                                            </div>
                                            <div class="min-w-0 text-sm text-slate-600">
                                                <span class={`mr-2 rounded-full px-2 py-0.5 text-[11px] ${transactionType(rule) === "income" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{transactionType(rule) === "income" ? "доход" : "расход"}</span>
                                                содержит «<span class="font-medium text-slate-800">{transactionName(rule)}</span>»
                                            </div>
                                            <div class="flex items-center gap-2 text-sm text-slate-700">
                                                <span class="flex size-8 items-center justify-center rounded-lg" style={{color: category()?.color, "background-color": `${category()?.color || "#64748b"}16`}}><CategoryIcon name={category()?.lucide_icon}/></span>
                                                {ruleCategoryName(rule) || "Категория не найдена"}
                                            </div>
                                            <div class="flex justify-end gap-1">
                                                <button class={`rounded-full px-3 py-1.5 text-xs font-medium ${rule.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`} onClick={() => void toggleRule(rule)}>{rule.active ? "Включено" : "Выключено"}</button>
                                                <button class="flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => setDialog(draftFromRule(rule))} aria-label="Изменить"><Pencil size={15}/></button>
                                                <button class="flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => void deleteRule(rule)} aria-label="Удалить"><Trash2 size={15}/></button>
                                            </div>
                                        </div>
                                    );
                                }}</For>
                            </div>
                        </Show>
                    </section>

                    <Show when={transferHistory().length}>
                        <section class="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                            <div class="border-b border-slate-100 px-5 py-4"><h2 class="font-semibold text-slate-900">История проверки переводов</h2></div>
                            <div class="divide-y divide-slate-100">
                                <For each={transferHistory()}>{(transfer) => {
                                    const outflow = () => transactionById().get(transfer.outflow_transaction);
                                    const inflow = () => transactionById().get(transfer.inflow_transaction);
                                    return (
                                        <div class="grid items-center gap-3 px-5 py-3 text-sm md:grid-cols-[1fr_auto_1fr_auto]">
                                            <div class="truncate text-slate-600">{accountName(accountById().get(outflow()?.account || ""))} · {outflow()?.note || "Без описания"}</div>
                                            <ArrowRight size={16} class="text-slate-300"/>
                                            <div class="truncate text-slate-600">{accountName(accountById().get(inflow()?.account || ""))} · {money.format(Math.abs(inflow()?.amount || 0))}</div>
                                            <span class={`w-fit rounded-full px-2.5 py-1 text-xs ${transfer.status === "accepted" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{transfer.status === "accepted" ? "Перевод" : "Отклонено"}</span>
                                        </div>
                                    );
                                }}</For>
                            </div>
                        </section>
                    </Show>
                </Show>
            </div>

            <Show when={dialog()}>{(current) => <RuleDialog initial={current()} categories={categories()} saving={saving()} onSave={(draft) => void saveRule(draft)} onClose={() => setDialog(null)}/>}</Show>
        </Show>
    );
};
