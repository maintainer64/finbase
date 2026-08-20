import {Component, Show} from "solid-js";

interface ProgressBarProps {
    stage: string;
    current?: number;
    total?: number;
}

export const ProgressBar: Component<ProgressBarProps> = (props) => {
    const hasCounter = () => typeof props.total === "number" && props.total > 0;
    const percent = () =>
        hasCounter() ? Math.min(100, Math.round(((props.current ?? 0) / props.total!) * 100)) : 0;

    return (
        <div class="w-full">
            <div class="flex items-center justify-between mb-2 text-sm">
                <span class="text-gray-700">{props.stage}</span>
                <Show when={hasCounter()}>
                    <span class="text-gray-500 tabular-nums">
                        {props.current ?? 0} / {props.total}
                    </span>
                </Show>
            </div>
            <div class="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <Show
                    when={hasCounter()}
                    fallback={
                        <div class="h-full w-1/3 bg-blue-500 rounded-full animate-pulse"/>
                    }
                >
                    <div
                        class="h-full bg-blue-500 rounded-full transition-all duration-200"
                        style={{width: `${percent()}%`}}
                    />
                </Show>
            </div>
        </div>
    );
};
