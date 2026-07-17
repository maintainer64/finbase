import {Collapsible} from "@/components/ui/collapsible";
import {Label} from "@/components/ui/label";
import {useSetting} from "@/shared/settings";
import {FaSolidBug} from "solid-icons/fa";

export const DeveloperSettings = () => {
    const [fetchJsonProviderData, setFetchJsonProviderData] = useSetting('fetch-json-provider-data');

    return (
        <Collapsible title="Для разработчика">
            <div class="space-y-4">
                <div>
                    <div class="flex items-center gap-3 mb-1">
                        <input
                            id="fetch-json-provider-data"
                            type="checkbox"
                            checked={fetchJsonProviderData()}
                            onChange={(e) => setFetchJsonProviderData(e.currentTarget.checked)}
                            class="w-4 h-4 rounded-sm border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <Label for="fetch-json-provider-data" class="flex items-center gap-2 cursor-pointer">
                            <FaSolidBug class="text-gray-500"/>
                            Получать JSON-данные провайдера
                        </Label>
                    </div>
                </div>
            </div>
        </Collapsible>
    );
};