import {createEffect, createSignal, onCleanup, onMount} from "solid-js";
import {useSetting} from "@/shared/settings";

export type AppearanceTheme = "system" | "light" | "dark";

const systemDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;
const [darkTheme, setDarkTheme] = createSignal(false);

export const isDarkTheme = darkTheme;

const applyTheme = (preference: AppearanceTheme) => {
    const dark = preference === "dark" || (preference === "system" && systemDark());
    setDarkTheme(dark);
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
};

/** Синхронизирует сохранённую тему, системную тему и класс корневого элемента. */
export const useThemeController = () => {
    const [preference] = useSetting("appearance-theme");
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const refreshSystemTheme = () => {
        if (preference() === "system") applyTheme("system");
    };

    createEffect(() => applyTheme(preference() as AppearanceTheme));
    onMount(() => {
        media.addEventListener("change", refreshSystemTheme);
        onCleanup(() => media.removeEventListener("change", refreshSystemTheme));
    });
};
