import {Component, createEffect, createSignal, For, Show} from "solid-js";
import {ActiveTab, useActiveTabUrl} from "@/shared/hooks/useActiveTabUrl";
import {ServiceDetailsPage} from "@/pages/services/service-details-page";
import {ProviderAny, ProviderKind} from "@/shared/providers/base";
import {providersByKind} from "@/shared/providers/registry";

interface ServicesPageProps {
    /** Категория из верхней навигации: банки / инвестиции / магазины. */
    kind: ProviderKind;
}

export const ServicesPage: Component<ServicesPageProps> = (props) => {
    const activeTab: ActiveTab = useActiveTabUrl();
    const [serviceFound, setServiceFound] = createSignal<ProviderAny | undefined>(undefined);

    // Если открыта вкладка сервиса из ЭТОЙ категории — показываем его сразу.
    createEffect(() => {
        const currentUrl = activeTab.url() || "";
        setServiceFound(
            providersByKind(props.kind).find((service) => currentUrl.startsWith(service.getUrl())),
        );
    });

    return (
        <>
            <Show when={serviceFound()}>
                <ServiceDetailsPage provider={serviceFound()!}/>
            </Show>

            <Show when={!serviceFound()}>
                <div class="flex flex-col gap-2 p-4">
                    <For each={providersByKind(props.kind)}>
                        {(service) => (
                            <a
                                href={service.getUrl()}
                                class="flex items-center gap-3 p-3 hover:bg-gray-100 rounded-sm transition-colors"
                                target="_blank"
                            >
                                <span class="text-xl">
                                    <img
                                        width="18"
                                        height="18"
                                        src={`/services/${service.getIcon()}`}
                                        alt={service.getIcon()}
                                    />
                                </span>
                                <span>{service.getName()}</span>
                            </a>
                        )}
                    </For>
                    <Show when={providersByKind(props.kind).length === 0}>
                        <div class="text-sm text-gray-400 text-center py-4">
                            В этой категории пока нет сервисов
                        </div>
                    </Show>
                </div>
            </Show>
        </>
    );
}
