import {Component, createEffect, createMemo, createSignal, For, onCleanup, onMount, Show, untrack} from "solid-js";
import {toast} from "solid-toast";
import {
    ArrowDownLeft,
    ArrowRight,
    ArrowUpRight,
    Check,
    CircleDollarSign,
    Layers3,
    ListChecks,
    Pencil,
    Plus,
    RefreshCw,
    Scale,
    SkipForward,
    Sparkles,
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

type AutomationTab = "transfers" | "groups" | "rules";

const emptyDraft = (): RuleDraft => ({
    name: "",
    match: "",
    nature: "expense",
    category: "",
    effectiveDate: "",
    active: true,
});

const rulePayload = (draft: RuleDraft, category: CategoryRecord) => ({
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

const PAGE_SIZE = 20;
const GROUP_OPERATIONS_PAGE_SIZE = 50;

interface PageState {
    page: number;
    totalPages: number;
    totalItems: number;
    loading: boolean;
    initialized: boolean;
}

const emptyPage = (): PageState => ({page: 0, totalPages: 1, totalItems: 0, loading: false, initialized: false});
const loadedPage = (result: {page: number; totalPages: number; totalItems: number}): PageState => ({
    page: result.page,
    totalPages: result.totalPages,
    totalItems: result.totalItems,
    loading: false,
    initialized: true,
});

const LoadMoreSentinel: Component<{
    hasMore: boolean;
    loading: boolean;
    onLoad: () => void;
}> = (props) => {
    let anchor: HTMLDivElement | undefined;
    onMount(() => {
        if (!anchor) return;
        const observer = new IntersectionObserver((entries) => {
            if (entries.some(entry => entry.isIntersecting) && props.hasMore && !props.loading) props.onLoad();
        }, {rootMargin: "240px"});
        observer.observe(anchor);
        onCleanup(() => observer.disconnect());
    });
    return (
        <div ref={(element) => { anchor = element; }} class={props.hasMore || props.loading ? "flex justify-center px-5 py-4" : "hidden"}>
            <Show when={props.loading} fallback={<span class="text-xs text-slate-400">Прокрутите ниже, чтобы загрузить ещё</span>}>
                <FaSolidSpinner class="animate-spin text-blue-500"/>
            </Show>
        </div>
    );
};

const AutomationSkeleton: Component = () => (
    <div class="space-y-6 animate-pulse">
        <For each={[0, 1, 2]}>{() => (
            <div class="overflow-hidden rounded-3xl border border-slate-200 bg-white">
                <div class="h-16 border-b border-slate-100 bg-slate-50"/>
                <div class="space-y-3 p-5">
                    <div class="h-14 rounded-xl bg-slate-100"/>
                    <div class="h-14 rounded-xl bg-slate-100"/>
                </div>
            </div>
        )}</For>
    </div>
);

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

const GroupOperationsDialog: Component<{
    group: OperationGroupRecord;
    service: FinbaseService;
    categories: CategoryRecord[];
    initialCategory: string;
    accountLabel: (accountId: string) => string;
    onApplied: (count: number) => void;
    onEmpty: () => void;
    onClose: () => void;
}> = (props) => {
    const [items, setItems] = createSignal<TransactionRecord[]>([]);
    const [selected, setSelected] = createSignal<Set<string>>(new Set());
    const [category, setCategory] = createSignal(props.initialCategory);
    const [pageState, setPageState] = createSignal<PageState>(emptyPage());
    const [loading, setLoading] = createSignal(true);
    const [savingSelection, setSavingSelection] = createSignal(false);
    const [error, setError] = createSignal("");

    const loadPage = async (page: number, reset = false) => {
        const current = pageState();
        if (!reset && (current.loading || current.page >= current.totalPages)) return;
        if (reset) setLoading(true);
        setPageState(state => ({...state, loading: true}));
        setError("");
        try {
            const result = await props.service.getOperationGroupTransactionsPage(
                props.group,
                page,
                GROUP_OPERATIONS_PAGE_SIZE,
            );
            if (reset && result.totalItems === 0) {
                toast("Группа уже размечена и больше не содержит операций");
                props.onEmpty();
                return;
            }
            setItems(existing => reset ? result.items : [...existing, ...result.items]);
            setPageState(loadedPage(result));
        } catch (reason) {
            setPageState(state => ({...state, loading: false}));
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            if (reset) setLoading(false);
        }
    };

    onMount(() => void loadPage(1, true));

    const allLoadedSelected = createMemo(() => items().length > 0 && items().every(item => selected().has(item.id)));
    const toggle = (id: string) => setSelected(current => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
    });
    const toggleLoaded = () => setSelected(current => {
        const next = new Set(current);
        if (allLoadedSelected()) items().forEach(item => next.delete(item.id));
        else items().forEach(item => next.add(item.id));
        return next;
    });

    const applySelection = async () => {
        const ids = [...selected()];
        if (!category()) {
            toast.error("Выберите категорию");
            return;
        }
        if (!ids.length) {
            toast.error("Отметьте хотя бы одну операцию");
            return;
        }
        setSavingSelection(true);
        setError("");
        try {
            await props.service.categorizeTransactions(ids, category());
            toast.success(`Размечено операций: ${ids.length}`);
            props.onApplied(ids.length);
        } catch (reason) {
            const message = reason instanceof Error ? reason.message : String(reason);
            setError(message);
            toast.error(`Не удалось разметить операции: ${message}`);
        } finally {
            setSavingSelection(false);
        }
    };

    return (
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" onClick={() => props.onClose()}>
            <div class="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/60 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
                <div class="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
                    <div class="min-w-0">
                        <div class="text-xs font-semibold uppercase tracking-[.18em] text-blue-500">Массовая разметка</div>
                        <h2 class="mt-1 truncate text-xl font-semibold text-slate-900" title={props.group.name}>{props.group.name}</h2>
                        <p class="mt-1 text-xs text-slate-500">Выберите только те операции, которым нужно назначить категорию. Правило при этом не создаётся.</p>
                    </div>
                    <button class="flex size-9 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => props.onClose()} aria-label="Закрыть"><X size={19}/></button>
                </div>

                <div class="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-slate-50/80 px-5 py-3">
                    <label class="min-w-56 flex-1">
                        <span class="sr-only">Категория</span>
                        <select class={inputClass} value={category()} onInput={(event) => setCategory(event.currentTarget.value)}>
                            <option value="">Выберите категорию…</option>
                            <For each={props.categories}>{(item) => <option value={item.id}>{item.name}</option>}</For>
                        </select>
                    </label>
                    <button type="button" class="secondary-button" onClick={toggleLoaded} disabled={items().length === 0}>
                        <ListChecks size={16}/>{allLoadedSelected() ? "Снять со всех загруженных" : "Выбрать все загруженные"}
                    </button>
                    <span class="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700">Выбрано: {selected().size}</span>
                </div>

                <div class="min-h-48 flex-1 overflow-auto">
                    <Show when={error()}><div class="m-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error()}</div></Show>
                    <Show when={!loading()} fallback={<div class="flex justify-center py-12"><FaSolidSpinner class="animate-spin text-xl text-blue-500"/></div>}>
                        <Show when={items().length > 0} fallback={<div class="p-10 text-center text-sm text-slate-400">В этой группе неразмеченных операций больше нет.</div>}>
                            <div class="divide-y divide-slate-100">
                                <For each={items()}>{(transaction) => (
                                    <label class="flex cursor-pointer items-center gap-3 px-5 py-3 transition hover:bg-blue-50/40">
                                        <input type="checkbox" checked={selected().has(transaction.id)} onChange={() => toggle(transaction.id)}/>
                                        <span class="min-w-0 flex-1">
                                            <span class="flex min-w-0 items-center gap-2">
                                                <span class="truncate text-sm font-medium text-slate-800">{transaction.note || "Без описания"}</span>
                                                <span class="hidden shrink-0 text-xs text-slate-400 sm:inline">{formatDate(transaction.date, true)}</span>
                                            </span>
                                            <span class="block truncate text-xs text-slate-400">{props.accountLabel(transaction.account)}<span class="sm:hidden"> · {formatDate(transaction.date, true)}</span></span>
                                        </span>
                                        <span class="shrink-0 text-right">
                                            <span class={`block text-sm font-semibold tabular-nums ${transaction.amount >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{money.format(transaction.amount)}</span>
                                            <span class="block text-[11px] text-slate-400">{transaction.currency}</span>
                                        </span>
                                    </label>
                                )}</For>
                            </div>
                            <LoadMoreSentinel
                                hasMore={pageState().page < pageState().totalPages}
                                loading={pageState().loading}
                                onLoad={() => void loadPage(pageState().page + 1)}
                            />
                        </Show>
                    </Show>
                </div>

                <div class="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-4">
                    <span class="text-xs text-slate-400">Показано {items().length} из {pageState().totalItems}</span>
                    <div class="flex gap-2">
                        <button type="button" class="rounded-xl px-4 py-2 text-sm text-slate-600 hover:bg-slate-100" onClick={() => props.onClose()}>Отмена</button>
                        <button type="button" class="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50" disabled={savingSelection() || selected().size === 0 || !category()} onClick={() => void applySelection()}>
                            <Show when={!savingSelection()} fallback={<FaSolidSpinner class="animate-spin"/>}><Check size={16}/></Show>
                            Разметить выбранные
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const InteractiveGroupsDialog: Component<{
    service: FinbaseService;
    categories: CategoryRecord[];
    accountLabel: (accountId: string) => string;
    onClose: () => void;
}> = (props) => {
    const [offset, setOffset] = createSignal(0);
    const [totalGroups, setTotalGroups] = createSignal(0);
    const [group, setGroup] = createSignal<OperationGroupRecord | null>(null);
    const [items, setItems] = createSignal<TransactionRecord[]>([]);
    const [selected, setSelected] = createSignal<Set<string>>(new Set());
    const [category, setCategory] = createSignal("");
    const [pageState, setPageState] = createSignal<PageState>(emptyPage());
    const [loading, setLoading] = createSignal(true);
    const [saving, setSaving] = createSignal(false);
    const [finished, setFinished] = createSignal(false);
    const [error, setError] = createSignal("");
    let requestId = 0;

    const loadOperations = async (currentGroup: OperationGroupRecord, page: number, reset = false) => {
        const activeRequest = requestId;
        setPageState(state => ({...state, loading: true}));
        try {
            const result = await props.service.getOperationGroupTransactionsPage(
                currentGroup,
                page,
                GROUP_OPERATIONS_PAGE_SIZE,
            );
            if (activeRequest !== requestId || group()?.group_key !== currentGroup.group_key) return;
            setItems(current => reset ? result.items : [...current, ...result.items]);
            setPageState(loadedPage(result));
            return result;
        } catch (reason) {
            if (activeRequest === requestId) {
                setPageState(state => ({...state, loading: false}));
                setError(reason instanceof Error ? reason.message : String(reason));
            }
        }
    };

    const loadGroup = async (nextOffset: number) => {
        const activeRequest = ++requestId;
        setLoading(true);
        setFinished(false);
        setError("");
        setGroup(null);
        setItems([]);
        setSelected(new Set<string>());
        setCategory("");
        setPageState(emptyPage());
        try {
            const result = await props.service.getOperationGroupsPage(nextOffset + 1, 1);
            if (activeRequest !== requestId) return;
            setOffset(nextOffset);
            setTotalGroups(result.totalItems);
            const nextGroup = result.items[0];
            if (!nextGroup) {
                setFinished(true);
                return;
            }
            setGroup(nextGroup);
            await loadOperations(nextGroup, 1, true);
        } catch (reason) {
            if (activeRequest === requestId) setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            if (activeRequest === requestId) setLoading(false);
        }
    };

    onMount(() => void loadGroup(0));

    const allLoadedSelected = createMemo(() => items().length > 0 && items().every(item => selected().has(item.id)));
    const toggle = (id: string) => setSelected(current => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
    });
    const toggleLoaded = () => setSelected(current => {
        const next = new Set(current);
        if (allLoadedSelected()) items().forEach(item => next.delete(item.id));
        else items().forEach(item => next.add(item.id));
        return next;
    });

    const refreshCurrentOperations = async (currentGroup: OperationGroupRecord) => {
        setSelected(new Set<string>());
        const result = await loadOperations(currentGroup, 1, true);
        if (result?.totalItems === 0) await loadGroup(offset());
    };

    const applySelection = async () => {
        const currentGroup = group();
        const ids = [...selected()];
        if (!currentGroup || saving()) return;
        if (!category()) {
            toast.error("Выберите категорию");
            return;
        }
        if (!ids.length) {
            toast.error("Отметьте хотя бы одну операцию");
            return;
        }
        setSaving(true);
        setError("");
        try {
            await props.service.categorizeTransactions(ids, category());
            toast.success(`Размечено операций: ${ids.length}`);
            await refreshCurrentOperations(currentGroup);
        } catch (reason) {
            const message = reason instanceof Error ? reason.message : String(reason);
            setError(message);
            toast.error(`Не удалось разметить операции: ${message}`);
        } finally {
            setSaving(false);
        }
    };

    const createRule = async () => {
        const currentGroup = group();
        const selectedCategory = props.categories.find(item => item.id === category());
        if (!currentGroup || saving()) return;
        if (!selectedCategory) {
            toast.error("Выберите категорию для правила");
            return;
        }
        setSaving(true);
        setError("");
        try {
            await props.service.createRecord("transaction_rules", rulePayload({
                name: currentGroup.name,
                match: currentGroup.name,
                nature: currentGroup.transaction_type,
                category: selectedCategory.id,
                effectiveDate: "",
                active: true,
            }, selectedCategory));
            toast.success("Правило создано и применено к истории");
            await loadGroup(offset());
        } catch (reason) {
            const message = reason instanceof Error ? reason.message : String(reason);
            setError(message);
            toast.error(`Не удалось создать правило: ${message}`);
        } finally {
            setSaving(false);
        }
    };

    const skip = () => {
        if (!saving()) void loadGroup(offset() + 1);
    };

    return (
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm" onClick={() => props.onClose()}>
            <div class="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/60 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
                <div class="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
                    <div class="min-w-0">
                        <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-violet-600"><Sparkles size={15}/> Интерактивная разметка</div>
                        <h2 class="mt-1 truncate text-xl font-semibold text-slate-900" title={group()?.name}>{group()?.name || (finished() ? "Группы закончились" : "Загрузка группы…")}</h2>
                        <Show when={group()}>{(current) => (
                            <p class="mt-1 text-xs text-slate-500">
                                {current().transaction_type === "income" ? "Поступления" : "Расходы"} · {formatDate(current().first_date)} — {formatDate(current().last_date)}
                            </p>
                        )}</Show>
                    </div>
                    <div class="flex items-center gap-3">
                        <span class="hidden rounded-full bg-slate-100 px-3 py-1.5 text-xs tabular-nums text-slate-500 sm:inline">offset {offset()} · групп {totalGroups()}</span>
                        <button class="flex size-9 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => props.onClose()} aria-label="Закрыть"><X size={19}/></button>
                    </div>
                </div>

                <Show when={error()}><div class="mx-5 mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error()}</div></Show>

                <Show when={!finished()} fallback={
                    <div class="flex min-h-80 flex-col items-center justify-center gap-4 p-10 text-center">
                        <span class="flex size-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><Check size={28}/></span>
                        <div><h3 class="font-semibold text-slate-900">Все доступные группы пройдены</h3><p class="mt-1 text-sm text-slate-500">Можно начать сначала и вернуться к пропущенным группам.</p></div>
                        <div class="flex gap-2"><button class="secondary-button" onClick={() => void loadGroup(0)}><RefreshCw size={15}/> Начать сначала</button><button class="primary-button" onClick={() => props.onClose()}>Готово</button></div>
                    </div>
                }>
                    <Show when={!loading() && group()} fallback={
                        <Show when={loading()} fallback={
                            <div class="flex min-h-80 flex-col items-center justify-center gap-3 p-8 text-center">
                                <p class="text-sm text-slate-500">Не удалось открыть следующую группу.</p>
                                <button class="secondary-button" onClick={() => void loadGroup(offset())}><RefreshCw size={15}/> Повторить</button>
                            </div>
                        }><div class="flex min-h-80 items-center justify-center"><FaSolidSpinner class="animate-spin text-2xl text-violet-500"/></div></Show>
                    }>
                        <div class="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-slate-50/80 px-5 py-3">
                            <label class="min-w-56 flex-1">
                                <span class="sr-only">Категория</span>
                                <select class={inputClass} value={category()} onInput={(event) => setCategory(event.currentTarget.value)}>
                                    <option value="">Выберите категорию…</option>
                                    <For each={props.categories}>{(item) => <option value={item.id}>{item.name}</option>}</For>
                                </select>
                            </label>
                            <button type="button" class="secondary-button" onClick={toggleLoaded} disabled={items().length === 0 || saving()}>
                                <ListChecks size={16}/>{allLoadedSelected() ? "Снять выделение" : "Выбрать загруженные"}
                            </button>
                            <button type="button" class="flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50" disabled={!category() || saving()} onClick={() => void createRule()}>
                                <WandSparkles size={16}/> Создать правило
                            </button>
                        </div>

                        <div class="min-h-48 flex-1 overflow-auto">
                            <Show when={items().length > 0} fallback={<div class="p-10 text-center text-sm text-slate-400">В группе больше нет неразмеченных операций.</div>}>
                                <div class="divide-y divide-slate-100">
                                    <For each={items()}>{(transaction) => (
                                        <label class="flex cursor-pointer items-center gap-3 px-5 py-3 transition hover:bg-violet-50/40">
                                            <input type="checkbox" checked={selected().has(transaction.id)} disabled={saving()} onChange={() => toggle(transaction.id)}/>
                                            <span class="min-w-0 flex-1">
                                                <span class="flex min-w-0 items-center gap-2"><span class="truncate text-sm font-medium text-slate-800">{transaction.note || "Без описания"}</span><span class="hidden shrink-0 text-xs text-slate-400 sm:inline">{formatDate(transaction.date, true)}</span></span>
                                                <span class="block truncate text-xs text-slate-400">{props.accountLabel(transaction.account)}<span class="sm:hidden"> · {formatDate(transaction.date, true)}</span></span>
                                            </span>
                                            <span class="shrink-0 text-right"><span class={`block text-sm font-semibold tabular-nums ${transaction.amount >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{money.format(transaction.amount)}</span><span class="block text-[11px] text-slate-400">{transaction.currency}</span></span>
                                        </label>
                                    )}</For>
                                </div>
                                <LoadMoreSentinel
                                    hasMore={pageState().page < pageState().totalPages}
                                    loading={pageState().loading}
                                    onLoad={() => { const current = group(); if (current) void loadOperations(current, pageState().page + 1); }}
                                />
                            </Show>
                        </div>

                        <div class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4">
                            <span class="text-xs text-slate-400">Показано {items().length} из {pageState().totalItems} · выбрано {selected().size}</span>
                            <div class="flex flex-wrap justify-end gap-2">
                                <button type="button" class="secondary-button" disabled={saving()} onClick={skip}><SkipForward size={16}/> Пропустить</button>
                                <button type="button" class="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50" disabled={saving() || selected().size === 0 || !category()} onClick={() => void applySelection()}>
                                    <Show when={!saving()} fallback={<FaSolidSpinner class="animate-spin"/>}><Check size={16}/></Show>
                                    Разметить выбранные
                                </button>
                            </div>
                        </div>
                    </Show>
                </Show>
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
    const [pendingTransfers, setPendingTransfers] = createSignal<TransferRecord[]>([]);
    const [transferHistory, setTransferHistory] = createSignal<TransferRecord[]>([]);
    const [transactions, setTransactions] = createSignal<TransactionRecord[]>([]);
    const [groupsPage, setGroupsPage] = createSignal<PageState>(emptyPage());
    const [pendingPage, setPendingPage] = createSignal<PageState>(emptyPage());
    const [historyPage, setHistoryPage] = createSignal<PageState>(emptyPage());
    const [groupCategories, setGroupCategories] = createSignal<Record<string, string>>({});
    const [rulesInitialized, setRulesInitialized] = createSignal(false);
    const [loading, setLoading] = createSignal(true);
    const [error, setError] = createSignal("");
    const [saving, setSaving] = createSignal(false);
    const [dialog, setDialog] = createSignal<RuleDraft | null>(null);
    const [groupDialog, setGroupDialog] = createSignal<OperationGroupRecord | null>(null);
    const [interactiveGroups, setInteractiveGroups] = createSignal(false);
    const [activeTab, setActiveTab] = createSignal<AutomationTab>("transfers");

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
    let loadRequestId = 0;

    const addTransactionDetails = async (api: FinbaseService, transferList: TransferRecord[]) => {
        const known = new Set(transactions().map(item => item.id));
        const ids = [...new Set(transferList
            .flatMap(item => [item.inflow_transaction, item.outflow_transaction])
            .filter(id => id && !known.has(id)))];
        if (!ids.length) return;
        const details = await api.getTransactionsByIds(ids);
        setTransactions(current => {
            const byId = new Map(current.map(item => [item.id, item]));
            for (const item of details) byId.set(item.id, item);
            return [...byId.values()];
        });
    };

    const load = async (tab: AutomationTab = activeTab()) => {
        const api = service();
        if (!api || !standalone()) {
            setLoading(false);
            return;
        }
        setLoading(true);
        setError("");
        const requestId = ++loadRequestId;
        if (tab === "groups") {
            setGroups([]);
            setGroupsPage(emptyPage());
        } else if (tab === "transfers") {
            setPendingTransfers([]);
            setTransferHistory([]);
            setTransactions([]);
            setPendingPage(emptyPage());
            setHistoryPage(emptyPage());
        } else {
            setRules([]);
            setRulesInitialized(false);
        }
        try {
            const metadataPromise = Promise.all([
                api.getAccountsList(),
                api.getUsers(),
                api.getCategories(),
            ]);
            const tabPromise = tab === "groups"
                ? api.getOperationGroupsPage(1, PAGE_SIZE)
                : tab === "transfers"
                    ? api.getTransfersPage(1, PAGE_SIZE, "pending")
                    : api.getTransactionRules();
            const [[accountList, userList, categoryList], tabResult] = await Promise.all([
                metadataPromise,
                tabPromise,
            ]);
            if (requestId !== loadRequestId) return;
            setAccounts(accountList);
            setUsers(userList);
            setCategories(categoryList.sort((a, b) => a.name.localeCompare(b.name, "ru")));
            if (tab === "groups") {
                const result = tabResult as Awaited<ReturnType<FinbaseService["getOperationGroupsPage"]>>;
                setGroups(result.items);
                setGroupsPage(loadedPage(result));
            } else if (tab === "transfers") {
                const result = tabResult as Awaited<ReturnType<FinbaseService["getTransfersPage"]>>;
                setPendingTransfers(result.items);
                setPendingPage(loadedPage(result));
                await addTransactionDetails(api, result.items);
            } else {
                const result = tabResult as TransactionRuleRecord[];
                setRules(result.sort((a, b) => a.name.localeCompare(b.name, "ru")));
                setRulesInitialized(true);
            }
        } catch (reason) {
            if (requestId === loadRequestId) setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            if (requestId === loadRequestId) setLoading(false);
        }
    };

    const loadMoreGroups = async () => {
        const api = service();
        const state = groupsPage();
        if (!api || state.loading || state.page >= state.totalPages) return;
        setGroupsPage(current => ({...current, loading: true}));
        try {
            const result = await api.getOperationGroupsPage(state.page + 1, PAGE_SIZE);
            setGroups(current => [...current, ...result.items]);
            setGroupsPage(loadedPage(result));
        } catch (reason) {
            setGroupsPage(current => ({...current, loading: false}));
            setError(reason instanceof Error ? reason.message : String(reason));
        }
    };

    const loadMoreTransfers = async (kind: "pending" | "history") => {
        const api = service();
        const state = kind === "pending" ? pendingPage() : historyPage();
        if (!api || state.loading || state.page >= state.totalPages) return;
        const setPage = kind === "pending" ? setPendingPage : setHistoryPage;
        setPage(current => ({...current, loading: true}));
        try {
            const result = await api.getTransfersPage(state.page + 1, PAGE_SIZE, kind);
            if (kind === "pending") setPendingTransfers(current => [...current, ...result.items]);
            else setTransferHistory(current => [...current, ...result.items]);
            setPage(loadedPage(result));
            await addTransactionDetails(api, result.items);
        } catch (reason) {
            setPage(current => ({...current, loading: false}));
            setError(reason instanceof Error ? reason.message : String(reason));
        }
    };

    createEffect(() => {
        finbaseUrl();
        finbaseToken();
        standalone();
        const tab = activeTab();
        void load(tab);
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
            const payload = rulePayload(draft, category);
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
            const updated = await api.updateRecord("transfers", transfer.id, {status});
            toast.success(status === "accepted" ? "Перевод подтверждён" : "Совпадение отклонено");
            setPendingTransfers(current => current.filter(item => item.id !== transfer.id));
            setPendingPage(current => ({...current, totalItems: Math.max(0, current.totalItems - 1)}));
            if (historyPage().initialized) {
                setTransferHistory(current => [updated, ...current.filter(item => item.id !== updated.id)]);
                setHistoryPage(current => ({...current, totalItems: current.totalItems + 1}));
            }
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
                        <button class="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm hover:bg-slate-50" disabled={loading()} onClick={() => void load(activeTab())}>
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

                <Show when={!loading()} fallback={
                    <div class="grid animate-pulse gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <For each={[0, 1, 2, 3]}>{() => <div class="h-28 rounded-2xl bg-slate-100"/>}</For>
                    </div>
                }>
                    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <For each={[
                            {label: "Активные правила", value: rulesInitialized() ? rules().filter((item) => item.active).length : "—", icon: WandSparkles, tone: "text-blue-600 bg-blue-50"},
                            {label: "Группы без категории", value: groupsPage().initialized ? groupsPage().totalItems : "—", icon: Layers3, tone: "text-violet-600 bg-violet-50"},
                            {label: "Ждут проверки", value: pendingPage().initialized ? pendingPage().totalItems : "—", icon: Scale, tone: "text-amber-600 bg-amber-50"},
                            {label: "Счетов в балансе", value: accounts().length, icon: CircleDollarSign, tone: "text-emerald-600 bg-emerald-50"},
                        ]}>{(item) => (
                            <div class="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
                                <div class={`mb-3 flex size-9 items-center justify-center rounded-xl ${item.tone}`}><item.icon size={18}/></div>
                                <div class="text-2xl font-semibold text-slate-900">{item.value}</div>
                                <div class="text-xs text-slate-500">{item.label}</div>
                            </div>
                        )}</For>
                    </div>
                </Show>

                <nav class="flex w-full gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-100/80 p-1" role="tablist" aria-label="Разделы автоматики">
                    <For each={[
                        {id: "transfers" as const, label: "Переводы", count: pendingPage().initialized ? pendingPage().totalItems : null, icon: Scale},
                        {id: "groups" as const, label: "Группы операций", count: groupsPage().initialized ? groupsPage().totalItems : null, icon: Layers3},
                        {id: "rules" as const, label: "Созданные правила", count: rulesInitialized() ? rules().length : null, icon: WandSparkles},
                    ]}>{(tab) => (
                        <button
                            type="button"
                            role="tab"
                            aria-selected={activeTab() === tab.id}
                            class={`flex min-w-fit flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                                activeTab() === tab.id
                                    ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80"
                                    : "text-slate-500 hover:bg-white/60 hover:text-slate-800"
                            }`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            <tab.icon size={16}/>
                            <span>{tab.label}</span>
                            <Show when={tab.count !== null}>
                                <span class={`rounded-full px-2 py-0.5 text-[11px] ${activeTab() === tab.id ? "bg-blue-50 text-blue-600" : "bg-slate-200/70 text-slate-500"}`}>{tab.count}</span>
                            </Show>
                        </button>
                    )}</For>
                </nav>

                <Show when={!loading()} fallback={<AutomationSkeleton/>}>
                    <Show when={activeTab() === "groups"}>
                    <section class="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                            <div>
                                <h2 class="font-semibold text-slate-900">Похожие операции без категории</h2>
                                <p class="mt-1 text-xs text-slate-500">Создайте правило для всей подходящей истории или откройте группу и разметьте только выбранные операции.</p>
                            </div>
                            <button type="button" class="flex items-center gap-2 rounded-xl bg-violet-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50" disabled={!groupsPage().totalItems} onClick={() => setInteractiveGroups(true)}>
                                <Sparkles size={16}/> Разметить интерактивно
                            </button>
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
                                        <div class="flex flex-wrap justify-end gap-2">
                                            <button class="secondary-button whitespace-nowrap" onClick={() => setGroupDialog(group)}><ListChecks size={15}/> Выбрать операции</button>
                                            <button class="whitespace-nowrap rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700" onClick={() => void createRuleFromGroup(group)}>Создать правило</button>
                                        </div>
                                    </div>
                                )}</For>
                            </div>
                            <LoadMoreSentinel
                                hasMore={groupsPage().page < groupsPage().totalPages}
                                loading={groupsPage().loading}
                                onLoad={() => void loadMoreGroups()}
                            />
                        </Show>
                    </section>
                    </Show>

                    <Show when={activeTab() === "transfers"}>
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
                            <LoadMoreSentinel
                                hasMore={pendingPage().page < pendingPage().totalPages}
                                loading={pendingPage().loading}
                                onLoad={() => void loadMoreTransfers("pending")}
                            />
                        </Show>
                    </section>
                    </Show>

                    <Show when={activeTab() === "rules"}>
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
                    </Show>

                    <Show when={activeTab() === "transfers"}>
                    <section class="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                        <div class="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                            <h2 class="font-semibold text-slate-900">История проверки переводов</h2>
                            <Show when={historyPage().initialized}><span class="text-xs text-slate-400">{historyPage().totalItems}</span></Show>
                        </div>
                        <Show when={transferHistory().length}>
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
                        </Show>
                        <Show when={historyPage().initialized && transferHistory().length === 0}>
                            <div class="p-8 text-center text-sm text-slate-400">История пока пуста.</div>
                        </Show>
                        <LoadMoreSentinel
                            hasMore={!historyPage().initialized || historyPage().page < historyPage().totalPages}
                            loading={historyPage().loading}
                            onLoad={() => void loadMoreTransfers("history")}
                        />
                    </section>
                    </Show>
                </Show>
            </div>

            <Show when={dialog()}>{(current) => <RuleDialog initial={current()} categories={categories()} saving={saving()} onSave={(draft) => void saveRule(draft)} onClose={() => setDialog(null)}/>}</Show>
            <Show when={groupDialog()}>{(current) => (
                <Show when={service()}>{(api) => (
                    <GroupOperationsDialog
                        group={current()}
                        service={api()}
                        categories={categories()}
                        initialCategory={groupCategories()[current().id] || ""}
                        accountLabel={(accountId) => accountName(accountById().get(accountId))}
                        onApplied={() => {
                            setGroupDialog(null);
                            void load("groups");
                        }}
                        onEmpty={() => {
                            setGroupDialog(null);
                            void load("groups");
                        }}
                        onClose={() => setGroupDialog(null)}
                    />
                )}</Show>
            )}</Show>
            <Show when={interactiveGroups()}>
                <Show when={service()}>{(api) => (
                    <InteractiveGroupsDialog
                        service={api()}
                        categories={categories()}
                        accountLabel={(accountId) => accountName(accountById().get(accountId))}
                        onClose={() => {
                            setInteractiveGroups(false);
                            void load("groups");
                        }}
                    />
                )}</Show>
            </Show>
        </Show>
    );
};
