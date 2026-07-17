import {CalendarDays, ChevronLeft, ChevronRight, X} from "lucide-solid";
import {Component, createMemo, createSignal, For, onCleanup, onMount, Show, untrack} from "solid-js";
import {toDateValue} from "@/shared/date";

interface DatePickerProps {
    value: string;
    onChange: (value: string) => void;
    id?: string;
    placeholder?: string;
    class?: string;
    disabled?: boolean;
}

const monthFormatter = new Intl.DateTimeFormat("ru-RU", {month: "long", year: "numeric"});
const valueFormatter = new Intl.DateTimeFormat("ru-RU", {day: "2-digit", month: "2-digit", year: "numeric"});
const weekDays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const parseDay = (value: string): Date | null => {
    const match = toDateValue(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
};

const dayValue = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

export const DatePicker: Component<DatePickerProps> = (props) => {
    const [open, setOpen] = createSignal(false);
    const [month, setMonth] = createSignal<Date>(parseDay(untrack(() => props.value)) ?? new Date());
    const [root, setRoot] = createSignal<HTMLDivElement>();

    const days = createMemo(() => {
        const current = month();
        const first = new Date(current.getFullYear(), current.getMonth(), 1);
        const mondayOffset = (first.getDay() + 6) % 7;
        const start = new Date(current.getFullYear(), current.getMonth(), 1 - mondayOffset);
        return Array.from({length: 42}, (_, index) => {
            const date = new Date(start);
            date.setDate(start.getDate() + index);
            return date;
        });
    });

    const displayValue = createMemo(() => {
        const date = parseDay(props.value);
        return date ? valueFormatter.format(date) : "";
    });

    const shiftMonth = (offset: number) => {
        const current = month();
        setMonth(new Date(current.getFullYear(), current.getMonth() + offset, 1));
    };

    const choose = (date: Date) => {
        props.onChange(dayValue(date));
        setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
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
                id={props.id}
                type="button"
                disabled={props.disabled}
                aria-haspopup="dialog"
                aria-expanded={open()}
                class="flex min-h-10 w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm outline-none transition hover:border-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
                onClick={() => {
                    const selected = parseDay(props.value);
                    if (selected) setMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
                    setOpen(!open());
                }}
            >
                <CalendarDays size={16} class="shrink-0 text-slate-400"/>
                <span class={`min-w-0 flex-1 truncate ${displayValue() ? "text-slate-700" : "text-slate-400"}`}>
                    {displayValue() || props.placeholder || "Выберите дату"}
                </span>
                <Show when={props.value}>
                    <span
                        role="button"
                        tabindex="0"
                        aria-label="Очистить дату"
                        class="rounded-md p-0.5 text-slate-300 hover:bg-slate-100 hover:text-slate-600"
                        onClick={(event) => {
                            event.stopPropagation();
                            props.onChange("");
                        }}
                    ><X size={14}/></span>
                </Show>
            </button>

            <Show when={open()}>
                <div class="absolute left-0 z-50 mt-1.5 w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl" role="dialog" aria-label="Календарь">
                    <div class="mb-2 flex items-center justify-between">
                        <button type="button" class="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Предыдущий месяц" onClick={() => shiftMonth(-1)}><ChevronLeft size={18}/></button>
                        <span class="text-sm font-semibold capitalize text-slate-700">{monthFormatter.format(month())}</span>
                        <button type="button" class="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Следующий месяц" onClick={() => shiftMonth(1)}><ChevronRight size={18}/></button>
                    </div>
                    <div class="grid grid-cols-7 gap-0.5">
                        <For each={weekDays}>{(day) => <span class="py-1 text-center text-[10px] font-semibold uppercase text-slate-400">{day}</span>}</For>
                        <For each={days()}>
                            {(date) => {
                                const value = dayValue(date);
                                const selected = () => value === toDateValue(props.value);
                                const today = () => value === dayValue(new Date());
                                const outside = () => date.getMonth() !== month().getMonth();
                                return (
                                    <button
                                        type="button"
                                        class={`relative flex aspect-square items-center justify-center rounded-lg text-xs transition ${selected() ? "bg-blue-600 font-semibold text-white shadow-sm" : outside() ? "text-slate-300 hover:bg-slate-50" : "text-slate-700 hover:bg-blue-50 hover:text-blue-700"}`}
                                        onClick={() => choose(date)}
                                    >
                                        {date.getDate()}
                                        <Show when={today() && !selected()}><span class="absolute bottom-1 size-1 rounded-full bg-blue-500"/></Show>
                                    </button>
                                );
                            }}
                        </For>
                    </div>
                    <div class="mt-2 flex justify-between border-t border-slate-100 pt-2">
                        <button type="button" class="rounded-lg px-2.5 py-1.5 text-xs text-slate-500 hover:bg-slate-50" onClick={() => { props.onChange(""); setOpen(false); }}>Очистить</button>
                        <button type="button" class="rounded-lg px-2.5 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50" onClick={() => choose(new Date())}>Сегодня</button>
                    </div>
                </div>
            </Show>
        </div>
    );
};
