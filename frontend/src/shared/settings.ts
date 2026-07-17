import {useUniversalStorage} from "@/shared/hooks/useUniversalStorage";

const storeCache = new Map<string, unknown>();

/**
 * Единая схема настроек — ЕДИНСТВЕННОЕ место, где заводится новая настройка.
 *
 * Отсюда берутся значения по умолчанию, подписи и список того, что попадает
 * в JSON импорт/экспорт. Чтобы добавить настройку, допишите строку сюда —
 * импорт/экспорт подхватит её автоматически.
 *
 * exportable: false — служебные флаги, которые не нужно переносить между машинами.
 */
export const SETTINGS = {
    'finbase-url': {default: '', label: 'Адрес Finbase (PocketBase)'},
    'finbase-token': {default: '', label: 'API-токен Finbase', secret: true},
    'finbase-auth-name': {default: '', label: 'Пользователь Finbase', exportable: false},
    'general-max-transactions': {default: '1000', label: 'Лимит операций'},
    'appearance-theme': {default: 'system', label: 'Тема оформления'},
    'user-name': {default: '', label: 'Имя пользователя'},
    'date-start': {default: '', label: 'Дата начала'},
    'date-end': {default: '', label: 'Дата окончания'},
    'fetch-json-provider-data': {default: false, label: 'Показывать выгрузку в JSON (отладка)'},
    'onboarding-completed': {default: false, label: 'Онбординг пройден', exportable: false},
} as const;

export type SettingKey = keyof typeof SETTINGS;

/** Тип значения настройки выводится из её значения по умолчанию. */
export type SettingValue<K extends SettingKey> = (typeof SETTINGS)[K]['default'] extends boolean
    ? boolean
    : string;

/** Настройки, попадающие в JSON импорт/экспорт (всё, кроме exportable: false). */
export const EXPORTABLE_KEYS = (Object.keys(SETTINGS) as SettingKey[]).filter(
    (key) => (SETTINGS[key] as {exportable?: boolean}).exportable !== false,
);

export const ALL_KEYS = Object.keys(SETTINGS) as SettingKey[];

/**
 * Типизированный доступ к настройке: ключ и тип проверяются компилятором,
 * значение по умолчанию берётся из схемы (не дублируется по файлам).
 */
export function useSetting<K extends SettingKey>(key: K) {
    if (!storeCache.has(key)) {
        storeCache.set(key, useUniversalStorage<SettingValue<K>>(key, SETTINGS[key].default as SettingValue<K>));
    }
    return storeCache.get(key) as ReturnType<typeof useUniversalStorage<SettingValue<K>>>;
}

/**
 * Снимок значений настроек для передачи провайдеру (ProviderParams.config).
 * Провайдер сам объявляет нужные ключи через getConfigKeys(), поэтому странице
 * не нужно знать, какая настройка какому источнику принадлежит.
 */
export function useSettingsSnapshot(): (keys?: readonly string[]) => Record<string, string> {
    const stores = Object.fromEntries(
        ALL_KEYS.map((key) => [key, useSetting(key)]),
    ) as Record<string, ReturnType<typeof useSetting>>;

    return (keys = ALL_KEYS) => {
        const result: Record<string, string> = {};
        for (const key of keys) {
            const store = stores[key];
            result[key] = store ? String(store[0]() ?? "") : "";
        }
        return result;
    };
}
