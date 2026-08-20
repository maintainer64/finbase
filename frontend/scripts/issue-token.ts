// Выпуск долговременного API-токена пользователя для расширения.
//
// PocketBase не имеет обычных API-ключей: суперюзер может выпустить для
// пользователя auth-токен с произвольным сроком (impersonate). Токен вставляется
// в расширение в настройку finbase-token.
//
// Использование:
//   pnpm issue:token [email] [duration-seconds]
//   FINBASE_URL=... FINBASE_SUPERUSER_EMAIL=... FINBASE_SUPERUSER_PASSWORD=... \
//     pnpm issue:token test@finbase.local 3153600000
import {logSync} from "@/shared/sync-log";

const BASE_URL = process.env.FINBASE_URL ?? "http://127.0.0.1:8090";
const SUPERUSER_EMAIL = process.env.FINBASE_SUPERUSER_EMAIL ?? "admin@finbase.local";
const SUPERUSER_PASSWORD = process.env.FINBASE_SUPERUSER_PASSWORD ?? "FinbaseAdmin2026!";

const targetEmail = process.argv[2] ?? "test@finbase.local";
// По умолчанию ~50 лет — расширению токен нужен «навсегда», инвалидация — сменой пароля.
const durationSeconds = Number(process.argv[3] ?? 3153600000);

async function json<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${BASE_URL}/api/${url}`, {
        ...init,
        headers: {"Content-Type": "application/json", ...(init?.headers ?? {})},
    });
    const body = (await res.json()) as T;
    if (!res.ok) {
        throw new Error(`${url}: HTTP ${res.status} ${JSON.stringify(body)}`);
    }
    return body;
}

async function main() {
    const superToken = (await json<{token: string}>("collections/_superusers/auth-with-password", {
        method: "POST",
        body: JSON.stringify({identity: SUPERUSER_EMAIL, password: SUPERUSER_PASSWORD}),
    })).token;

    const auth = {Authorization: `Bearer ${superToken}`};

    const users = await json<{items: {id: string; email: string}[]}>(
        `collections/users/records?perPage=200&filter=${encodeURIComponent(`email = "${targetEmail}"`)}`,
        {headers: auth},
    );
    const user = users.items[0];
    if (!user) {
        throw new Error(`Пользователь ${targetEmail} не найден. Создайте его в админке PocketBase (/_/).`);
    }

    const result = await json<{token: string; record: {email: string}}>(
        `collections/users/impersonate/${user.id}`,
        {
            method: "POST",
            headers: auth,
            body: JSON.stringify({duration: durationSeconds}),
        },
    );

    logSync("Токен выпущен.");
    console.log("Email:", result.record.email);
    console.log("Срок (сек):", durationSeconds);
    console.log("Токен (вставьте в настройки расширения → finbase-token):");
    console.log(result.token);
}

main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
});