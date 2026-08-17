import {logSync} from "@/shared/sync-log";

export const getFullNotice = (...args: any): string => {
    const filteredArray = args.filter((item: string | any[]) => typeof item === 'string' && item.length > 0);
    const uniqueArray = [...new Set(filteredArray)];
    return uniqueArray.join(';');
};

export const OpeningBalanceDateDefault = new Date(2000, 0, 1);

export const getAccountName = (accountName: string, userName?: string, source?: string): string => {
    return [accountName, userName ? `(${userName})` : '', source ? `(${source})` : ''].join(' ')
};

export const getCurrencyCodeMap = (currency?: string): string => {
    if (currency === "RUR") return "RUB"
    return currency || "RUB";
};

/**
 * Диагностика ответа источника для лога синхронизации.
 *
 * Когда список пуст, печатает код ошибки и поля ответа — иначе по «получено 0»
 * невозможно понять, что чинить: сессию, эндпоинт или разбор ответа.
 */
export function logItems(source: string, what: string, items: unknown, raw?: any): void {
    if (!Array.isArray(items) || items.length === 0) {
        const code = raw?.resultCode ?? raw?.status ?? raw?.error ?? "нет";
        const keys = Object.keys(raw ?? {}).join(", ") || "нет";
        logSync(`${source}: ${what} — пусто. Код: ${code}, поля ответа: [${keys}]`, "warn");
        return;
    }
    logSync(`${source}: ${what} — ${items.length}`);
}

export function filterByConfig<T extends { date?: string; external_account_id?: string }>(
    items: T[],
    config: Record<string, string>,
): T[] {
    const accounts = config.accounts;
    if (accounts) {
        const selected = new Set(accounts.split(','));
        items = items.filter(t => t.external_account_id && selected.has(t.external_account_id));
    }

    const dateStart = config['date-start'];
    const dateEnd = config['date-end'];
    if (dateStart || dateEnd) {
        const start = dateStart ? new Date(dateStart).getTime() : -Infinity;
        const end = dateEnd ? new Date(dateEnd).setHours(23, 59, 59, 999) : Infinity;
        items = items.filter(t => {
            if (!t.date) return false;
            const ts = new Date(t.date).getTime();
            return !isNaN(ts) && ts >= start && ts <= end;
        });
    }

    return items;
}