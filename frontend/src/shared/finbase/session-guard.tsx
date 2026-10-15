import {batch, Component, createEffect, createSignal, onCleanup, Show} from "solid-js";
import {ClientResponseError} from "pocketbase";
import {useSetting} from "@/shared/settings";
import {refreshFinbaseSession} from "./auth";
import {getFinbaseTokenError, normalizeFinbaseToken} from "./token";
import {navigateTo} from "@/shared/routing";

export const FinbaseSessionGuard: Component<{children: import("solid-js").JSX.Element}> = (props) => {
    const [url] = useSetting("finbase-url"), [token, setToken] = useSetting("finbase-token"), [, setName] = useSetting("finbase-auth-name");
    const [ready, setReady] = createSignal(false), [error, setError] = createSignal("");
    let verified = "", serial = 0;
    createEffect(() => {
        const base = url().trim().replace(/\/+$/, ""), value = normalizeFinbaseToken(token());
        const key = `${base}\n${value}`, request = ++serial;
        if (key === verified) {setReady(true); return;}
        setReady(false);
        if (!base) {setError("Укажите адрес Finbase в настройках."); return;}
        const tokenError = getFinbaseTokenError(value);
        if (tokenError) {setError(tokenError); return;}
        setError("");
        void refreshFinbaseSession(base, value).then(session => {
            if (request !== serial) return;
            verified = `${base}\n${session.token}`;
            batch(() => {setToken(session.token); setName(session.displayName); setReady(true);});
        }).catch(cause => {
            if (request !== serial) return;
            setError(cause instanceof ClientResponseError && cause.status === 401
                ? "Finbase: сеанс недействителен. Войдите заново; счета и операции не удалены."
                : cause instanceof Error ? cause.message : String(cause));
        });
    });
    const invalid = (event: Event) => {
        const detail = (event as CustomEvent<{url: string; token: string}>).detail;
        if (detail.url !== url().trim().replace(/\/+$/, "") || detail.token !== normalizeFinbaseToken(token())) return;
        verified = ""; serial++;
        batch(() => {setReady(false); setError("Сеанс истёк. Войдите заново; данные на сервере сохранены."); setToken(""); setName("");});
    };
    window.addEventListener("finbase-session-invalid", invalid);
    onCleanup(() => {serial++; window.removeEventListener("finbase-session-invalid", invalid);});
    return <Show when={ready()} fallback={<div class="mx-auto max-w-xl rounded-xl border border-slate-200 p-6 text-center dark:border-slate-700"><p role={error() ? "alert" : "status"}>{error() || "Проверяем сеанс Finbase…"}</p><Show when={error()}><button class="primary-button mt-4" onClick={() => navigateTo("settings")}>Открыть настройки и вход</button></Show></div>}>{props.children}</Show>;
};
