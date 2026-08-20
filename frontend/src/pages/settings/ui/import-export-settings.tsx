import {Collapsible} from "@/components/ui/collapsible";
import {FaSolidDownload, FaSolidFileImport} from "solid-icons/fa";
import {downloadFile} from "@/shared/utils";
import {AsyncButton} from "@/components/ui/button";
import {EXPORTABLE_KEYS, SettingKey, useSetting} from "@/shared/settings";

export const ImportExportSettings = () => {
    // Список ключей статичен (из схемы SETTINGS), поэтому хуки в цикле безопасны.
    // Новая настройка в схеме автоматически попадает в импорт/экспорт.
    const stores = Object.fromEntries(
        EXPORTABLE_KEYS.map((key) => [key, useSetting(key)]),
    ) as Record<SettingKey, ReturnType<typeof useSetting>>;

    const importSettings = (event: Event) => {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) {
            throw "Нет выбранного файла";
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const settings = JSON.parse(e.target?.result as string);
                for (const key of EXPORTABLE_KEYS) {
                    if (settings[key] !== undefined) {
                        stores[key][1](settings[key]);
                    }
                }
            } catch (error) {
                console.error('Import error:', error);
                throw error
            }

            input.value = '';
        };
        reader.readAsText(file);
    };

    return (
        <Collapsible title="Импорт | Экспорт настроек" defaultOpen={false}>
            <div class="space-y-4">
                <div>
                    <AsyncButton
                        icon={<FaSolidDownload/>}
                        label="Сохранить настройки в JSON"
                        loadingLabel="Сохранение..."
                        onClick={() => {
                            const settings = Object.fromEntries(
                                EXPORTABLE_KEYS.map((key) => [key, stores[key][0]()]),
                            );
                            downloadFile(
                                "settings.json",
                                JSON.stringify(settings, null, 2)
                            );
                        }}
                        successMessage="Настройки успешно сохранены в JSON"
                        errorMessage="Ошибка при сохранение настроек в JSON"
                    />
                </div>
                <div>
                    <AsyncButton
                        icon={<FaSolidFileImport/>}
                        label="Импортирование настроек JSON"
                        loadingLabel="Импортирование..."
                        onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = '.json';
                            input.onchange = importSettings;
                            input.click();
                        }}
                        successMessage="Настройки успешно сохранены в JSON"
                        errorMessage="Ошибка при сохранение настроек в JSON"
                    />
                </div>
            </div>
        </Collapsible>
    );
};
