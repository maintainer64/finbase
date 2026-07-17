import {Component, createSignal, For, Show} from "solid-js";
import {useSetting} from "@/shared/settings";
import {navigateTo} from "@/shared/routing";
import {currentWidth} from "@/shared/width";
import {Label} from "@/components/ui/label";
import {Input} from "@/components/ui/input";
import {FinbaseAuthControls} from "@/pages/settings/ui/finbase-auth-controls";

const STEPS = [
    {title: "Подключение Finbase", description: "Укажите адрес PocketBase и войдите через Authelia"},
    {title: "Имя пользователя", description: "Будет добавлено к названиям счетов при синхронизации (необязательно)"},
    {title: "Лимит операций", description: "Максимальное количество выгружаемых операций"},
];

export const OnboardingPage: Component = () => {
    const [step, setStep] = createSignal(0);
    const [maxTransactions, setMaxTransactions] = useSetting('general-max-transactions');
    const [userName, setUserName] = useSetting('user-name');
    const [, setCompleted] = useSetting('onboarding-completed');

    const isLast = () => step() === STEPS.length - 1;

    const next = () => {
        if (isLast()) {
            setCompleted(true);
            navigateTo('banks');
        } else {
            setStep(s => s + 1);
        }
    };

    const skip = () => {
        if (isLast()) {
            setCompleted(true);
            navigateTo('banks');
        } else {
            setStep(s => s + 1);
        }
    };

    return (
        <div class="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4"
             style={{width: currentWidth()}}>
            <div class="w-full max-w-lg">
                {/* Progress bar */}
                <div class="flex items-center justify-between mb-8">
                    <For each={STEPS}>
                        {(_, i) => (
                            <div class="flex items-center flex-1">
                                <div class={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                    i() <= step() ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
                                }`}>
                                    {i() + 1}
                                </div>
                                {i() < STEPS.length - 1 && (
                                    <div class={`flex-1 h-1 mx-2 rounded ${
                                        i() < step() ? 'bg-blue-600' : 'bg-gray-200'
                                    }`}/>
                                )}
                            </div>
                        )}
                    </For>
                </div>

                {/* Card */}
                <div class="bg-white rounded-2xl shadow-xl p-8">
                    <h2 class="text-2xl font-bold text-gray-900 mb-2">{STEPS[step()].title}</h2>
                    <p class="text-gray-500 mb-8">{STEPS[step()].description}</p>

                    {/* Step 1: Finbase settings */}
                    <Show when={step() === 0}>
                        <div>
                            <FinbaseAuthControls/>
                            <p class="text-sm text-gray-400">Можно пропустить и настроить позже в настройках.</p>
                        </div>
                    </Show>

                    {/* Step 2: Username */}
                    <Show when={step() === 1}>
                        <div class="space-y-4">
                            <div>
                                <Label for="onb-user-name">Имя пользователя</Label>
                                <Input
                                    id="onb-user-name"
                                    placeholder="Например: Иван"
                                    value={userName()}
                                    onChange={setUserName}
                                />
                            </div>
                            <p class="text-sm text-gray-400">
                                Это имя будет добавлено к названиям счетов при синхронизации, 
                                чтобы сразу было понятно, чей это счёт. Можно пропустить.
                            </p>
                        </div>
                    </Show>

                    {/* Step 3: Max transactions */}
                    <Show when={step() === 2}>
                        <div class="space-y-4">
                            <div>
                                <Label for="onb-max-ops">Максимальное количество операций</Label>
                                <Input
                                    id="onb-max-ops"
                                    placeholder="1000"
                                    value={maxTransactions()}
                                    onChange={setMaxTransactions}
                                />
                            </div>
                        </div>
                    </Show>

                    {/* Navigation buttons */}
                    <div class="flex justify-between mt-8 pt-6 border-t border-gray-100">
                        <button
                            onClick={() => setStep(s => Math.max(0, s - 1))}
                            class={`px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors ${
                                step() === 0 ? 'invisible' : ''
                            }`}
                        >
                            Назад
                        </button>
                        <div class="flex gap-3">
                            <button
                                onClick={skip}
                                class="px-4 py-2 text-gray-500 hover:text-gray-700 transition-colors"
                            >
                                {isLast() ? 'Завершить' : 'Пропустить'}
                            </button>
                            <button
                                onClick={next}
                                class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                            >
                                {isLast() ? 'Завершить настройку' : 'Далее'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
