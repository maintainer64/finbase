import {useSetting} from "@/shared/settings";
import {createMemo} from "solid-js";
import {FinbaseService} from "@/shared/providers/services/finbase/finbase-service";
import {ProviderSync} from "@/shared/providers/base";

export function useServices() {
    const [finbaseUrl] = useSetting('finbase-url');
    const [finbaseToken] = useSetting('finbase-token');

    const services = createMemo(() => {
        const services: ProviderSync[] = [];

        const finbaseUrlClean = finbaseUrl().replace(/\/+$/, '');

        if (finbaseUrl() !== '') {
            services.push(new FinbaseService(finbaseUrlClean, finbaseToken()));
        }

        return {services};
    });
    return services;
}
