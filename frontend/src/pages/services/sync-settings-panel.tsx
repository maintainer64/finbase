import {Component, createSignal, For, onMount, Show} from "solid-js";
import {ProviderAny, Account, ProviderParams} from "@/shared/providers/base";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {useSetting, useSettingsSnapshot} from "@/shared/settings";

function todayStr(): string {
    return new Date().toISOString().slice(0, 10);
}

function daysAgo(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
}

function monthStart(): string {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
}

function monthStartOffset(offset: number): string {
    const d = new Date();
    d.setMonth(d.getMonth() + offset);
    d.setDate(1);
    return d.toISOString().slice(0, 10);
}

const DATE_CHIPS = [
    {label: '7 дней', set: () => ({dateStart: daysAgo(7), dateEnd: todayStr()})},
    {label: '30 дней', set: () => ({dateStart: daysAgo(30), dateEnd: todayStr()})},
    {label: 'Текущий месяц', set: () => ({dateStart: monthStart(), dateEnd: todayStr()})},
    {label: '3 месяца', set: () => ({dateStart: monthStartOffset(-2), dateEnd: todayStr()})},
    {label: 'За всё время', set: () => ({dateStart: '1900-01-01', dateEnd: todayStr()})},
];

export const SyncSettingsPanel: Component<{
    provider: ProviderAny;
    selectedAccounts: string[];
    onSelectedAccountsChange: (ids: string[]) => void;
}> = (props) => {
    const [maxTransactions, setMaxTransactions] = useSetting('general-max-transactions');
    const [dateStart, setDateStart] = useSetting('date-start');
    const [dateEnd, setDateEnd] = useSetting('date-end');
    const settingsSnapshot = useSettingsSnapshot();

    const [accounts, setAccounts] = createSignal<Account[]>([]);
    const [accountsError, setAccountsError] = createSignal('');

    const setDates = (d: { dateStart: string; dateEnd: string }) => {
        setDateStart(d.dateStart);
        setDateEnd(d.dateEnd);
    };

    const toggleAccount = (id: string) => {
        const selected = props.selectedAccounts;
        props.onSelectedAccountsChange(
            selected.includes(id)
                ? selected.filter((a) => a !== id)
                : [...selected, id],
        );
    };


    const loadAccounts = async () => {
        if (!props.provider.getAccounts) return;
        setAccountsError('');
        try {
            const params: ProviderParams = {
                config: settingsSnapshot(props.provider.getConfigKeys?.()),
            };
            const [result] = await props.provider.getAccounts(params);
            setAccounts(result || []);
        } catch (e) {
            setAccountsError(e instanceof Error ? e.message : String(e));
        }
    };

    onMount(() => {
        loadAccounts();
    });

    return (
        <div class="space-y-4">
            <div>
                <Label for="sync-max-tx">Максимум операций</Label>
                <Input
                    id="sync-max-tx"
                    type="number"
                    value={maxTransactions()}
                    onChange={setMaxTransactions}
                />
            </div>

            <div>
                <Label>Период</Label>
                <div class="flex flex-wrap gap-2 mb-3">
                    <For each={DATE_CHIPS}>
                        {(chip) => (
                            <button
                                onClick={() => setDates(chip.set())}
                                class="px-3 py-1.5 text-xs font-medium rounded-full border transition-colors
                                       border-gray-300 text-gray-600 hover:border-blue-400 hover:text-blue-600
                                       bg-white"
                            >
                                {chip.label}
                            </button>
                        )}
                    </For>
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <Label for="sync-date-start">С</Label>
                        <Input
                            id="sync-date-start"
                            type="date"
                            value={dateStart()}
                            onChange={setDateStart}
                        />
                    </div>
                    <div>
                        <Label for="sync-date-end">По</Label>
                        <Input
                            id="sync-date-end"
                            type="date"
                            value={dateEnd()}
                            onChange={setDateEnd}
                        />
                    </div>
                </div>
            </div>

            <Show when={props.provider.getAccounts}>
                <div>
                    <Label>Счета</Label>
                    <Show when={accounts().length > 0}>
                        <div class="space-y-2 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3">
                            <For each={accounts()}>
                                {(account) => (
                                    <label class="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-2 py-1 rounded-sm">
                                        <input
                                            type="checkbox"
                                            checked={props.selectedAccounts.includes(account.institution_name)}
                                            onChange={() => toggleAccount(account.institution_name)}
                                            class="w-4 h-4 rounded-sm border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span class="text-sm text-gray-700 truncate">{account.name}</span>
                                    </label>
                                )}
                            </For>
                        </div>
                    </Show>
                    <Show when={accounts().length === 0 && !accountsError()}>
                        <p class="text-sm text-gray-400">Загрузка счетов…</p>
                    </Show>
                    <Show when={accountsError()}>
                        <p class="text-sm text-red-500">{accountsError()}</p>
                    </Show>
                </div>
            </Show>
        </div>
    );
};


