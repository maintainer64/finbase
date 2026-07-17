import {Component, createEffect, createSignal, For, Match, onMount, Show, Switch} from "solid-js";
import {FaSolidCircleCheck, FaSolidCircleXmark, FaSolidSpinner} from "solid-icons/fa";
import {ProviderParams, SyncProgress} from "@/shared/providers/base";
import {findProviderByName} from "@/shared/providers/registry";
import {useServices} from "@/shared/hooks/useServices";
import {takeSyncRequest, SyncRequest} from "@/shared/sync-launch";
import {ProgressBar} from "@/components/ui/progress";
import {Collapsible} from "@/components/ui/collapsible";
import {logs, logSync} from "@/shared/sync-log";

type Status = "running" | "done" | "error";

export const SyncPage: Component = () => {
    const services = useServices();
    const [request] = createSignal<SyncRequest | null>(takeSyncRequest());
    const [progress, setProgress] = createSignal<SyncProgress>({stage: "Подготовка…"});
    const [status, setStatus] = createSignal<Status>("running");
    const [errorMsg, setErrorMsg] = createSignal("");
    const [started, setStarted] = createSignal(false);

    /**
     * Повторный запуск без закрытия окна: запрос остаётся в памяти (в localStorage
     * он одноразовый). Удобно для отладки — открыть Network в DevTools service
     * worker'а и нажать «Повторить», не проходя весь путь из popup заново.
     */
    const retry = () => {
        const req = request();
        if (!req) return;
        logSync("— Повторный запуск —");
        setErrorMsg("");
        setProgress({stage: "Подготовка…"});
        setStatus("running");
        void runSync(req);
    };

    const runSync = async (req: SyncRequest) => {
        const provider = findProviderByName(req.providerName);
        const service = services().services.find(s => s.getName() === req.serviceName);

        if (!provider) {
            setErrorMsg(`Провайдер «${req.providerName}» не найден`);
            setStatus("error");
            return;
        }
        if (!service) {
            setErrorMsg(`Сервис «${req.serviceName}» не настроен`);
            setStatus("error");
            return;
        }

        const params: ProviderParams = {config: req.config};

        try {
            // Подготовка (напр. у Яндекса — поиск операций в webpack-бандле).
            if (provider.prepare) {
                setProgress({stage: "Подготовка…"});
                await provider.prepare(params, setProgress);
            }

            logSync(`Старт: ${req.providerName} → ${req.serviceName}`);
            if (provider.getAccounts && service.createAccountsIfNotExists) {
                setProgress({stage: "Загрузка счетов из банка…"});
                const [accounts] = await provider.getAccounts?.(params) || [[], undefined];
                logSync(`Счетов получено: ${accounts.length}`);
                await service.createAccountsIfNotExists(accounts, setProgress);
            }

            if (provider.getTransactions && service.createTransactionsIfNotExists) {
                setProgress({stage: "Загрузка операций из банка…"});
                const [transactions] = await provider.getTransactions(params) || [[], undefined];
                transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                logSync(`Операций получено: ${transactions.length}`);
                await service.createTransactionsIfNotExists(transactions, setProgress);
            }

            logSync("Синхронизация завершена");
            setProgress({stage: "Готово"});
            setStatus("done");
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            logSync(message, "error");
            setErrorMsg(message);
            setStatus("error");
        }
    };

    onMount(() => {
        if (!request()) {
            setErrorMsg("Нет запроса на синхронизацию");
            setStatus("error");
        }
    });

    // Ждём, пока нужный сервис появится, и стартуем один раз.
    createEffect(() => {
        const req = request();
        if (!req || started() || status() === "error") return;
        const ready = services().services.some(s => s.getName() === req.serviceName);
        if (ready) {
            setStarted(true);
            void runSync(req);
        }
    });

    return (
        <div class="min-h-screen flex flex-col items-center justify-center gap-6 p-8" style={{width: "100%"}}>
            <div class="w-full max-w-sm flex flex-col gap-5">
                <h2 class="text-lg font-semibold text-center">
                    Синхронизация{request() ? ` · ${request()!.providerName} → ${request()!.serviceName}` : ""}
                </h2>

                <Switch>
                    <Match when={status() === "running"}>
                        <div class="flex flex-col gap-4">
                            <div class="flex justify-center text-blue-500 text-2xl">
                                <FaSolidSpinner class="animate-spin"/>
                            </div>
                            <ProgressBar
                                stage={progress().stage}
                                current={progress().current}
                                total={progress().total}
                            />
                            <p class="text-xs text-gray-400 text-center">
                                Окно можно свернуть — синхронизация не прервётся. Не закрывайте его до завершения.
                            </p>
                        </div>
                    </Match>

                    <Match when={status() === "done"}>
                        <div class="flex flex-col items-center gap-3">
                            <FaSolidCircleCheck class="text-green-500 text-4xl"/>
                            <p class="text-center">Синхронизация завершена</p>
                            <div class="mt-2 flex gap-2">
                                <button
                                    class="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300 transition-colors"
                                    onClick={retry}
                                >
                                    Повторить
                                </button>
                                <button
                                    class="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
                                    onClick={() => window.close()}
                                >
                                    Закрыть
                                </button>
                            </div>
                        </div>
                    </Match>

                    <Match when={status() === "error"}>
                        <div class="flex flex-col items-center gap-3">
                            <FaSolidCircleXmark class="text-red-500 text-4xl"/>
                            <p class="text-center text-sm text-gray-600 break-words">{errorMsg()}</p>
                            <div class="mt-2 flex gap-2">
                                <button
                                    class="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
                                    onClick={retry}
                                >
                                    Повторить
                                </button>
                                <button
                                    class="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300 transition-colors"
                                    onClick={() => window.close()}
                                >
                                    Закрыть
                                </button>
                            </div>
                        </div>
                    </Match>
                </Switch>

                {/* Свёрнутый лог синхронизации: что именно происходило и что пропущено */}
                <Show when={logs().length > 0}>
                    <Collapsible title={`Лог (${logs().length})`} defaultOpen={false}>
                        <div class="max-h-48 overflow-y-auto flex flex-col gap-1 font-mono text-xs">
                            <For each={logs()}>
                                {(entry) => (
                                    <div
                                        class={
                                            entry.level === "error" ? "text-red-600"
                                                : entry.level === "warn" ? "text-amber-600"
                                                    : "text-gray-600"
                                        }
                                    >
                                        <span class="text-gray-400">{entry.time}</span> {entry.message}
                                    </div>
                                )}
                            </For>
                        </div>
                    </Collapsible>
                </Show>
            </div>
        </div>
    );
};
