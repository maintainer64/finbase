import {useUniversalStorage} from "@/shared/hooks/useUniversalStorage";

// Адреса T-Invest API живут здесь, а не в провайдере: настройки не должны
// зависеть от модулей с браузерными API (sw-fetch дёргает chrome на импорте).
export const TINVEST_API_PROD = "https://invest-public-api.tbank.ru/rest";
export const TINVEST_API_SANDBOX = "https://sandbox-invest-public-api.tbank.ru/rest";

const storeCache = new Map<string, ReturnType<typeof useUniversalStorage>>();

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
    'export-type': {default: 'csv', label: 'Тип экспорта'},
    'sure-url': {default: '', label: 'Адрес Sure'},
    'sure-token': {default: '', label: 'API ключ Sure', secret: true},
    'firefly-url': {default: '', label: 'Адрес Firefly III'},
    'firefly-token': {default: '', label: 'API токен Firefly III', secret: true},
    'tbank-invest-token': {default: '', label: 'Токен T-Invest OpenAPI', secret: true},
    'tbank-invest-api-url': {default: TINVEST_API_PROD, label: 'Адрес T-Invest API'},
    'general-max-transactions': {default: '1000', label: 'Лимит операций'},
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
