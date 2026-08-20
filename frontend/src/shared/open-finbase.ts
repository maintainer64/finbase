import {Accessor, createSignal, onCleanup, onMount} from "solid-js";

const FULL_APP_BREAKPOINT = 700;

interface ChromeLikeWindow {
    chrome?: {
        runtime?: {getURL?: (path: string) => string};
        tabs?: {create?: (options: {url: string}) => void};
    };
}

export const isFullAppWindow = (): boolean =>
    Math.min(window.outerWidth, window.innerWidth) > FULL_APP_BREAKPOINT;

export const useFullAppWindow = (): Accessor<boolean> => {
    const [fullApp, setFullApp] = createSignal(isFullAppWindow());
    onMount(() => {
        const update = () => setFullApp(isFullAppWindow());
        window.addEventListener("resize", update);
        onCleanup(() => window.removeEventListener("resize", update));
    });
    return fullApp;
};

export const openFinbaseTab = (route: "statistics" | "data" | "automation" = "statistics") => {
    const chromeApi = (window as unknown as ChromeLikeWindow).chrome;
    const base = chromeApi?.runtime?.getURL?.("index.html") ?? window.location.href.split("#")[0];
    const target = `${base}#/${route}`;
    try {
        if (chromeApi?.tabs?.create) chromeApi.tabs.create({url: target});
        else window.open(target, "_blank", "noopener,noreferrer");
    } catch {
        window.open(target, "_blank", "noopener,noreferrer");
    }
};
