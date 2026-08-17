// api.ts

import {BaseAccountFields} from "@/shared/providers/services/sure/sureInternalClient/types";
import {flattenObject} from "@/shared/providers/services/sure/sureInternalClient/utils";

/**
 * Параметры конструктора API-клиента.
 */
interface ApiOptions {
    /** Базовая функция fetch (например, для использования в Node.js с node-fetch) */
    fetch?: typeof fetch;
    /** Политика отправки cookies (по умолчанию 'same-origin') */
    credentials?: RequestCredentials;
}

/**
 * Основной класс для взаимодействия с API.
 */
export class SureInternalApi {
    private readonly baseUrl: string;
    private lastCSRF: string = "";
    private readonly fetchFn: typeof fetch;
    private readonly credentials: RequestCredentials;

    constructor(baseUrl: string, options: ApiOptions = {}) {
        // Убираем завершающий слеш, чтобы избежать двойных слешей
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
        this.credentials = options.credentials ?? 'include';
    }

    /**
     * Получение свежего authenticity_token со главной страницы.
     * Ищет <meta name="csrf-token" content="..."> и <form action="/{action}/"><input name="authenticity_token">
     */
    private async fetchAuthenticityToken(path: string, action: string): Promise<string> {
        const url = `${this.baseUrl}${path}`;
        const response = await this.fetchFn(url, {
            credentials: this.credentials,
        });
        const html = await response.text();

        // Загружаем HTML в виртуальный DOM
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const metaTag = doc.querySelector('meta[name="csrf-token"]') as HTMLMetaElement | null;
        if (metaTag && metaTag.content) {
            this.lastCSRF = metaTag.content;
        }

        const inputInPostForm = doc.querySelector(`form[method="post" i][action*="${action}" i] input[type="hidden"][name="authenticity_token"]`) as HTMLInputElement | null;
        if (inputInPostForm && inputInPostForm.value) {
            return inputInPostForm.value;
        }
        console.warn('Не удалось найти Authenticity или CSRF токен через DOM');
        return '';
    }


    /**
     * Универсальный метод для отправки POST-запроса с form-urlencoded телом.
     * После ответа 302 автоматически следует редиректам и возвращает финальный ответ.
     *
     * @param path - путь относительно baseUrl (начинается с /)
     * @param body - объект с ключами и значениями (уже должен содержать authenticity_token,
     *               если он требуется сервером)
     */
    async postForm(path: string, body: Record<string, string>): Promise<Response> {
        const url = `${this.baseUrl}${path}`;
        const formBody = new URLSearchParams(body).toString();

        return this.fetchFn(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Csrf-Token': this.lastCSRF,
                // Origin выставляется не здесь (fetch игнорирует этот заголовок),
                // а через DNR в service worker — см. DNR_RULES в service-worker.js.
            },
            body: formBody,
            credentials: this.credentials,
            // follow — стандартное поведение, после 302 автоматически идём GET’ом на новый URL
            redirect: 'follow',
        });
    }

    /**
     * Создаёт новый депозитарный счёт (POST /depositories).
     */
    async createDepository(
        params: [BaseAccountFields, string],
    ): Promise<Response> {
        const path = params[1];
        const paramsFlatted = flattenObject(params[0], "account")
        const token = await this.fetchAuthenticityToken(`${path}/new?return_to=/account`, path);
        return this.postForm(path, {
            authenticity_token: token,
            ...paramsFlatted
        });
    }

    async getTickerByName(ticker: string, dataProviders: string[] = [], countryCode?: string): Promise<string[]> {
        const token = await this.fetchAuthenticityToken(`/trades/new`, "");
        const url = new URL(`${this.baseUrl}/securities`);
        url.searchParams.append('for_id', 'model_ticker');
        url.searchParams.append('format', 'turbo');
        url.searchParams.append('q', ticker);
        if (countryCode) {
            url.searchParams.append('country_code', countryCode);
        }
        const response = await this.fetchFn(url.toString(), {
            method: 'GET',
            headers: {'X-Csrf-Token': this.lastCSRF || token},
            credentials: this.credentials,
            redirect: 'follow',
        });

        if (!response.ok) return [];
        const turboHtml = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(turboHtml, 'text/html');
        const streams = doc.querySelectorAll('turbo-stream');

        interface Entry {
            full: string;
            short: string;
        }

        const all: Entry[] = [];
        for (const stream of streams) {
            const template = stream.querySelector('template');
            if (!template) continue;
            const templateContent = template.innerHTML;
            if (!templateContent.trim()) continue;
            const templateDoc = parser.parseFromString(templateContent, 'text/html');
            const elements = templateDoc.querySelectorAll('[data-value]');

            for (const el of elements) {
                const raw = el.getAttribute('data-value');
                if (!raw) continue;
                const full = raw.trim();
                if (full === '') continue;
                const parts = full.split('|');
                all.push({
                    full,
                    short: parts[0],
                });
            }
        }

        const result: string[] = [];
        const seen = new Set<string>();

        const providers = dataProviders.length > 0 ? dataProviders : [''];

        for (const isStrict of [true, false]) {
            for (const provider of providers) {
                for (const value of all) {
                    if (isStrict && !value.full.includes(ticker)) continue;
                    if (provider && !value.full.includes(provider)) continue;
                    if (seen.has(value.full)) continue;
                    seen.add(value.full);
                    result.push(value.full, value.short);
                }
            }
        }
        return result;
    }
}