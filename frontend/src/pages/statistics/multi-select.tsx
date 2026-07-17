import {createSignal, For, onCleanup, onMount, Show} from "solid-js";
import {FaSolidAngleDown} from "solid-icons/fa";
import {CategoryIcon} from "@/components/ui/category-icon";

/**
 * Выпадающий мультиселект (счета, категории, теги).
 * Показывается как кнопка с чипами выбранных значений; попап — список с чекбоксами.
 * Закрытие по клику вне (глобальный listener).
 */

interface Item {
    id: string;
    label: string;
    color?: string;
    icon?: string;
}

export const MultiSelect = (props: {
    items: Item[];
    selected: string[];
    onChange: (ids: string[]) => void;
    placeholder: string;
    badgeClass?: string;
}) => {
    const [open, setOpen] = createSignal(false);

    const toggle = (id: string) => {
        const next = props.selected.includes(id)
            ? props.selected.filter(x => x !== id)
            : [...props.selected, id];
        props.onChange(next);
    };

    const onLocalClick = (e: MouseEvent) => e.stopPropagation();

    onMount(() => {
        const onGlobalClick = () => setOpen(false);
        window.addEventListener("click", onGlobalClick);
        onCleanup(() => window.removeEventListener("click", onGlobalClick));
    });

    return (
        <div class="relative" onClick={onLocalClick}>
            <button
                type="button"
                class="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-md border bg-white text-gray-600 border-gray-200 hover:border-blue-300 transition-colors max-w-64"
                onClick={() => setOpen(!open())}
            >
                <Show when={props.selected.length === 0} fallback={<span class="truncate">{props.selected.length} выбрано</span>}>
                    <span class="text-gray-400">{props.placeholder}</span>
                </Show>
                <Show when={props.selected.length > 0}>
                    <span
                        role="button"
                        aria-label="Сбросить"
                        class="ml-0.5 px-0.5 text-gray-300 hover:text-red-400 cursor-pointer"
                        onClick={(e) => {
                            e.stopPropagation();
                            props.onChange([]);
                        }}
                    >×</span>
                </Show>
                <FaSolidAngleDown class={`shrink-0 transition-transform ${open() ? "rotate-180" : ""}`}/>
            </button>

            <Show when={open()}>
                <div
                    class="absolute z-20 mt-1 w-64 max-h-72 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg p-1.5"
                    onClick={onLocalClick}
                >
                    <Show when={props.items.length === 0} fallback={
                        <For each={props.items}>
                            {(item) => (
                                <label class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer text-sm select-none">
                                    <input
                                        type="checkbox"
                                        class="accent-blue-500"
                                        checked={props.selected.includes(item.id)}
                                        onChange={() => toggle(item.id)}
                                    />
                                    <Show when={item.color}>
                                        <span class="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{background: item.color}}/>
                                    </Show>
                                    <Show when={item.icon}>
                                        <CategoryIcon name={item.icon} class="text-slate-500"/>
                                    </Show>
                                    <span class="truncate text-gray-700">{item.label}</span>
                                </label>
                            )}
                        </For>
                    }>
                        <div class="px-2 py-1.5 text-xs text-gray-400">Ничего нет</div>
                    </Show>
                </div>
            </Show>
        </div>
    );
};
