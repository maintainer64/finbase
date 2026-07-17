import {Collapsible} from "@/components/ui/collapsible";
import {FinbaseAuthControls} from "./finbase-auth-controls";

export const FinbaseSettings = () => (
    <Collapsible title="Finbase и авторизация" defaultOpen={false}>
        <FinbaseAuthControls/>
        <p class="mt-3 text-xs leading-relaxed text-slate-400">
            OIDC настраивается на стороне PocketBase. Секрет клиента Authelia не передаётся расширению.
        </p>
    </Collapsible>
);
