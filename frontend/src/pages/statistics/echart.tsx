import {Component, createEffect, onCleanup, onMount} from "solid-js";
import {init, use, type EChartsCoreOption, type EChartsType, type ECElementEvent} from "echarts/core";
import {LineChart, PieChart, SankeyChart} from "echarts/charts";
import {
    AriaComponent,
    AxisPointerComponent,
    DataZoomComponent,
    GraphicComponent,
    GridComponent,
    LegendComponent,
    TooltipComponent,
} from "echarts/components";
import {CanvasRenderer} from "echarts/renderers";

use([
    LineChart,
    PieChart,
    SankeyChart,
    GridComponent,
    TooltipComponent,
    LegendComponent,
    DataZoomComponent,
    GraphicComponent,
    AxisPointerComponent,
    AriaComponent,
    CanvasRenderer,
]);

export type ChartOption = EChartsCoreOption;

export const escapeChartHtml = (value: unknown): string => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

/** Один реактивный Solid-враппер для всех диаграмм Finbase. */
export const EChart: Component<{
    option: ChartOption;
    class?: string;
    ariaLabel: string;
    onClick?: (event: ECElementEvent) => void;
}> = (props) => {
    let container!: HTMLDivElement;
    let chart: EChartsType | undefined;

    onMount(() => {
        chart = init(container, undefined, {renderer: "canvas"});
        if (props.onClick) chart.on("click", props.onClick);
        const observer = new ResizeObserver(() => chart?.resize());
        observer.observe(container);
        onCleanup(() => {
            observer.disconnect();
            chart?.dispose();
        });
    });

    createEffect(() => {
        const option = props.option;
        chart?.setOption(option, {notMerge: true, lazyUpdate: true});
    });

    return <div ref={(element) => { container = element; }} class={`h-full w-full ${props.class ?? ""}`} role="img" aria-label={props.ariaLabel}/>;
};
