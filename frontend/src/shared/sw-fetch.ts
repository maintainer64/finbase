let nextId = 0;
let port: chrome.runtime.Port | null = null;
const pending = new Map<number, (v: any) => void>();

function connect() {
    port = chrome.runtime.connect({name: 'fetch-proxy'});
    port.onMessage.addListener((msg) => {
        const resolve = pending.get(msg.id);
        if (resolve) { pending.delete(msg.id); resolve(msg); }
    });
    port.onDisconnect.addListener(() => {
        port = null;
        for (const [id, resolve] of pending) {
            pending.delete(id);
            resolve({ok: false, error: 'Port disconnected'});
        }
    });
}

connect();

export async function swFetch(url: string, options?: RequestInit): Promise<Response> {
    const id = nextId++;
    const resp = await new Promise<any>(resolve => {
        pending.set(id, resolve);
        if (!port) connect();
        port!.postMessage({type: 'FETCH', id, url, options});
    });
    if (!resp.ok) {
        // Сетевая ошибка приходит как {ok:false, error} (без status/body),
        // HTTP-ошибка — как {ok:false, status, body}. Раньше печатались только
        // status/body, поэтому сетевые падали с «undefined undefined».
        const detail = resp.error ?? `HTTP ${resp.status}: ${String(resp.body).slice(0, 300)}`;
        throw new Error(`Запрос не удался (${url}): ${detail}`);
    }
    return new Response(resp.body, {status: resp.status, headers: resp.headers});
}
