import {createSignal, onCleanup, onMount} from "solid-js";

export interface ActiveTab {
    url: () => string | undefined;
}

export const useActiveTabUrl = (): ActiveTab => {
    const [url, setUrl] = createSignal<string | undefined>(undefined);

    const updateTab = async () => {
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        setUrl(tab.url);
    };

    onMount(() => {
        updateTab(); // Начальная загрузка

        // Слушатели Chrome API
        const listeners = [
            {event: chrome.tabs.onUpdated, handler: updateTab},
            {event: chrome.tabs.onActivated, handler: updateTab},
            {event: chrome.tabs.onRemoved, handler: updateTab},
            {event: chrome.windows.onFocusChanged, handler: updateTab}, // Для смены фокуса окна
        ];

        listeners.forEach(({event, handler}) => event.addListener(handler));

        // Polling для надежности (опрос каждые 1.5 секунды)
        const pollingInterval = setInterval(updateTab, 1500);

        onCleanup(() => {
            listeners.forEach(({event, handler}) => event.removeListener(handler));
            clearInterval(pollingInterval);
        });
    });

    return {
        url,
    };
};