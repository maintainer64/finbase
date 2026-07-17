import {Collapsible} from "@/components/ui/collapsible";
import {Label} from "@/components/ui/label";
import {Input} from "@/components/ui/input";
import {useSetting} from "@/shared/settings";
import {AsyncButton} from "@/components/ui/button";
import {FaSolidRocket} from "solid-icons/fa";
import {navigateTo} from "@/shared/routing";

export const GeneralSettings = () => {
    const [max, setMax] = useSetting('general-max-transactions');
    const [userName, setUserName] = useSetting('user-name');

    return (
        <Collapsible title="Общие настройки" defaultOpen={false}>
            <div class="space-y-4">
                <div>
                    <Label for="general-max-transactions">
                        Максимальное количество выгружаемых операций
                    </Label>
                    <Input
                        id="general-max-transactions"
                        type="text"
                        placeholder="Введите число"
                        value={max()}
                        onChange={setMax}
                    />
                </div>
                <div>
                    <Label for="general-user-name">
                        Имя пользователя
                    </Label>
                    <Input
                        id="general-user-name"
                        placeholder="Например: Иван"
                        value={userName()}
                        onChange={setUserName}
                    />
                    <p class="text-sm text-gray-400 mt-1">
                        Будет добавлено к названиям счетов при синхронизации, чтобы сразу было понятно, чей это счёт.
                    </p>
                </div>
                <div>
                    <AsyncButton
                        icon={<FaSolidRocket/>}
                        label="Настроить заново"
                        onClick={() => {
                            localStorage.removeItem('onboarding-completed');
                            navigateTo('onboarding');
                        }}
                    />
                </div>
            </div>
        </Collapsible>
    );
};
