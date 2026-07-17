// Запуск синхронизации в отдельном окне расширения: оно переживает случайное
// закрытие popup (клик мимо) и работает, пока синк не завершится.
// Popup кладёт запрос в localStorage и открывает окно #/sync, которое его читает.

export interface SyncRequest {
    providerName: string;
    serviceName: string;
    config: Record<string, string>;
}

const SYNC_REQUEST_KEY = 'pending-sync-request';

export function launchSyncWindow(request: SyncRequest): void {
    localStorage.setItem(SYNC_REQUEST_KEY, JSON.stringify(request));
    chrome.windows.create({
        url: chrome.runtime.getURL('index.html') + '#/sync',
        type: 'popup',
        width: 460,
        height: 640,
    });
}

// Читает и удаляет запрос (одноразовый запуск).
export function takeSyncRequest(): SyncRequest | null {
    const raw = localStorage.getItem(SYNC_REQUEST_KEY);
    if (!raw) return null;
    localStorage.removeItem(SYNC_REQUEST_KEY);
    try {
        return JSON.parse(raw) as SyncRequest;
    } catch {
        return null;
    }
}
