import {batch, Component, createEffect, createMemo, createSignal, For, onMount, Show} from "solid-js";
import {useSetting} from "@/shared/settings";
import {currentRoute, routeParams} from "@/shared/routing";
import {
    FaSolidArrowLeft,
    FaSolidArrowTrendDown,
    FaSolidArrowTrendUp,
    FaSolidFilter,
    FaSolidScaleBalanced,
    FaSolidWallet,
} from "solid-icons/fa";
import {LoaderCircle} from "lucide-solid";
import {FinbaseService} from "@/shared/providers/services/finbase/finbase-service";
import {
    AccountRecord,
    CategoryRecord,
    DailyFlowRecord,
    FlowSplitRecord,
    TagRecord,
    TransactionRecord,
    UserRecord,
} from "@/shared/finbase/models";
import {Space} from "@/components/ui/card";
import {MultiSelect} from "./multi-select";
import {Sankey} from "./sankey";
import {CategoryIcon} from "@/components/ui/category-icon";
import {openFinbaseTab, useFullAppWindow} from "@/shared/open-finbase";
import {
    AccountDynamicsTable,
    DynamicsAccountRow,
    DynamicsBucket,
    DynamicsCell,
    DynamicsSelection,
    dynamicsPeriodLabel,
} from "./account-dynamics-table";
import {DynamicsDetailDialog} from "./dynamics-detail-dialog";
import {BalanceChart, BalanceSeries} from "./balance-chart";
import {CategoryDonut} from "./category-donut";
import {STATISTICS_PERIODS as PERIODS, statisticsRangeFromParams} from "./statistics-period";

// ==================== Утилиты ====================

const DAY_MS = 86_400_000;

const dayKey = (d: Date): string => d.toISOString().slice(0, 10);
const calendarDayBoundary = (day: string): string => new Date(`${day}T00:00:00`).toISOString();

const isoWeekKey = (day: string): string => {
    const d = new Date(`${day}T00:00:00Z`);
    const dayNum = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - dayNum + 3);
    const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    const diffInDays = (d.getTime() - firstThursday.getTime()) / DAY_MS;
    const week = 1 + Math.round(diffInDays / 7);
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
};

const addDays = (day: string, amount: number): string => {
    const date = new Date(`${day}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + amount);
    return dayKey(date);
};

const dynamicsPeriodRange = (period: string, bucket: DynamicsBucket): {from: string; toExclusive: string} => {
    if (bucket === "year") {
        const year = Number(period);
        return {from: `${year}-01-01`, toExclusive: `${year + 1}-01-01`};
    }
    if (bucket === "month") {
        const [year, month] = period.split("-").map(Number);
        return {
            from: `${year}-${String(month).padStart(2, "0")}-01`,
            toExclusive: dayKey(new Date(Date.UTC(year, month, 1))),
        };
    }
    const [yearValue, weekValue] = period.split("-W").map(Number);
    const januaryFourth = new Date(Date.UTC(yearValue, 0, 4));
    const januaryFourthDay = (januaryFourth.getUTCDay() + 6) % 7;
    januaryFourth.setUTCDate(januaryFourth.getUTCDate() - januaryFourthDay + (weekValue - 1) * 7);
    const from = dayKey(januaryFourth);
    return {from, toExclusive: addDays(from, 7)};
};

const fmt = new Intl.NumberFormat("ru-RU", {maximumFractionDigits: 0});
const accountDateFmt = new Intl.DateTimeFormat("ru-RU", {day: "2-digit", month: "2-digit", year: "2-digit"});
const formatAccountDate = (value: string): string => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : accountDateFmt.format(date);
};

const fmtMoney = (value: number): string => `${fmt.format(value)} ₽`;

const DETAIL_LEVELS: {key: DynamicsBucket; label: string}[] = [
    {key: "year", label: "По годам"},
    {key: "month", label: "По месяцам"},
    {key: "week", label: "По неделям"},
];

const GROUPS: {key: string; label: string}[] = [
    {key: "checking", label: "Расчётные"},
    {key: "savings", label: "Сберегательные"},
    {key: "cash", label: "Наличные"},
    {key: "credit", label: "Кредитные"},
];

const PALETTE = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16"];

const WITHOUT_CATEGORY = "__without_category__";
const WITHOUT_TAGS = "__without_tags__";
const WITHOUT_OWNER = "__without_owner__";
const WITHOUT_PROVIDER = "__without_provider__";
const UNCATEGORIZED_CATEGORY: CategoryRecord = {
    id: WITHOUT_CATEGORY,
    name: "Без категории",
    color: "#94a3b8",
    parent_category: "",
    lucide_icon: "circle-help",
};

const PROVIDER_LABELS: Record<string, string> = {
    tbank: "Т-Банк",
    sber: "Сбер",
    yandex: "Яндекс-Банк",
};

const providerLabel = (provider: string): string => PROVIDER_LABELS[provider]
    ? `${PROVIDER_LABELS[provider]} · ${provider}`
    : provider;

interface QueryState {
    accounts: string[];
    groups: string[];
    categories: string[];
    tags: string[];
    owners: string[];
    providers: string[];
    period: string;
    from: string;
    to: string;
}

// ==================== Страница ====================

export const StatisticsPage: Component = () => {
    const [finbaseUrl] = useSetting("finbase-url");
    const [finbaseToken] = useSetting("finbase-token");
    const finbase = createMemo<FinbaseService | null>(
        () => (finbaseUrl() ? new FinbaseService(finbaseUrl(), finbaseToken()) : null),
    );

    // Статистика работает только в полноэкранной вкладке (не в popup-окне).
    const standalone = useFullAppWindow();

    // --- реакция на query-параметры ---
    const query = createMemo<QueryState>(() => {
        const p = routeParams();
        const range = statisticsRangeFromParams(p);
        return {
            accounts: (p.get("accounts") ?? "").split(",").filter(Boolean),
            groups: (p.get("groups") ?? "").split(",").filter(Boolean),
            categories: (p.get("categories") ?? "").split(",").filter(Boolean),
            tags: (p.get("tags") ?? "").split(",").filter(Boolean),
            owners: (p.get("owners") ?? "").split(",").filter(Boolean),
            providers: (p.get("providers") ?? "").split(",").filter(Boolean),
            ...range,
        };
    });

    const updateQuery = (patch: Partial<QueryState>) => {
        const params = new URLSearchParams(routeParams().toString());
        const set = (key: string, value: string[] | string) => {
            if (Array.isArray(value) && value.length === 0) params.delete(key);
            else if (Array.isArray(value)) params.set(key, value.join(","));
            else if (value === "") params.delete(key);
            else params.set(key, value);
        };
        if (patch.accounts !== undefined) set("accounts", patch.accounts);
        if (patch.groups !== undefined) set("groups", patch.groups);
        if (patch.categories !== undefined) set("categories", patch.categories);
        if (patch.tags !== undefined) set("tags", patch.tags);
        if (patch.owners !== undefined) set("owners", patch.owners);
        if (patch.providers !== undefined) set("providers", patch.providers);
        if (patch.period !== undefined) set("period", patch.period);
        if (patch.from !== undefined) set("from", patch.from);
        if (patch.to !== undefined) set("to", patch.to);
        window.location.hash = `/${currentRoute()}${params.toString() ? `?${params}` : ""}`;
    };

    // активный пресет периода, совпадающий с выбранным диапазоном (или null при ручном выборе)
    const activePreset = createMemo(() => {
        const q = query();
        if (q.period) return q.period;
        const key = PERIODS.find(p => {
            const {from, to} = p.range();
            return from === q.from && to === q.to;
        })?.key ?? null;
        return key;
    });

    // --- данные ---
    const [accounts, setAccounts] = createSignal<AccountRecord[]>([]);
    const [users, setUsers] = createSignal<UserRecord[]>([]);
    const [categories, setCategories] = createSignal<CategoryRecord[]>([]);
    const [tags, setTags] = createSignal<TagRecord[]>([]);
    const [flows, setFlows] = createSignal<DailyFlowRecord[]>([]);
    const [splits, setSplits] = createSignal<FlowSplitRecord[]>([]);
    const [bucket, setBucket] = createSignal<DynamicsBucket>("month");
    const [loading, setLoading] = createSignal(true);
    const [accountsLoading, setAccountsLoading] = createSignal(true);
    const [error, setError] = createSignal("");
    const [detailSelection, setDetailSelection] = createSignal<DynamicsSelection | null>(null);
    const [detailBucket, setDetailBucket] = createSignal<DynamicsBucket>("month");
    const [detailTransactions, setDetailTransactions] = createSignal<TransactionRecord[]>([]);
    const [detailLoading, setDetailLoading] = createSignal(false);
    const [detailError, setDetailError] = createSignal("");
    let detailRequestId = 0;

    // Счета, прошедшие фильтры типа, владельца и банка.
    const accountsByGroup = createMemo(() => {
        const q = query();
        const selectedOwners = q.owners.filter((id) => id !== WITHOUT_OWNER);
        const includeWithoutOwner = q.owners.includes(WITHOUT_OWNER);
        const selectedProviders = q.providers.filter((id) => id !== WITHOUT_PROVIDER);
        const includeWithoutProvider = q.providers.includes(WITHOUT_PROVIDER);
        return accounts().filter(a =>
            (q.groups.length === 0 || q.groups.includes(a.type))
            && (q.owners.length === 0 || selectedOwners.includes(a.owner) || (includeWithoutOwner && !a.owner))
            && (q.providers.length === 0
                || selectedProviders.includes(a.provider_code)
                || (includeWithoutProvider && !a.provider_code)),
        );
    });

    const providerOptions = createMemo(() => [...new Set(accounts()
        .map(account => account.provider_code)
        .filter(Boolean))]
        .sort((a, b) => providerLabel(a).localeCompare(providerLabel(b), "ru"))
        .map(provider => ({id: provider, label: providerLabel(provider)})));

    const userById = createMemo(() => new Map(users().map((user) => [user.id, user])));
    const userName = (id: string): string => {
        const user = userById().get(id);
        return user?.name || user?.email || "Без пользователя";
    };
    const accountLabel = (account: AccountRecord): string => {
        const parts = [account.name];
        if (account.owner) parts.push(userName(account.owner));
        if (account.disabled_at) parts.push(`отключён ${formatAccountDate(account.disabled_at)}`);
        return parts.join(" · ");
    };

    // выбранные счета, которые ещё существуют/проходят фильтр групп
    const effectiveAccounts = createMemo(() => {
        const q = query();
        const visible = accountsByGroup();
        const wanted = q.accounts.length ? q.accounts : visible.map(a => a.id);
        return wanted.filter(id => visible.some(a => a.id === id));
    });

    const categoryMap = createMemo(() => new Map(categories().map(c => [c.id, c])));

    const fromDay = createMemo(() => query().from);
    const toDay = createMemo(() => query().to);

    // предки каждой категории (от родителя и выше) — для учёта подкатегорий в фильтрах
    const categoryAncestors = createMemo(() => {
        const parents = new Map(categories().map(c => [c.id, c.parent_category || ""]));
        const ancestors = new Map<string, string[]>();
        for (const cat of categories()) {
            const list: string[] = [];
            let cur = cat.parent_category || "";
            while (cur) {
                list.push(cur);
                cur = parents.get(cur) ?? "";
            }
            ancestors.set(cat.id, list);
        }
        return ancestors;
    });

    // привязка фильтров категорий (с учётом подкатегорий) и тегов к splits
    const filteredSplits = createMemo(() => {
        const q = query();
        const from = fromDay();
        const to = toDay();
        const ancestors = categoryAncestors();
        const accountSet = new Set(effectiveAccounts());
        const selectedCategories = q.categories.filter(id => id !== WITHOUT_CATEGORY);
        const selectedTags = new Set(q.tags.filter(id => id !== WITHOUT_TAGS));
        const includeWithoutCategory = q.categories.includes(WITHOUT_CATEGORY);
        const includeWithoutTags = q.tags.includes(WITHOUT_TAGS);
        return splits().filter(s => {
            if (!accountSet.has(s.account)) return false;
            if (from && s.day < from) return false;
            if (to && s.day > to) return false;
            if (q.categories.length) {
                const categoryMatches = Boolean(s.category && (
                    selectedCategories.includes(s.category)
                    || ancestors.get(s.category)?.some(parent => selectedCategories.includes(parent))
                ));
                if (!categoryMatches && !(includeWithoutCategory && !s.category)) return false;
            }
            if (q.tags.length) {
                const tagsMatch = s.tags.some(tag => selectedTags.has(tag));
                if (!tagsMatch && !(includeWithoutTags && s.tags.length === 0)) return false;
            }
            return true;
        });
    });

    // ==================== загрузка ====================
    onMount(() => {
        const service = finbase();
        if (!service || !standalone()) {
            if (!service) setError("Настройте Finbase на странице «Настройки»");
            setLoading(false);
            return;
        }
        service.getAccountsList()
            .then((list) => setAccounts(list
                .filter(a => !a.excluded_report_at)
                .sort((a, b) => a.name.localeCompare(b.name, "ru"))))
            .catch((e) => setError(e instanceof Error ? e.message : String(e)))
            .finally(() => setAccountsLoading(false));
        service.getCategories().then(setCategories).catch(() => setCategories([]));
        service.getTags().then(setTags).catch(() => setTags([]));
        service.getUsers().then(setUsers).catch(() => setUsers([]));
    });

    createEffect(() => {
        const service = finbase();
        const ids = effectiveAccounts();
        if (!service || !standalone()) return;
        if (accountsLoading()) return;
        if (ids.length === 0) {
            setFlows([]);
            setSplits([]);
            setLoading(false);
            return;
        }
        const from = fromDay();
        const to = toDay();
        let cancelled = false;
        setError("");
        setFlows([]);
        setSplits([]);
        setLoading(true);

        void Promise.all([
            service.getDailyFlows(ids, from, to),
            service.getFlowSplits(ids, from, to),
        ])
            .then(([flowRecords, splitRecords]) => {
                if (cancelled) return;
                batch(() => {
                    setFlows(flowRecords);
                    setSplits(splitRecords);
                });
            })
            .catch((reason) => {
                if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    });

    // ==================== вычисления для графиков ====================

    const seriesByAccount = createMemo(() => {
        const ids = effectiveAccounts();
        const activeBucket = bucket();
        const byAccount = new Map<string, {label: string; value: number}[]>();
        for (const id of ids) {
            const source = flows()
                .filter(f => f.account === id)
                .sort((a, b) => a.day.localeCompare(b.day));
            const lastByPeriod = new Map<string, DailyFlowRecord>();
            for (const flow of source) {
                const period = activeBucket === "year"
                    ? flow.day.slice(0, 4)
                    : activeBucket === "month" ? flow.day.slice(0, 7) : isoWeekKey(flow.day);
                lastByPeriod.set(period, flow);
            }
            const points = [...lastByPeriod.values()].map(f => ({label: f.day, value: f.start_balance + f.running}));
            if (points.length) byAccount.set(id, points);
        }
        return byAccount;
    });

    const totalBalance = createMemo(() => {
        let total = 0;
        for (const [id, points] of seriesByAccount()) {
            const last = points[points.length - 1];
            if (last) total += last.value;
            else {
                const account = accounts().find(a => a.id === id);
                total += account?.balance ?? 0;
            }
        }
        for (const id of effectiveAccounts()) {
            if (!seriesByAccount().has(id)) {
                total += accounts().find(a => a.id === id)?.balance ?? 0;
            }
        }
        return total;
    });

    const overallPoints = createMemo(() => {
        const bySeries = [...seriesByAccount().entries()];
        if (bySeries.length === 0) return [] as {label: string; value: number}[];
        const days = [...new Set(bySeries.flatMap(([, series]) => series.map(p => p.label)))].sort();
        const last = new Map(effectiveAccounts().map(id => [id, accounts().find(a => a.id === id)?.balance ?? 0]));
        return days.map(day => {
            for (const [id, series] of bySeries) {
                const point = series.find(p => p.label === day);
                if (point) last.set(id, point.value);
            }
            return {label: day, value: [...last.values()].reduce((sum, value) => sum + value, 0)};
        });
    });

    const periodIncome = createMemo(() => filteredSplits().reduce(
        (sum, split) => sum + (split.delta > 0 ? split.delta : 0), 0,
    ));
    const periodExpense = createMemo(() => filteredSplits().reduce(
        (sum, split) => sum + (split.delta < 0 ? -split.delta : 0), 0,
    ));
    const periodResult = createMemo(() => periodIncome() - periodExpense());

    const dynamicsPeriods = createMemo(() => {
        const bucketKey = (day: string): string =>
            bucket() === "year" ? day.slice(0, 4) : bucket() === "week" ? isoWeekKey(day) : day.slice(0, 7);
        return [...new Set(filteredSplits().map(split => bucketKey(split.day)))].sort();
    });

    const dynamicsRows = createMemo<DynamicsAccountRow[]>(() => {
        const bucketKey = (day: string): string =>
            bucket() === "year" ? day.slice(0, 4) : bucket() === "week" ? isoWeekKey(day) : day.slice(0, 7);
        const cellsByAccount = new Map<string, Map<string, DynamicsCell>>();

        for (const split of filteredSplits()) {
            const cells = cellsByAccount.get(split.account) ?? new Map<string, DynamicsCell>();
            const period = bucketKey(split.day);
            const cell = cells.get(period) ?? {income: 0, expense: 0, net: 0};
            if (split.delta >= 0) cell.income += split.delta;
            else cell.expense += -split.delta;
            cell.net += split.delta;
            cells.set(period, cell);
            cellsByAccount.set(split.account, cells);
        }

        return effectiveAccounts()
            .map((id, index) => {
                const account = accounts().find(item => item.id === id);
                const cells = cellsByAccount.get(id) ?? new Map<string, DynamicsCell>();
                const total = [...cells.values()].reduce(
                    (sum, cell) => ({
                        income: sum.income + cell.income,
                        expense: sum.expense + cell.expense,
                        net: sum.net + cell.net,
                    }),
                    {income: 0, expense: 0, net: 0},
                );
                return {
                    id,
                    name: account ? accountLabel(account) : id,
                    color: PALETTE[index % PALETTE.length],
                    currency: account?.currency || "RUB",
                    cells,
                    total,
                };
            })
            .filter(row => row.cells.size > 0);
    });

    const closeDynamicsDetails = () => {
        detailRequestId++;
        setDetailSelection(null);
    };

    const openDynamicsDetails = async (selection: DynamicsSelection) => {
        const service = finbase();
        if (!service) return;

        const requestId = ++detailRequestId;
        const activeBucket = bucket();
        const activeQuery = query();
        const accountIds = selection.accountId ? [selection.accountId] : effectiveAccounts();
        setDetailSelection(selection);
        setDetailBucket(activeBucket);
        setDetailTransactions([]);
        setDetailError("");
        setDetailLoading(true);

        let from = activeQuery.from;
        let toExclusive = activeQuery.to ? addDays(activeQuery.to, 1) : "";
        if (selection.period) {
            const periodRange = dynamicsPeriodRange(selection.period, activeBucket);
            if (!from || periodRange.from > from) from = periodRange.from;
            if (!toExclusive || periodRange.toExclusive < toExclusive) toExclusive = periodRange.toExclusive;
        }

        const filters: string[] = [];
        if (accountIds.length) {
            const accountsFilter = accountIds.map(id => `account = ${JSON.stringify(id)}`).join(" || ");
            filters.push(accountIds.length > 1 ? `(${accountsFilter})` : accountsFilter);
        }
        if (from) filters.push(`date >= ${JSON.stringify(calendarDayBoundary(from))}`);
        if (toExclusive) filters.push(`date < ${JSON.stringify(calendarDayBoundary(toExclusive))}`);

        try {
            const records = await service.getTransactions(filters.join(" && "));
            if (requestId !== detailRequestId) return;

            const ancestors = categoryAncestors();
            const selectedCategories = activeQuery.categories.filter(id => id !== WITHOUT_CATEGORY);
            const selectedTags = new Set(activeQuery.tags.filter(id => id !== WITHOUT_TAGS));
            const includeWithoutCategory = activeQuery.categories.includes(WITHOUT_CATEGORY);
            const includeWithoutTags = activeQuery.tags.includes(WITHOUT_TAGS);
            setDetailTransactions(records.filter(transaction => {
                if (activeQuery.categories.length) {
                    const categoryMatches = Boolean(transaction.category && (
                        selectedCategories.includes(transaction.category)
                        || ancestors.get(transaction.category)?.some(parent => selectedCategories.includes(parent))
                    ));
                    if (!categoryMatches && !(includeWithoutCategory && !transaction.category)) return false;
                }
                if (activeQuery.tags.length) {
                    const tagsMatch = transaction.tags.some(tag => selectedTags.has(tag));
                    if (!tagsMatch && !(includeWithoutTags && transaction.tags.length === 0)) return false;
                }
                return true;
            }));
        } catch (cause) {
            if (requestId === detailRequestId) {
                setDetailError(cause instanceof Error ? cause.message : String(cause));
            }
        } finally {
            if (requestId === detailRequestId) setDetailLoading(false);
        }
    };

    const detailTitle = createMemo(() => {
        const selection = detailSelection();
        if (!selection) return "Детализация";
        const accountName = selection.accountId
            ? accounts().find(account => account.id === selection.accountId)?.name ?? selection.accountId
            : "Все счета";
        return `Операции · ${accountName}`;
    });

    const detailSubtitle = createMemo(() => {
        const selection = detailSelection();
        if (!selection) return "";
        const period = selection.period
            ? dynamicsPeriodLabel(selection.period, detailBucket())
            : "Весь выбранный период";
        if (detailLoading()) return period;
        return `${period} · ${detailTransactions().length} операций`;
    });

    const [filtersOpen, setFiltersOpen] = createSignal(true);

    // сумма расходов для санкей-диаграммы (по уже отфильтрованным сплитам)
    const expenseTotal = createMemo(() =>
        filteredSplits().reduce((sum, s) => sum + (s.delta < 0 ? -s.delta : 0), 0),
    );

    // --- круговая диаграмма категорий (с drilldown по подкатегориям) ---
    const [drillLevel, setDrillLevel] = createSignal<string | null>(null);

    // при смене фильтра категорий возвращаемся к корневому срезу
    createEffect(() => {
        const cats = query().categories;
        void cats;
        setDrillLevel(null);
    });

    const categoryTree = createMemo(() => {
        const children = new Map<string, CategoryRecord[]>();
        for (const cat of categories()) {
            const parent = cat.parent_category || "";
            if (!children.has(parent)) children.set(parent, []);
            children.get(parent)!.push(cat);
        }
        return children;
    });

    const categoryBreakdown = createMemo(() => {
        const q = query();
        const level = drillLevel();
        const children = categoryTree().get(level ?? "");
        // на текущем уровне показываем: при активном фильтре — выбранные категории,
        // иначе — прямых детей текущего уровня (или верхнеуровневые на корне)
        const shown = q.categories.length && !level
            ? q.categories
                .map(id => id === WITHOUT_CATEGORY ? UNCATEGORIZED_CATEGORY : categoryMap().get(id))
                .filter((c): c is CategoryRecord => Boolean(c))
            : level
                ? children ?? []
                : [...(children ?? []), UNCATEGORIZED_CATEGORY];
        if (shown.length === 0) return [] as {cat: CategoryRecord; income: number; expense: number}[];

        const shownIds = new Set(shown.map(c => c.id));
        const ancestors = categoryAncestors();
        const byCat = new Map<string, {income: number; expense: number}>();
        for (const s of filteredSplits()) {
            // относим операцию к ближайшему показанному предку, чтобы суммы детей уходили в родителей
            const own = !s.category
                ? (shownIds.has(WITHOUT_CATEGORY) ? WITHOUT_CATEGORY : undefined)
                : shownIds.has(s.category) ? s.category : ancestors.get(s.category)?.find(a => shownIds.has(a));
            if (!own) continue;
            const totals = byCat.get(own) ?? {income: 0, expense: 0};
            if (s.delta >= 0) totals.income += s.delta;
            else totals.expense += -s.delta;
            byCat.set(own, totals);
        }
        return shown
            .map(cat => ({cat, ...(byCat.get(cat.id) ?? {income: 0, expense: 0})}))
            .filter(item => item.income > 0 || item.expense > 0);
    });

    const incomeDonutItems = createMemo(() => categoryBreakdown()
        .filter(item => item.income > 0)
        .sort((a, b) => b.income - a.income));
    const expenseDonutItems = createMemo(() => categoryBreakdown()
        .filter(item => item.expense > 0)
        .sort((a, b) => b.expense - a.expense));
    const categoryColor = (category: CategoryRecord): string => {
        if (category.color) return category.color;
        const index = categories().findIndex(item => item.id === category.id);
        return PALETTE[Math.max(0, index) % PALETTE.length];
    };

    const overallChartSeries = createMemo<BalanceSeries[]>(() => [{
        id: "total",
        label: "Все средства",
        color: "#3b82f6",
        points: overallPoints().map((point) => ({time: point.label, value: point.value})),
    }]);

    const accountChartSeries = createMemo<BalanceSeries[]>(() =>
        [...seriesByAccount().entries()].map(([id, points], index) => ({
            id,
            label: accounts().find((account) => account.id === id)
                ? accountLabel(accounts().find((account) => account.id === id)!)
                : id,
            color: PALETTE[index % PALETTE.length],
            points: points.map((point) => ({time: point.label, value: point.value})),
        })),
    );

    return (
        <Show when={standalone()} fallback={
            <div class="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
                <h1 class="text-lg font-semibold">Статистика работает в полноэкранной вкладке</h1>
                <p class="text-sm text-gray-500 max-w-72">
                    В маленьком окне расширения графики не помещаются. Откройте расширение в отдельной вкладке браузера.
                </p>
                <button
                    class="px-4 py-2 rounded-md bg-blue-500 text-white text-sm hover:bg-blue-600 transition-colors"
                    onClick={() => openFinbaseTab("statistics")}
                >
                    Открыть в отдельной вкладке
                </button>
            </div>
        }>
        <div class="page-shell">
            <div class="flex items-start justify-between gap-4 flex-wrap">
                <button
                    class={`secondary-button ${
                        filtersOpen()
                            ? "secondary-button--active"
                            : ""
                    }`}
                    onClick={() => setFiltersOpen(o => !o)}
                >
                    <FaSolidFilter/>
                    {filtersOpen() ? "Скрыть фильтры" : "Показать фильтры"}
                </button>
            </div>

            <Show when={categories().length === 0 && filteredSplits().length > 0}>
                <div class="status-message">Добавьте категории, чтобы увидеть структуру расходов.</div>
            </Show>

            <Show when={error()}>
                <Space><div class="text-sm text-red-600 break-words">{error()}</div></Space>
            </Show>

            <div class="flex flex-col xl:flex-row gap-5 items-start">
                {/* Сайдбар фильтров */}
                <aside class={`${filtersOpen() ? "flex" : "hidden"} filter-panel`}>
                    <span class="text-[11px] uppercase tracking-wide text-gray-400">Фильтры</span>
                    <MultiSelect
                        items={accountsByGroup().map(a => ({id: a.id, label: accountLabel(a)}))}
                        selected={effectiveAccounts()}
                        onChange={(ids) => updateQuery({accounts: ids})}
                        placeholder="Счета…"
                    />
                    <MultiSelect
                        items={GROUPS.map(g => ({id: g.key, label: g.label}))}
                        selected={query().groups}
                        onChange={(ids) => updateQuery({groups: ids})}
                        placeholder="Группы счетов…"
                    />
                    <MultiSelect
                        items={[
                            {id: WITHOUT_PROVIDER, label: "Без провайдера", color: "#94a3b8"},
                            ...providerOptions(),
                        ]}
                        selected={query().providers}
                        onChange={(providers) => updateQuery({providers})}
                        placeholder="Банки / провайдеры…"
                    />
                    <MultiSelect
                        items={[
                            {id: WITHOUT_OWNER, label: "Без пользователя", color: "#94a3b8"},
                            ...users().map((user) => ({id: user.id, label: user.name || user.email || user.id})),
                        ]}
                        selected={query().owners}
                        onChange={(owners) => updateQuery({owners})}
                        placeholder="Пользователи…"
                    />
                    <MultiSelect
                        items={[
                            {id: WITHOUT_CATEGORY, label: "Без категории", color: "#94a3b8"},
                            ...categories().map(c => ({id: c.id, label: c.name, color: c.color, icon: c.lucide_icon})),
                        ]}
                        selected={query().categories}
                        onChange={(ids) => updateQuery({categories: ids})}
                        placeholder="Категории…"
                    />
                    <MultiSelect
                        items={[
                            {id: WITHOUT_TAGS, label: "Без тегов", color: "#94a3b8"},
                            ...tags().map(t => ({id: t.id, label: t.name, color: t.color, icon: t.icon})),
                        ]}
                        selected={query().tags}
                        onChange={(ids) => updateQuery({tags: ids})}
                        placeholder="Теги…"
                    />
                    <Show when={query().accounts.length === 0}>
                        <span class="text-xs text-gray-400">Показаны все счета</span>
                    </Show>
                </aside>

                <div class="flex-1 flex flex-col gap-4 min-w-0">
                    <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
                        <div class="flex flex-wrap items-center gap-1">
                            <span class="mr-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">Период</span>
                            <For each={PERIODS}>
                                {(p) => (
                                    <button
                                        class={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                                            activePreset() === p.key
                                                ? "bg-blue-500 text-white border-blue-500"
                                                : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
                                        }`}
                                        onClick={() => {
                                            const {from, to} = p.range();
                                            updateQuery({period: p.key, from, to});
                                        }}
                                    >
                                        {p.label}
                                    </button>
                                )}
                            </For>
                        </div>
                        <div class="flex flex-wrap items-center gap-1 rounded-lg bg-slate-200/70 p-1">
                            <span class="px-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">Детализация</span>
                            <For each={DETAIL_LEVELS}>{(level) => (
                                <button
                                    type="button"
                                    class={`rounded-md px-2.5 py-1 text-xs transition ${bucket() === level.key ? "bg-white font-medium text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                                    onClick={() => setBucket(level.key)}
                                >
                                    {level.label}
                                </button>
                            )}</For>
                        </div>
                        <div class="flex items-center gap-1.5 text-xs text-gray-500">
                            <label class="flex items-center gap-1">
                                <span>От</span>
                                <input
                                    type="date"
                                    class="rounded-md border border-gray-200 px-2 py-1 text-xs bg-white"
                                    value={query().from}
                                    onChange={(e) => updateQuery({period: "", from: e.currentTarget.value.trim()})}
                                />
                            </label>
                            <label class="flex items-center gap-1">
                                <span>До</span>
                                <input
                                    type="date"
                                    class="rounded-md border border-gray-200 px-2 py-1 text-xs bg-white"
                                    value={query().to}
                                    onChange={(e) => updateQuery({period: "", to: e.currentTarget.value.trim()})}
                                />
                            </label>
                        </div>
                    </div>

                    <Show when={loading()}>
                        <div class="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2 text-xs text-blue-700" role="status" aria-live="polite">
                            <LoaderCircle class="size-4 shrink-0 animate-spin"/>
                            <span>{accountsLoading() ? "Загружаем счета…" : `Загружаем агрегаты по ${effectiveAccounts().length} счетам…`}</span>
                        </div>
                    </Show>

                    <Show when={!accountsLoading()}>
                        <div class="summary-grid">
                            <div class="summary-card summary-card--balance">
                                <span class="summary-card__icon"><FaSolidWallet/></span>
                                <span class="summary-card__label">Все средства</span>
                                <strong class="summary-card__value">{fmtMoney(totalBalance())}</strong>
                                <span class="summary-card__hint">На {effectiveAccounts().length} счетах</span>
                            </div>
                            <div class="summary-card">
                                <span class="summary-card__icon text-emerald-600 bg-emerald-50"><FaSolidArrowTrendUp/></span>
                                <span class="summary-card__label">Поступления</span>
                                <strong class="summary-card__value text-emerald-700">{loading() ? "—" : fmtMoney(periodIncome())}</strong>
                                <span class="summary-card__hint">{loading() ? "Загружаем агрегаты…" : "За выбранный период"}</span>
                            </div>
                            <div class="summary-card">
                                <span class="summary-card__icon text-rose-600 bg-rose-50"><FaSolidArrowTrendDown/></span>
                                <span class="summary-card__label">Расходы</span>
                                <strong class="summary-card__value text-rose-700">{loading() ? "—" : fmtMoney(periodExpense())}</strong>
                                <span class="summary-card__hint">{loading() ? "Загружаем агрегаты…" : "За выбранный период"}</span>
                            </div>
                            <div class="summary-card">
                                <span class="summary-card__icon text-violet-600 bg-violet-50"><FaSolidScaleBalanced/></span>
                                <span class="summary-card__label">Результат</span>
                                <strong class={`summary-card__value ${periodResult() >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                                    {loading() ? "—" : fmtMoney(periodResult())}
                                </strong>
                                <span class="summary-card__hint">{loading() ? "Загружаем агрегаты…" : "Поступления минус расходы"}</span>
                            </div>
                        </div>
                    </Show>

                    <Show when={!loading() && accounts().length === 0 && !error()}>
                        <div class="empty-state">
                            <div class="empty-state__icon"><FaSolidWallet/></div>
                            <div class="font-semibold text-slate-700">Счетов пока нет</div>
                            <div class="max-w-sm text-center text-sm text-slate-400">Откройте банк в браузере и запустите синхронизацию — общая картина появится здесь.</div>
                        </div>
                    </Show>

                    <Show when={!loading() && accounts().length > 0 && flows().length === 0 && !error()}>
                        <div class="status-message">Счета подключены, но в выбранном периоде пока нет операций.</div>
                    </Show>

            {/* Общий баланс */}
            <Show when={overallPoints().length > 0}>
                <Space>
                    <div class="flex items-baseline justify-between mb-1">
                        <h2 class="text-sm font-medium text-gray-500">Все средства</h2>
                        <span class="text-xl font-semibold tabular-nums">{fmtMoney(totalBalance())}</span>
                    </div>
                    <div class="h-64">
                        <BalanceChart series={overallChartSeries()} area/>
                    </div>
                </Space>
            </Show>

            {/* Баланс по счетам */}
            <Show when={seriesByAccount().size > 0}>
                <Space>
                    <div class="mb-1 flex items-center justify-between gap-3">
                        <h2 class="text-sm font-medium text-gray-500">Баланс по счетам</h2>
                        <span class="text-[11px] text-slate-400">Колесо — масштаб, перетаскивание — период</span>
                    </div>
                    <div class="h-72">
                        <BalanceChart series={accountChartSeries()}/>
                    </div>
                </Space>
            </Show>

            {/* Категории (круговая с drilldown) */}
            <Show when={incomeDonutItems().length > 0 || expenseDonutItems().length > 0}>
                <Space>
                    <div class="flex items-center justify-between mb-2">
                        <h2 class="text-sm font-medium text-gray-500">
                            {drillLevel() ? `Категория: ${categoryMap().get(drillLevel()!)?.name ?? ""}` : "Категории и подкатегории"}
                        </h2>
                        <Show when={drillLevel()}>
                            <button
                                class="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600"
                                onClick={() => setDrillLevel(null)}
                            >
                                <FaSolidArrowLeft/> Наверх
                            </button>
                        </Show>
                    </div>
                    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div class="category-donut-panel category-donut-panel--income min-w-0 rounded-2xl border border-emerald-100 bg-emerald-50/25 p-3">
                            <div class="h-60 w-full">
                                <CategoryDonut
                                    title="Доходы"
                                    items={incomeDonutItems().map(item => ({
                                        id: item.cat.id,
                                        name: item.cat.name,
                                        color: categoryColor(item.cat),
                                        value: item.income,
                                    }))}
                                    onSelect={(id) => { if (categoryTree().has(id)) setDrillLevel(id); }}
                                />
                            </div>
                            <div class="flex max-h-48 flex-col gap-1 overflow-auto">
                                <For each={incomeDonutItems()}>
                                    {(item) => (
                                        <button class="flex items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-emerald-50" onClick={() => { if (categoryTree().has(item.cat.id)) setDrillLevel(item.cat.id); }}>
                                            <span class="size-2.5 shrink-0 rounded-full" style={{background: categoryColor(item.cat)}}/>
                                            <CategoryIcon name={item.cat.lucide_icon} class="text-slate-500"/>
                                            <span class="min-w-0 flex-1 truncate text-gray-700">{item.cat.name}</span>
                                            <Show when={categoryTree().has(item.cat.id)}><span class="text-gray-300">›</span></Show>
                                            <span class="shrink-0 tabular-nums text-emerald-700">{fmtMoney(item.income)}</span>
                                        </button>
                                    )}
                                </For>
                            </div>
                        </div>
                        <div class="category-donut-panel category-donut-panel--expense min-w-0 rounded-2xl border border-rose-100 bg-rose-50/25 p-3">
                            <div class="h-60 w-full">
                                <CategoryDonut
                                    title="Расходы"
                                    items={expenseDonutItems().map(item => ({
                                        id: item.cat.id,
                                        name: item.cat.name,
                                        color: categoryColor(item.cat),
                                        value: item.expense,
                                    }))}
                                    onSelect={(id) => { if (categoryTree().has(id)) setDrillLevel(id); }}
                                />
                            </div>
                            <div class="flex max-h-48 flex-col gap-1 overflow-auto">
                                <For each={expenseDonutItems()}>
                                    {(item) => (
                                        <button class="flex items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-rose-50" onClick={() => { if (categoryTree().has(item.cat.id)) setDrillLevel(item.cat.id); }}>
                                            <span class="size-2.5 shrink-0 rounded-full" style={{background: categoryColor(item.cat)}}/>
                                            <CategoryIcon name={item.cat.lucide_icon} class="text-slate-500"/>
                                            <span class="min-w-0 flex-1 truncate text-gray-700">{item.cat.name}</span>
                                            <Show when={categoryTree().has(item.cat.id)}><span class="text-gray-300">›</span></Show>
                                            <span class="shrink-0 tabular-nums text-rose-700">{fmtMoney(item.expense)}</span>
                                        </button>
                                    )}
                                </For>
                            </div>
                        </div>
                    </div>
                </Space>
            </Show>

            {/* Движение денег: счета → категории (санкей) */}
            <Show when={expenseTotal() > 0}>
                <Space>
                    <h2 class="text-sm font-medium text-gray-500 mb-1">Движение денег</h2>
                    <Sankey accounts={accounts()} categories={categories()} splits={filteredSplits()}/>
                </Space>
            </Show>

            {/* Динамика */}
            <Show when={dynamicsRows().length > 0}>
                <Space>
                    <AccountDynamicsTable
                        periods={dynamicsPeriods()}
                        rows={dynamicsRows()}
                        bucket={bucket()}
                        onSelect={openDynamicsDetails}
                    />
                </Space>
            </Show>

            <Show when={detailSelection()}>
                <DynamicsDetailDialog
                    title={detailTitle()}
                    subtitle={detailSubtitle()}
                    transactions={detailTransactions()}
                    accounts={accounts()}
                    categories={categories()}
                    tags={tags()}
                    loading={detailLoading()}
                    error={detailError()}
                    onClose={closeDynamicsDetails}
                />
            </Show>
        </div>
        </div>
        </div>
        </Show>
    );
};
