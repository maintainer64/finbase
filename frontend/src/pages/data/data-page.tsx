import {Component, createEffect, createMemo, createSignal, For, onCleanup, Show, untrack} from "solid-js";
import {FaSolidDatabase, FaSolidPen, FaSolidPlus, FaSolidSpinner, FaSolidTrash, FaSolidXmark} from "solid-icons/fa";
import {toast} from "solid-toast";
import {useSetting} from "@/shared/settings";
import {FinbaseService} from "@/shared/providers/services/finbase/finbase-service";
import {PocketBaseRecord, WritableRecord} from "@/shared/finbase/models";
import {COLLECTIONS, CollectionSpec, FieldSpec} from "./finbase-schema";
import {MultiSelect} from "@/pages/statistics/multi-select";
import {CategoryIcon, CategoryIconPicker} from "@/components/ui/category-icon";
import {ArrowDown, ArrowUp, ArrowUpDown, Download, FileUp, Maximize2, RotateCcw, Search} from "lucide-solid";
import {openFinbaseTab, useFullAppWindow} from "@/shared/open-finbase";
import {buildDataFilter, EMPTY_RELATION_FILTER} from "./data-filter";
import {parseTransactionCsv, type TransactionCsvIssue, type TransactionCsvPreview} from "./transaction-csv";
import {downloadTransactionCsvExample, TransactionCsvDialog} from "./transaction-csv-dialog";

type UiRecord = PocketBaseRecord & Record<string, unknown>;

type RelOptions = Map<string, {id: string; label: string; color?: string; icon?: string}[]>;

interface FieldInputProps {
    field: FieldSpec;
    value: unknown;
    options: {id: string; label: string; color?: string; icon?: string}[];
    onChange: (value: unknown) => void;
}

const FieldInput: Component<FieldInputProps> = (props) => {
    const baseClass =
        "w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-800 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200";

    const render = () => {
        switch (props.field.kind) {
            case "textarea":
                return (
                    <textarea
                        class={baseClass}
                        rows={3}
                        value={String(props.value ?? "")}
                        onInput={(e) => props.onChange(e.currentTarget.value)}
                    />
                );
            case "number":
                return (
                    <input
                        type="number"
                        step="any"
                        class={baseClass}
                        disabled={props.field.readonly}
                        value={String(props.value ?? "")}
                        onInput={(e) => props.onChange(e.currentTarget.value)}
                    />
                );
            case "color":
                return (
                    <div class="flex items-center gap-2">
                        <input
                            type="color"
                            class="h-10 w-12 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
                            value={String(props.value || "#3b82f6")}
                            onInput={(e) => props.onChange(e.currentTarget.value)}
                        />
                        <input
                            type="text"
                            class={baseClass}
                            value={String(props.value ?? "")}
                            placeholder="#3b82f6"
                            onInput={(e) => props.onChange(e.currentTarget.value)}
                        />
                    </div>
                );
            case "icon":
                return (
                    <CategoryIconPicker
                        value={String(props.value ?? "")}
                        onChange={props.onChange}
                    />
                );
            case "date":
                return (
                    <input
                        type="date"
                        class={baseClass}
                        value={String(props.value ?? "")}
                        onInput={(e) => props.onChange(e.currentTarget.value)}
                    />
                );
            case "select":
                return (
                    <select
                        class={baseClass}
                        value={String(props.value ?? "")}
                        onInput={(e) => props.onChange(e.currentTarget.value)}
                    >
                        <option value="">—</option>
                        <For each={props.field.options ?? []}>
                            {(option) => <option value={option}>{option}</option>}
                        </For>
                    </select>
                );
            case "relation":
                return (
                    <select
                        class={baseClass}
                        value={String(props.value ?? "")}
                        onInput={(e) => props.onChange(e.currentTarget.value)}
                    >
                        <option value="">{props.field.required ? "— выберите —" : "—"}</option>
                        <For each={props.options}>
                            {(item) => <option value={item.id}>{item.label}</option>}
                        </For>
                    </select>
                );
            case "relation-many":
                return (
                    <MultiSelect
                        items={props.options}
                        selected={(props.value as string[]) ?? []}
                        onChange={(ids) => props.onChange(ids)}
                        placeholder="Выберите…"
                    />
                );
            default:
                return (
                    <input
                        type="text"
                        class={baseClass}
                        value={String(props.value ?? "")}
                        onInput={(e) => props.onChange(e.currentTarget.value)}
                    />
                );
        }
    };

    return (
        <label class="flex flex-col gap-1">
            <span class="text-xs text-gray-500">
                {props.field.label}
                <Show when={props.field.required}>
                    <span class="text-red-500"> *</span>
                </Show>
            </span>
            {render()}
        </label>
    );
};

interface FormModalProps {
    spec: CollectionSpec;
    record: UiRecord | null;
    relationOptions: RelOptions;
    saving: boolean;
    onSave: (payload: Record<string, unknown>) => void;
    onDelete: () => void;
    onClose: () => void;
}

const toDateInput = (value: unknown): string => String(value ?? "").split(/[T\s]/)[0] ?? "";

const RecordFormModal: Component<FormModalProps> = (props) => {
    const [values, setValues] = createSignal<Record<string, unknown>>(untrack(() => {
        const record = props.record;
        return record
            ? Object.fromEntries(props.spec.fields.map((field) => {
                const raw = record[field.name];
                if (field.kind === "date") return [field.name, toDateInput(raw)];
                if (field.kind === "relation-many") return [field.name, Array.isArray(raw) ? raw : []];
                return [field.name, raw ?? ""];
            }))
            : {};
    }));

    const setValue = (name: string, value: unknown) => {
        setValues((prev) => ({...prev, [name]: value}));
    };

    const submit = () => {
        const payload: Record<string, unknown> = {};
        for (const field of props.spec.fields) {
            const value = values()[field.name];
            const empty = value === "" || value === null || value === undefined || (Array.isArray(value) && value.length === 0);
            if (empty) {
                if (field.required) {
                    toast.error(`Поле «${field.label}» обязательно`);
                    return;
                }
                continue;
            }
            if (field.kind === "number") {
                const num = Number(value);
                payload[field.name] = Number.isNaN(num) ? 0 : num;
            } else if (field.kind === "date") {
                payload[field.name] = `${String(value)}T00:00:00.000Z`;
            } else if (field.kind === "relation-many") {
                payload[field.name] = value as string[];
            } else {
                payload[field.name] = value;
            }
        }
        props.onSave(payload);
    };

    return (
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" onClick={() => props.onClose()}>
            <div
                class="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-white/70 bg-white p-6 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-sm font-semibold">
                        {props.record ? `Изменить ${props.spec.label.toLowerCase()}` : `Новый ${props.spec.label.toLowerCase()}`}
                    </h3>
                    <button class="flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => props.onClose()}>
                        <FaSolidXmark/>
                    </button>
                </div>

                <div class="flex flex-col gap-3">
                    <For each={props.spec.fields}>
                        {(field) => (
                            <FieldInput
                                field={field}
                                value={values()[field.name]}
                                options={field.relation ? props.relationOptions.get(field.relation) ?? [] : []}
                                onChange={(v) => setValue(field.name, v)}
                            />
                        )}
                    </For>
                </div>

                <div class="flex items-center gap-2 mt-5">
                    <button
                            class="primary-button flex-1 disabled:opacity-50"
                        disabled={props.saving}
                        onClick={submit}
                    >
                        <Show when={props.saving}>
                            <FaSolidSpinner class="animate-spin"/>
                        </Show>
                        Сохранить
                    </button>
                    <Show when={props.record}>
                        <button
                            class="px-4 py-2 rounded-xl bg-red-50 text-red-600 text-sm hover:bg-red-100"
                            onClick={() => props.onDelete()}
                        >
                            Удалить
                        </button>
                    </Show>
                </div>
            </div>
        </div>
    );
};

interface CellValueProps {
    field: FieldSpec;
    record: UiRecord;
    relLabels: RelOptions;
}

const CellValue: Component<CellValueProps> = (props) => {
    const raw = () => props.record[props.field.name];

    const text = createMemo<string>(() => {
        const value = raw();
        if (value === null || value === undefined || value === "") return "";
        if (props.field.kind === "relation") {
            return props.relLabels.get(props.field.relation!)?.find((o) => o.id === String(value))?.label ?? "—";
        }
        if (props.field.kind === "relation-many") return String((value as unknown[]).length);
        if (props.field.kind === "date") return toDateInput(value);
        return String(value);
    });

    return (
        <div class="flex items-center gap-1.5">
            <Show when={props.field.name === "owner" && text()}>
                <span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold uppercase text-blue-700">
                    {text().slice(0, 1)}
                </span>
            </Show>
            <Show when={props.field.name === "color" && raw()}>
                <span class="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{background: String(raw())}}/>
            </Show>
            <Show when={props.field.kind === "icon" && raw()}>
                <span class="flex size-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    <CategoryIcon name={String(raw())}/>
                </span>
            </Show>
            <Show when={props.field.kind === "icon" && !raw()}>
                <span class="text-slate-300">—</span>
            </Show>
            <Show when={props.field.kind !== "icon"}>
            <span class={`truncate max-w-48 tabular-nums ${
                ["amount", "balance"].includes(props.field.name)
                    ? Number(raw() ?? 0) > 0 ? "font-semibold text-emerald-700" : Number(raw() ?? 0) < 0 ? "font-semibold text-rose-600" : "text-slate-400"
                    : ""
            }`}>{text() || "—"}</span>
            </Show>
        </div>
    );
};

const DATA_PAGE_SIZE = 50;
const TRANSACTION_RELATION_LIMIT = 100;

export const DataPage: Component = () => {
    const fullApp = useFullAppWindow();
    const [finbaseUrl] = useSetting("finbase-url");
    const [finbaseToken] = useSetting("finbase-token");
    const finbase = createMemo<FinbaseService | null>(
        () => (finbaseUrl() ? new FinbaseService(finbaseUrl(), finbaseToken()) : null),
    );

    const [collectionName, setCollectionName] = createSignal<string>("categories");
    const spec = createMemo<CollectionSpec>(
        () => COLLECTIONS.find((c) => c.collection === collectionName()) ?? COLLECTIONS[0],
    );

    const [records, setRecords] = createSignal<UiRecord[]>([]);
    const [relationOptions, setRelationOptions] = createSignal<RelOptions>(new Map());
    const [loading, setLoading] = createSignal(true);
    const [loadingMore, setLoadingMore] = createSignal(false);
    const [page, setPage] = createSignal(0);
    const [totalPages, setTotalPages] = createSignal(1);
    const [totalItems, setTotalItems] = createSignal(0);
    const [error, setError] = createSignal("");
    const [modal, setModal] = createSignal<{record: UiRecord | null} | null>(null);
    const [saving, setSaving] = createSignal(false);
    const [csvDialog, setCsvDialog] = createSignal<{filename: string; preview: TransactionCsvPreview} | null>(null);
    const [csvImporting, setCsvImporting] = createSignal(false);
    const [csvProgress, setCsvProgress] = createSignal({completed: 0, total: 0});
    const [csvImportIssues, setCsvImportIssues] = createSignal<TransactionCsvIssue[]>([]);
    const [search, setSearch] = createSignal("");
    const [debouncedSearch, setDebouncedSearch] = createSignal("");
    const [fieldFilters, setFieldFilters] = createSignal<Record<string, string>>({});
    const [fromDate, setFromDate] = createSignal("");
    const [toDate, setToDate] = createSignal("");
    const [amountKind, setAmountKind] = createSignal<"" | "income" | "expense">("");
    const [sort, setSort] = createSignal<{field: string; direction: "asc" | "desc"}>({field: "name", direction: "asc"});
    const [reloadVersion, setReloadVersion] = createSignal(0);
    const [tableContainer, setTableContainer] = createSignal<HTMLDivElement>();
    const [loadMoreSentinel, setLoadMoreSentinel] = createSignal<HTMLDivElement>();
    let listRequestId = 0;
    let optionsRequestId = 0;

    createEffect(() => {
        collectionName();
        setSearch("");
        setDebouncedSearch("");
        setFieldFilters({});
        setFromDate("");
        setToDate("");
        setAmountKind("");
        const current = spec();
        const date = current.fields.find((field) => field.kind === "date" && field.listable);
        setSort({field: date?.name ?? current.displayField, direction: date ? "desc" : "asc"});
    });

    createEffect(() => {
        const value = search();
        const timer = window.setTimeout(() => setDebouncedSearch(value.trim()), 250);
        onCleanup(() => window.clearTimeout(timer));
    });

    const loadRelationOptions = async (service: FinbaseService, coll: CollectionSpec) => {
        const requestId = ++optionsRequestId;
        const needsOptions = [...new Set(coll.fields
            .filter((f) => f.relation)
            .map((f) => f.relation!))];
        try {
            const optionGroups = await Promise.all(needsOptions.map((rel) => {
                if (rel === "users") {
                    return service.getUsers().then((items) => ({
                        rel,
                        items: items.map((record) => ({
                            id: record.id,
                            label: record.name || record.email || record.id,
                        })),
                    }));
                }
                const relSpec = COLLECTIONS.find((c) => c.collection === rel);
                if (!relSpec) return Promise.resolve({rel, items: []});
                const records = rel === "transactions"
                    ? service.listPage("transactions", 1, TRANSACTION_RELATION_LIMIT, {sort: "-date"}).then(result => result.items)
                    : service.listAll(relSpec.collection);
                return records.then((items) => ({
                    rel,
                    items: items.map((record) => {
                        const item = record as unknown as UiRecord;
                        return {
                            id: item.id,
                            label: String(item[relSpec.displayField] ?? item.id),
                            color: typeof item.color === "string" ? item.color : undefined,
                            icon: typeof (item.lucide_icon ?? item.icon) === "string"
                                ? String(item.lucide_icon ?? item.icon)
                                : undefined,
                        };
                    }),
                }));
            }));
            if (requestId !== optionsRequestId) return;
            const options = new Map<string, {id: string; label: string; color?: string; icon?: string}[]>();
            for (const group of optionGroups) options.set(group.rel, group.items);
            setRelationOptions(options);
        } catch (cause) {
            if (requestId === optionsRequestId) setError(cause instanceof Error ? cause.message : String(cause));
        }
    };

    const serverFilter = createMemo(() => buildDataFilter(
        spec(),
        debouncedSearch(),
        fieldFilters(),
        fromDate(),
        toDate(),
        amountKind(),
    ));
    const serverSort = createMemo(() => `${sort().direction === "desc" ? "-" : ""}${sort().field}`);
    const hasMore = createMemo(() => page() < totalPages());

    const loadPage = async (
        service: FinbaseService,
        coll: CollectionSpec,
        targetPage: number,
        reset: boolean,
        filter: string,
        sortValue: string,
    ) => {
        if (!reset && (loadingMore() || !hasMore())) return;
        const requestId = reset ? ++listRequestId : listRequestId;
        if (reset) {
            setLoading(true);
            setRecords([]);
            setPage(0);
            setTotalPages(1);
            setTotalItems(0);
            setError("");
        } else {
            setLoadingMore(true);
        }
        try {
            const result = await service.listPage(coll.collection, targetPage, DATA_PAGE_SIZE, {
                filter,
                sort: sortValue,
            });
            if (requestId !== listRequestId) return;
            setRecords(current => {
                const items = result.items.map(record => record as unknown as UiRecord);
                if (reset) return items;
                const byId = new Map(current.map(record => [record.id, record]));
                for (const item of items) byId.set(item.id, item);
                return [...byId.values()];
            });
            setPage(result.page);
            setTotalPages(result.totalPages || 1);
            setTotalItems(result.totalItems);
        } catch (cause) {
            if (requestId === listRequestId) setError(cause instanceof Error ? cause.message : String(cause));
        } finally {
            if (requestId === listRequestId) {
                setLoading(false);
                setLoadingMore(false);
            }
        }
    };

    createEffect(() => {
        const service = finbase();
        const coll = spec();
        reloadVersion();
        if (service && fullApp()) void loadRelationOptions(service, coll);
    });

    createEffect(() => {
        const service = finbase();
        const coll = spec();
        const filter = serverFilter();
        const sortValue = serverSort();
        reloadVersion();
        if (service && fullApp()) {
            void loadPage(service, coll, 1, true, filter, sortValue);
        } else if (!service && fullApp()) {
            setLoading(false);
            setError("Подключите Finbase в настройках, чтобы управлять данными");
        } else {
            setLoading(false);
            setError("");
        }
    });

    const reload = () => setReloadVersion(value => value + 1);

    const loadNextPage = () => {
        const service = finbase();
        if (!service || !fullApp() || !hasMore()) return;
        void loadPage(service, spec(), page() + 1, false, serverFilter(), serverSort());
    };

    createEffect(() => {
        const root = tableContainer();
        const sentinel = loadMoreSentinel();
        const canLoad = hasMore() && !loadingMore() && !loading();
        if (!root || !sentinel || !canLoad) return;
        const observer = new IntersectionObserver((entries) => {
            if (entries.some(entry => entry.isIntersecting)) loadNextPage();
        }, {root, rootMargin: "240px 0px"});
        observer.observe(sentinel);
        onCleanup(() => observer.disconnect());
    });

    const save = (payload: Record<string, unknown>) => {
        const service = finbase();
        const coll = spec();
        if (!service) return;
        const editing = modal()?.record;
        setSaving(true);
        const operation = editing
            ? service.updateRecord(coll.collection, editing.id, payload as Partial<WritableRecord>)
            : service.createRecord(coll.collection, payload as Partial<WritableRecord>);
        operation
            .then(() => {
                toast.success(editing ? "Запись обновлена" : "Запись создана");
                setModal(null);
                reload();
            })
            .catch((e) => toast.error(e instanceof Error ? e.message : String(e)))
            .finally(() => setSaving(false));
    };

    const remove = () => {
        const service = finbase();
        const coll = spec();
        const editing = modal()?.record;
        if (!service || !editing) return;
        if (!confirm(`Удалить ${coll.label.toLowerCase()} «${String(editing[coll.displayField] ?? editing.id)}»?`)) return;
        setSaving(true);
        service.deleteRecord(coll.collection, editing.id)
            .then(() => {
                toast.success("Запись удалена");
                setModal(null);
                reload();
            })
            .catch((e) => toast.error(e instanceof Error ? e.message : String(e)))
            .finally(() => setSaving(false));
    };

    const listableFields = createMemo(() => spec().fields.filter((f) => f.listable));
    const filterFields = createMemo(() => listableFields().filter((field) =>
        field.kind === "select" || field.kind === "relation" || field.kind === "relation-many",
    ));
    const dateField = createMemo(() => spec().fields.find((field) => field.kind === "date" && field.listable));
    const hasAmount = createMemo(() => spec().fields.some((field) => field.name === "amount"));

    const filterOptions = createMemo(() => {
        const result = new Map<string, {value: string; label: string}[]>();
        for (const field of spec().fields) {
            let options = field.relation
                ? (relationOptions().get(field.relation) ?? []).map((item) => ({value: item.id, label: item.label}))
                : (field.options ?? []).map((value) => ({value, label: value}));
            if (field.relation && !field.required) {
                const emptyLabel = field.name === "category"
                    ? "Без категории"
                    : field.name === "tags"
                        ? "Без тегов"
                        : field.kind === "relation-many" ? "Без значений" : "Без значения";
                options = [{value: EMPTY_RELATION_FILTER, label: emptyLabel}, ...options];
            }
            result.set(field.name, options);
        }
        return result;
    });

    const toggleSort = (field: string) => setSort((current) => ({
        field,
        direction: current.field === field && current.direction === "asc" ? "desc" : "asc",
    }));

    const hasActiveFilters = createMemo(() => Boolean(
        search() || fromDate() || toDate() || amountKind() || Object.values(fieldFilters()).some(Boolean),
    ));

    const resetFilters = () => {
        setSearch("");
        setDebouncedSearch("");
        setFieldFilters({});
        setFromDate("");
        setToDate("");
        setAmountKind("");
    };

    const selectCsvFile = async (event: Event) => {
        const input = event.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        input.value = "";
        if (!file) return;
        const options = relationOptions();
        if (!options.has("accounts") || !options.has("categories") || !options.has("tags")) {
            toast.error("Справочники ещё загружаются — попробуйте через пару секунд");
            return;
        }
        try {
            const named = (relation: string) => (options.get(relation) ?? []).map(item => ({id: item.id, name: item.label}));
            const preview = parseTransactionCsv(await file.text(), {
                accounts: named("accounts"),
                categories: named("categories").filter(item => item.name !== "Переводы"),
                tags: named("tags"),
            });
            if (preview.totalRows === 0) {
                toast.error("CSV не содержит операций");
                return;
            }
            setCsvImportIssues([]);
            setCsvProgress({completed: 0, total: preview.rows.length});
            setCsvDialog({filename: file.name, preview});
        } catch (cause) {
            toast.error(`Не удалось разобрать CSV: ${cause instanceof Error ? cause.message : String(cause)}`);
        }
    };

    const importCsv = async () => {
        const api = finbase();
        const current = csvDialog();
        if (!api || !current || current.preview.rows.length === 0) return;
        setCsvImporting(true);
        setCsvImportIssues([]);
        setCsvProgress({completed: 0, total: current.preview.rows.length});
        const rows = current.preview.rows;
        try {
            const result = await api.importTransactions(
                rows.map(row => row.transaction),
                4,
                (completed, total) => setCsvProgress({completed, total}),
            );
            const failures = result.failures.map(failure => ({
                line: rows[failure.index]?.line ?? failure.index + 2,
                message: failure.message,
            }));
            setCsvImportIssues(failures);
            if (result.created > 0) reload();
            const parts = [`создано ${result.created}`];
            if (result.skipped) parts.push(`уже существовало ${result.skipped}`);
            if (current.preview.issues.length) parts.push(`некорректных строк ${current.preview.issues.length}`);
            if (failures.length) parts.push(`ошибок записи ${failures.length}`);
            if (failures.length) toast.error(`Импорт завершён: ${parts.join(", ")}`);
            else {
                toast.success(`Импорт завершён: ${parts.join(", ")}`);
                setCsvDialog(null);
            }
        } catch (cause) {
            toast.error(`Не удалось импортировать CSV: ${cause instanceof Error ? cause.message : String(cause)}`);
        } finally {
            setCsvImporting(false);
        }
    };

    return (
        <Show when={fullApp()} fallback={
            <div class="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                <Maximize2 size={30} class="text-blue-500"/>
                <h1 class="text-lg font-semibold">Данные доступны на большом экране</h1>
                <p class="max-w-80 text-sm text-slate-500">Откройте Finbase в отдельной вкладке, чтобы искать и редактировать записи.</p>
                <button class="primary-button" onClick={() => openFinbaseTab("data")}>Открыть данные</button>
            </div>
        }>
        <div class="page-shell">
            <div class="flex items-start justify-between gap-4 flex-wrap">
                <button
                    class="primary-button"
                    onClick={() => setModal({record: null})}
                >
                    <FaSolidPlus/> Добавить
                </button>
                <Show when={collectionName() === "transactions"}>
                    <div class="flex flex-wrap gap-2">
                        <button type="button" class="secondary-button" onClick={downloadTransactionCsvExample}><Download size={15}/> Пример CSV</button>
                        <label class="secondary-button cursor-pointer">
                            <FileUp size={15}/> Импорт CSV
                            <input class="hidden" type="file" accept=".csv,text/csv" onChange={(event) => void selectCsvFile(event)}/>
                        </label>
                    </div>
                </Show>
            </div>

            <div class="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <div class="flex flex-wrap items-center gap-2">
                    <label class="relative min-w-56 flex-1">
                        <Search size={16} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                        <input
                            type="search"
                            class="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                            placeholder={`Искать в «${spec().plural.toLowerCase()}»…`}
                            value={search()}
                            onInput={(event) => setSearch(event.currentTarget.value)}
                        />
                    </label>
                    <For each={filterFields()}>
                        {(field) => (
                            <select
                                class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 outline-none focus:border-blue-400"
                                value={fieldFilters()[field.name] ?? ""}
                                onInput={(event) => setFieldFilters((current) => ({...current, [field.name]: event.currentTarget.value}))}
                            >
                                <option value="">Все: {field.label.toLowerCase()}</option>
                                <For each={filterOptions().get(field.name) ?? []}>
                                    {(option) => <option value={option.value}>{option.label}</option>}
                                </For>
                            </select>
                        )}
                    </For>
                    <Show when={dateField()}>
                        <input aria-label="Дата от" title="Дата от" type="date" class="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={fromDate()} onInput={(event) => setFromDate(event.currentTarget.value)}/>
                        <input aria-label="Дата до" title="Дата до" type="date" class="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={toDate()} onInput={(event) => setToDate(event.currentTarget.value)}/>
                    </Show>
                    <Show when={hasAmount()}>
                        <select class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600" value={amountKind()} onInput={(event) => setAmountKind(event.currentTarget.value as "" | "income" | "expense")}>
                            <option value="">Все движения</option>
                            <option value="income">Только доходы</option>
                            <option value="expense">Только расходы</option>
                        </select>
                    </Show>
                    <Show when={hasActiveFilters()}>
                        <button class="secondary-button" type="button" onClick={resetFilters}><RotateCcw size={15}/> Сбросить</button>
                    </Show>
                </div>
            </div>

            {/* Выбор коллекции */}
            <div class="segmented-control">
                <For each={COLLECTIONS}>
                    {(coll) => (
                        <button
                            class={`segmented-control__item ${
                                collectionName() === coll.collection
                                    ? "segmented-control__item--active"
                                    : ""
                            }`}
                            onClick={() => setCollectionName(coll.collection)}
                        >
                            {coll.plural}
                        </button>
                    )}
                </For>
            </div>

            <Show when={error()}>
                <div class="status-message status-message--error">{error()}</div>
            </Show>

            <Show when={loading()}>
                <div class="flex justify-center py-8 text-blue-500 text-2xl">
                    <FaSolidSpinner class="animate-spin"/>
                </div>
            </Show>

            <Show when={!loading() && records().length === 0 && !hasActiveFilters()}>
                <div class="empty-state">
                    <div class="empty-state__icon"><FaSolidDatabase/></div>
                    <div class="font-semibold text-slate-700">В коллекции пока пусто</div>
                    <div class="text-sm text-slate-400">Добавьте первую запись, чтобы она появилась здесь.</div>
                </div>
            </Show>

            <Show when={!loading() && records().length === 0 && hasActiveFilters()}>
                <div class="empty-state">
                    <Search size={26} class="text-slate-300"/>
                    <div class="font-semibold text-slate-700">Ничего не найдено</div>
                    <button class="text-sm text-blue-600 hover:underline" onClick={resetFilters}>Сбросить фильтры</button>
                </div>
            </Show>

            <Show when={!loading() && records().length > 0}>
                <div class="flex items-center justify-between text-xs text-slate-400">
                    <span class="rounded-full bg-slate-100 px-2.5 py-1">Загружено: {records().length} из {totalItems()}</span>
                </div>
                <div
                    ref={setTableContainer}
                    class="data-table-wrap screener-table-wrap"
                    onScroll={(event) => {
                        const target = event.currentTarget;
                        if (target.scrollHeight - target.scrollTop - target.clientHeight < 280) loadNextPage();
                    }}
                >
                    <table class="screener-table w-full text-xs">
                        <thead class="sticky top-0 z-20">
                        <tr class="bg-slate-50/80 text-slate-400 uppercase tracking-wide">
                            <For each={listableFields()}>
                                {(field, index) => (
                                    <th class={`whitespace-nowrap p-0 text-left font-medium ${index() === 0 ? "sticky left-0 z-30 bg-slate-50" : ""}`}>
                                        <button class="flex w-full items-center gap-1 px-2 py-2.5 first:pl-3 hover:text-blue-600" onClick={() => toggleSort(field.name)}>
                                            {field.label}
                                            <Show when={sort().field === field.name} fallback={<ArrowUpDown size={12} class="opacity-35"/>}>
                                                {sort().direction === "asc" ? <ArrowUp size={12}/> : <ArrowDown size={12}/>} 
                                            </Show>
                                        </button>
                                    </th>
                                )}
                            </For>
                            <th class="sticky right-0 z-30 bg-slate-50 py-2.5 pl-2 pr-3 text-right font-medium">Действия</th>
                        </tr>
                        </thead>
                        <tbody>
                        <For each={records()}>
                            {(record) => (
                                <tr class="group border-b border-slate-100 transition-colors hover:bg-blue-50/40">
                                    <For each={listableFields()}>
                                        {(field, index) => (
                                            <td class={`px-2 py-2 first:pl-3 ${index() === 0 ? "sticky left-0 z-10 bg-white font-medium group-hover:bg-blue-50" : ""}`}>
                                                <CellValue field={field} record={record} relLabels={relationOptions()}/>
                                            </td>
                                        )}
                                    </For>
                                    <td class="sticky right-0 z-10 bg-white py-2 pl-2 pr-3 text-right group-hover:bg-blue-50">
                                        <button
                                            class="text-gray-400 hover:text-blue-500 mr-2"
                                            aria-label="Редактировать"
                                            onClick={() => setModal({record})}
                                        >
                                            <FaSolidPen/>
                                        </button>
                                        <button
                                            class="text-gray-400 hover:text-red-500"
                                            aria-label="Удалить"
                                            onClick={() => {
                                                if (confirm(`Удалить ${spec().label.toLowerCase()} «${String(record[spec().displayField] ?? record.id)}»?`)) {
                                                    const service = finbase();
                                                    const collection = spec();
                                                    service?.deleteRecord(collection.collection, record.id)
                                                        .then(() => reload())
                                                        .catch((e) => toast.error(e instanceof Error ? e.message : String(e)));
                                                }
                                            }}
                                        >
                                            <FaSolidTrash/>
                                        </button>
                                    </td>
                                </tr>
                            )}
                        </For>
                        </tbody>
                    </table>
                    <Show when={loadingMore() || hasMore()}>
                        <div ref={setLoadMoreSentinel} class="flex min-h-12 items-center justify-center border-t border-slate-100 bg-white px-4 py-3">
                            <Show when={loadingMore()} fallback={
                                <button type="button" class="text-xs text-blue-600 hover:text-blue-700" onClick={loadNextPage}>
                                    Загрузить ещё
                                </button>
                            }>
                                <span class="flex items-center gap-2 text-xs text-slate-400"><FaSolidSpinner class="animate-spin text-blue-500"/> Загружаем следующую страницу…</span>
                            </Show>
                        </div>
                    </Show>
                </div>
            </Show>

            <Show when={modal()}>
                <RecordFormModal
                    spec={spec()}
                    record={modal()?.record ?? null}
                    relationOptions={relationOptions()}
                    saving={saving()}
                    onSave={save}
                    onDelete={remove}
                    onClose={() => setModal(null)}
                />
            </Show>
            <Show when={csvDialog()}>{(current) => (
                <TransactionCsvDialog
                    filename={current().filename}
                    preview={current().preview}
                    importing={csvImporting()}
                    progress={csvProgress()}
                    importIssues={csvImportIssues()}
                    onImport={() => void importCsv()}
                    onClose={() => { if (!csvImporting()) setCsvDialog(null); }}
                />
            )}</Show>
        </div>
        </Show>
    );
};
