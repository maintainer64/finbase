import {Check, ChevronDown, LoaderCircle, Plus, Search, X} from "lucide-solid";
import {Component, createMemo, createSignal, For, onCleanup, onMount, Show, untrack} from "solid-js";
import {CategoryIcon} from "@/components/ui/category-icon";

export interface SelectOption {
    value: string;
    label: string;
    description?: string;
    color?: string;
    icon?: string;
}

interface SearchableSelectProps {
    value: string;
    options: SelectOption[];
    onChange: (value: string) => void;
    placeholder?: string;
    searchPlaceholder?: string;
    emptyLabel?: string;
    class?: string;
    disabled?: boolean;
    clearable?: boolean;
    loading?: boolean;
    emptyText?: string;
    onSearch?: (query: string) => void;
    actionLabel?: string;
    onAction?: () => void;
}

export const SearchableSelect: Component<SearchableSelectProps> = (props) => {
    const [open, setOpen] = createSignal(false);
    const [query, setQuery] = createSignal("");
    const [root, setRoot] = createSignal<HTMLDivElement>();
    const [searchInput, setSearchInput] = createSignal<HTMLInputElement>();

    const selected = createMemo(() => props.options.find((option) => option.value === props.value));
    const filtered = createMemo(() => {
        const needle = query().trim().toLocaleLowerCase("ru-RU");
        if (!needle) return props.options;
        return props.options.filter((option) => `${option.label} ${option.description ?? ""}`.toLocaleLowerCase("ru-RU").includes(needle));
    });

    const show = () => {
        if (props.disabled) return;
        setQuery("");
        props.onSearch?.("");
        setOpen(true);
        queueMicrotask(() => untrack(searchInput)?.focus());
    };

    const choose = (value: string) => {
        props.onChange(value);
        setOpen(false);
    };

    onMount(() => {
        const onPointerDown = (event: MouseEvent) => {
            if (!root()?.contains(event.target as Node)) setOpen(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onPointerDown);
        window.addEventListener("keydown", onKeyDown);
        onCleanup(() => {
            document.removeEventListener("mousedown", onPointerDown);
            window.removeEventListener("keydown", onKeyDown);
        });
    });

    return (
        <div ref={setRoot} class={`relative ${props.class ?? ""}`}>
            <button
                type="button"
                class="flex min-h-10 w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 outline-none transition hover:border-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                aria-haspopup="listbox"
                aria-expanded={open()}
                disabled={props.disabled}
                onClick={() => open() ? setOpen(false) : show()}
            >
                <Show when={selected()} fallback={<span class="min-w-0 flex-1 truncate text-slate-400">{props.placeholder ?? "Выберите…"}</span>}>
                    {(option) => (
                        <span class="flex min-w-0 flex-1 items-center gap-2">
                            <Show when={option().color}><span class="size-2.5 shrink-0 rounded-full" style={{background: option().color}}/></Show>
                            <Show when={option().icon}><CategoryIcon name={option().icon} size={15} class="shrink-0 text-slate-500"/></Show>
                            <span class="min-w-0 flex-1">
                                <span class="block truncate">{option().label}</span>
                                <Show when={option().description}><span class="block truncate text-[11px] text-slate-400">{option().description}</span></Show>
                            </span>
                        </span>
                    )}
                </Show>
                <Show when={props.value && props.clearable !== false}>
                    <span
                        role="button"
                        tabindex="0"
                        class="rounded-md p-0.5 text-slate-300 hover:bg-slate-100 hover:text-slate-600"
                        aria-label="Очистить"
                        onClick={(event) => {
                            event.stopPropagation();
                            choose("");
                        }}
                    ><X size={14}/></span>
                </Show>
                <ChevronDown size={16} class={`shrink-0 text-slate-400 transition ${open() ? "rotate-180" : ""}`}/>
            </button>

            <Show when={open()}>
                <div class="absolute left-0 z-50 mt-1.5 min-w-full w-max max-w-[22rem] overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                    <label class="relative mb-1 block">
                        <Search size={15} class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/>
                        <input
                            ref={setSearchInput}
                            type="search"
                            class="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-sm outline-none focus:border-blue-400 focus:bg-white"
                            value={query()}
                            placeholder={props.searchPlaceholder ?? "Найти…"}
                            onInput={(event) => {
                                const value = event.currentTarget.value;
                                setQuery(value);
                                props.onSearch?.(value);
                            }}
                        />
                    </label>
                    <div class="max-h-64 overflow-y-auto" role="listbox">
                        <Show when={!query() && props.emptyLabel}>
                            <button type="button" class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-slate-500 hover:bg-slate-50" onClick={() => choose("")}>
                                <span class="flex-1">{props.emptyLabel}</span>
                                <Show when={!props.value}><Check size={15} class="text-blue-500"/></Show>
                            </button>
                        </Show>
                        <Show when={props.loading}>
                            <div class="flex items-center justify-center gap-2 px-3 py-3 text-xs text-slate-400"><LoaderCircle size={14} class="animate-spin"/> Ищем…</div>
                        </Show>
                        <For each={filtered()} fallback={<Show when={!props.loading}><div class="px-3 py-6 text-center text-sm text-slate-400">{props.emptyText ?? "Ничего не найдено"}</div></Show>}>
                            {(option) => (
                                <button
                                    type="button"
                                    role="option"
                                    aria-selected={props.value === option.value}
                                    class={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${props.value === option.value ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-50"}`}
                                    onClick={() => choose(option.value)}
                                >
                                    <Show when={option.color}><span class="size-2.5 shrink-0 rounded-full" style={{background: option.color}}/></Show>
                                    <Show when={option.icon}><CategoryIcon name={option.icon} size={15} class="shrink-0 text-slate-500"/></Show>
                                    <span class="min-w-0 flex-1">
                                        <span class="block truncate">{option.label}</span>
                                        <Show when={option.description}><span class="block truncate text-[11px] text-slate-400">{option.description}</span></Show>
                                    </span>
                                    <Show when={props.value === option.value}><Check size={15} class="shrink-0 text-blue-500"/></Show>
                                </button>
                            )}
                        </For>
                    </div>
                    <Show when={props.actionLabel && props.onAction}>
                        <button
                            type="button"
                            class="mt-1 flex w-full items-center gap-2 border-t border-slate-100 px-2.5 pt-2 pb-1 text-left text-sm font-medium text-blue-600 hover:text-blue-700"
                            onClick={() => {
                                setOpen(false);
                                props.onAction?.();
                            }}
                        >
                            <Plus size={15}/>{props.actionLabel}
                        </button>
                    </Show>
                </div>
            </Show>
        </div>
    );
};
