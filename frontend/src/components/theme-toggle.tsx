import {For} from "solid-js";
import {Laptop, Moon, Sun} from "lucide-solid";
import {Dynamic} from "solid-js/web";
import {useSetting} from "@/shared/settings";
import {AppearanceTheme} from "@/shared/theme";

const OPTIONS = [
    {value: "system" as const, label: "Как в системе", icon: Laptop},
    {value: "light" as const, label: "Светлая тема", icon: Sun},
    {value: "dark" as const, label: "Тёмная тема", icon: Moon},
];

export const ThemeToggle = () => {
    const [theme, setTheme] = useSetting("appearance-theme");
    return (
        <div class="theme-toggle" role="group" aria-label="Тема оформления">
            <For each={OPTIONS}>{(option) => (
                <button
                    type="button"
                    class={`theme-toggle__item ${theme() === option.value ? "theme-toggle__item--active" : ""}`}
                    title={option.label}
                    aria-label={option.label}
                    aria-pressed={theme() === option.value}
                    onClick={() => setTheme(option.value as AppearanceTheme)}
                >
                    <Dynamic component={option.icon} size={15}/>
                </button>
            )}</For>
        </div>
    );
};
