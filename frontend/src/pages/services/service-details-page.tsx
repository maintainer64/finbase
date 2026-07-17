import {ProviderAny, ProviderParams} from "@/shared/providers/base";
import {Component, createSignal, For, Show} from "solid-js";
import {FaSolidFileWord, FaSolidRotate} from "solid-icons/fa";
import {downloadFile} from "@/shared/utils";
import {AsyncButton} from "@/components/ui/button";
import {useSetting, useSettingsSnapshot} from "@/shared/settings";
import {useServices} from "@/shared/hooks/useServices";
import {launchSyncWindow} from "@/shared/sync-launch";
import {SyncSettingsPanel} from "@/pages/services/sync-settings-panel";

interface ServiceDetailsPageProps {
    provider: ProviderAny;
}

export const ServiceDetailsPage: Component<ServiceDetailsPageProps> = (props) => {
    const p = () => props.provider;
    const services = useServices();
    const [fetchJsonProviderData] = useSetting('fetch-json-provider-data');
    const [selectedAccounts, setSelectedAccounts] = createSignal<string[]>([]);
    const settingsSnapshot = useSettingsSnapshot();

    const buildConfig = (): Record<string, string> => {
        const c: Record<string, string> = {};
        const allSettings = settingsSnapshot();
        for (const key of p().getConfigKeys?.() ?? []) {
            c[key] = key === 'accounts'
                ? selectedAccounts().join(',')
                : (allSettings[key] ?? '');
        }
        return c;
    };

    const buildParams = (): ProviderParams => ({
        config: buildConfig(),
    });

    const exportJson = async () => {
        const params = buildParams();
        const provider = p();
        const [accounts] = await provider.getAccounts?.(params) || [[], undefined];
        const [transactions] = await provider.getTransactions?.(params) || [[], undefined];
        downloadFile("debug.json", JSON.stringify({accounts, transactions}, null, 2));
    };

    return (
        <div class="flex flex-col gap-2 p-4">
            <h3 class="font-semibold text-lg mb-2 flex items-center gap-3 px-2">
                <span class="text-xl">
                    <img
                        width="18"
                        height="18"
                        src={`/services/${p().getIcon()}`}
                        alt={p().getIcon()}
                    />
                </span>
                <span>{p().getName()}</span>
            </h3>

            <Show when={p().getAccounts || p().getTransactions}>
                <SyncSettingsPanel
                    provider={p()}
                    selectedAccounts={selectedAccounts()}
                    onSelectedAccountsChange={setSelectedAccounts}
                />
            </Show>

            <hr class="my-1 border-gray-200"/>

            <Show when={(p().getTransactions || p().getAccounts) && fetchJsonProviderData()}>
                <AsyncButton
                    icon={<FaSolidFileWord/>}
                    label="Выгрузить в JSON"
                    loadingLabel="Экспорт..."
                    onClick={exportJson}
                    successMessage={`Счета и операции успешно выгружены в JSON`}
                    errorMessage={`Ошибка при выгрузке в JSON`}
                />
            </Show>

            <Show when={p().getAccounts || p().getTransactions}>
                <For each={services().services}>
                    {(service) => (
                        <AsyncButton
                            icon={<FaSolidRotate/>}
                            label={`Синхронизировать в ${service.getName()}`}
                            loadingLabel="Открываю окно..."
                            onClick={() => {
                                const cfg = buildConfig();
                                launchSyncWindow({
                                    providerName: p().getName(),
                                    serviceName: service.getName(),
                                    config: cfg,
                                });
                            }}
                            successMessage={`Открыто окно синхронизации с ${service.getName()}`}
                            errorMessage={`Не удалось открыть окно синхронизации`}
                        />
                    )}
                </For>
            </Show>
        </div>
    );
};
