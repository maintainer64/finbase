import {createSignal} from "solid-js";

/**
 * Лог синхронизации: провайдеры и сервисы пишут сюда, окно синка показывает
 * это в сворачиваемой панели. Раньше такие сообщения уходили в console.warn,
 * где их никто не видел (окно синка — отдельная страница).
 */
export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
    time: string;   // HH:MM:SS
    level: LogLevel;
    message: string;
}

const [logs, setLogs] = createSignal<LogEntry[]>([]);

export {logs};

/**
 * Объекты в шаблонных строках превращаются в «[object Object]», поэтому
 * разворачиваем их в JSON (Error — в текст сообщения).
 */
export function formatLogValue(value: unknown): string {
    if (typeof value === "string") return value;
    if (value instanceof Error) return value.message;
    if (value === null || value === undefined) return String(value);
    if (typeof value !== "object") return String(value);
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

export function logSync(message: unknown, level: LogLevel = "info"): void {
    const time = new Date().toTimeString().slice(0, 8);
    const text = formatLogValue(message);
    setLogs((prev) => [...prev, {time, level, message: text}]);
    // Дублируем в консоль — удобно при отладке в DevTools окна синка.
    const toConsole = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    // В консоль отдаём исходное значение — там объект можно развернуть кликом.
    toConsole(`[sync ${time}]`, message);
}

export function clearSyncLog(): void {
    setLogs([]);
}
