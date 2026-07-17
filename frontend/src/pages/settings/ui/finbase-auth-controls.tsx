import {Component, createMemo, createSignal, Show} from "solid-js";
import {CircleAlert, LogIn, LogOut, ShieldCheck} from "lucide-solid";
import {toast} from "solid-toast";
import {useSetting} from "@/shared/settings";
import {loginWithFinbaseOIDC} from "@/shared/finbase/auth";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {getFinbaseTokenError, normalizeFinbaseToken} from "@/shared/finbase/token";
import {isFullAppWindow, openFinbaseTab} from "@/shared/open-finbase";

export const FinbaseAuthControls: Component<{showUrl?: boolean}> = (props) => {
    const [url, setUrl] = useSetting("finbase-url");
    const [token, setToken] = useSetting("finbase-token");
    const [authName, setAuthName] = useSetting("finbase-auth-name");
    const [loading, setLoading] = createSignal(false);
    const [loginMovedToTab, setLoginMovedToTab] = createSignal(false);
    const tokenError = createMemo(() => token() ? getFinbaseTokenError(token()) : null);
    const hasValidToken = createMemo(() => Boolean(normalizeFinbaseToken(token())) && !tokenError());

    const login = async () => {
        // Chrome закрывает action popup, когда OAuth открывает окно Authelia.
        // Авторизацию запускаем из обычной вкладки, которая переживёт весь flow.
        if (!isFullAppWindow()) {
            openFinbaseTab("settings");
            setLoginMovedToTab(true);
            return;
        }
        setLoading(true);
        try {
            const result = await loginWithFinbaseOIDC(url());
            setToken(result.token);
            setAuthName(result.displayName);
            toast.success(`Вход выполнен: ${result.displayName}`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : String(error));
        } finally {
            setLoading(false);
        }
    };

    const logout = () => {
        setToken("");
        setAuthName("");
        toast.success("Сеанс Finbase завершён");
    };

    return (
        <div class="space-y-4">
            <Show when={props.showUrl !== false}>
                <div>
                    <Label for="finbase-url">Адрес PocketBase</Label>
                    <Input
                        id="finbase-url"
                        placeholder="http://127.0.0.1:8080"
                        value={url()}
                        onChange={setUrl}
                    />
                </div>
            </Show>

            <Show when={tokenError()}>
                {(message) => (
                    <div class="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        <CircleAlert class="mt-0.5 shrink-0" size={18}/>
                        <span>{message()}</span>
                    </div>
                )}
            </Show>

            <Show when={loginMovedToTab()}>
                <div class="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                    Finbase открыт в новой вкладке. Нажмите там «Войти через Authelia / OIDC».
                </div>
            </Show>

            <Show when={hasValidToken()} fallback={
                <button
                    type="button"
                    class="primary-button w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={loading() || !url().trim()}
                    onClick={login}
                >
                    <LogIn size={17}/>
                    {loading()
                        ? "Открываем Authelia…"
                        : isFullAppWindow()
                            ? "Войти через Authelia / OIDC"
                            : "Открыть вход в новой вкладке"}
                </button>
            }>
                <div class="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                    <div class="flex min-w-0 items-center gap-2 text-emerald-800">
                        <ShieldCheck size={19}/>
                        <div class="min-w-0">
                            <div class="text-xs text-emerald-600">Подключено</div>
                            <div class="truncate text-sm font-medium">{authName() || "PocketBase"}</div>
                        </div>
                    </div>
                    <button type="button" class="secondary-button shrink-0" onClick={logout}>
                        <LogOut size={15}/> Выйти
                    </button>
                </div>
            </Show>

            <details class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <summary class="cursor-pointer text-xs text-slate-500">Ручной токен для диагностики</summary>
                <div class="mt-3">
                    <Input
                        id="finbase-token"
                        type="password"
                        placeholder="PocketBase JWT"
                        value={token()}
                        onChange={setToken}
                    />
                    <p class="mt-2 text-xs leading-relaxed text-slate-500">
                        Можно вставить JWT с префиксом Bearer или без него. При запросе значение будет очищено от пробелов и префикса.
                    </p>
                </div>
            </details>
        </div>
    );
};
