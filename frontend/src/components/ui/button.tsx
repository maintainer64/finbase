import {Component, createSignal, JSX, Show} from 'solid-js';
import {toast} from 'solid-toast';
import {FaSolidSpinner} from "solid-icons/fa";

interface AsyncButtonProps {
    onClick: () => void | Promise<void>;
    icon: JSX.Element;
    label: string;
    loadingLabel?: string;
    class?: string;
    disabled?: boolean;
    successMessage?: string;
    errorMessage?: string;
}

export const AsyncButton: Component<AsyncButtonProps> = (props) => {
    const [isLoading, setIsLoading] = createSignal(false);

    const handleClick = async () => {
        if (isLoading()) return;

        setIsLoading(true);
        try {
            await props.onClick();
            if (props.successMessage) {
                toast.success(props.successMessage);
            }
        } catch (error) {
            console.error(error);
            const errorMsg = props.errorMessage || 'Произошла ошибка';
            toast.error(`${errorMsg}: ${error?.toString()}`);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <button
            class={`flex items-center gap-3 p-3 hover:bg-gray-100 rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${props.class || ''}`}
            disabled={isLoading() || props.disabled}
            onClick={handleClick}
        >
            <span>
                <Show when={!isLoading()} fallback={<FaSolidSpinner class="animate-spin"/>}>
                    {props.icon}
                </Show>
            </span>
            <span>
                <Show when={!isLoading()} fallback={props.loadingLabel || 'Загрузка...'}>
                    {props.label}
                </Show>
            </span>
        </button>
    );
};
