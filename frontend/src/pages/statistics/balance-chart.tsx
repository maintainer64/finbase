import {Component, createMemo} from "solid-js";
import {EChart, type ChartOption} from "./echart";
import {isDarkTheme} from "@/shared/theme";

export interface BalancePoint {
    time: string;
    value: number;
}

export interface BalanceSeries {
    id: string;
    label: string;
    color: string;
    points: BalancePoint[];
}

const formatter = new Intl.NumberFormat("ru-RU", {maximumFractionDigits: 0});
const money = (value: number) => `${formatter.format(value)} ₽`;

export const BalanceChart: Component<{series: BalanceSeries[]; area?: boolean}> = (props) => {
    const option = createMemo<ChartOption>(() => {
        const dark = isDarkTheme();
        const text = dark ? "#94a3b8" : "#64748b";
        const grid = dark ? "#1e293b" : "#edf2f7";
        const tooltipBackground = dark ? "rgba(2, 6, 23, .96)" : "rgba(255, 255, 255, .97)";
        const tooltipText = dark ? "#e2e8f0" : "#1e293b";
        return {
            animationDuration: 650,
            animationEasing: "cubicOut",
            color: props.series.map((item) => item.color),
            aria: {enabled: true, decal: {show: false}},
            grid: {left: 12, right: 18, top: props.series.length > 1 ? 48 : 18, bottom: 28, containLabel: true},
            legend: props.series.length > 1 ? {
                type: "scroll",
                top: 4,
                left: 8,
                right: 8,
                icon: "circle",
                itemWidth: 8,
                itemHeight: 8,
                itemGap: 18,
                textStyle: {color: text, fontSize: 11},
            } : {show: false},
            tooltip: {
                trigger: "axis",
                confine: true,
                backgroundColor: tooltipBackground,
                borderColor: dark ? "#334155" : "#dbe3ee",
                borderWidth: 1,
                padding: [10, 12],
                textStyle: {color: tooltipText, fontSize: 12},
                valueFormatter: (value: unknown) => money(Number(Array.isArray(value) ? value[value.length - 1] : value)),
                axisPointer: {type: "cross", lineStyle: {color: dark ? "#64748b" : "#94a3b8", type: "dashed"}},
            },
            xAxis: {
                type: "time",
                boundaryGap: false,
                axisLine: {show: false},
                axisTick: {show: false},
                axisLabel: {color: text, fontSize: 10, hideOverlap: true},
                splitLine: {show: false},
            },
            yAxis: {
                type: "value",
                scale: true,
                axisLine: {show: false},
                axisTick: {show: false},
                axisLabel: {color: text, fontSize: 10, formatter: (value: number) => formatter.format(value)},
                splitLine: {lineStyle: {color: grid, type: "dashed"}},
            },
            dataZoom: [{type: "inside", filterMode: "none", zoomOnMouseWheel: true, moveOnMouseMove: true, moveOnMouseWheel: false}],
            series: props.series.map((item, index) => ({
                id: item.id,
                name: item.label,
                type: "line",
                data: item.points.map((point) => [point.time, point.value]),
                smooth: 0.24,
                symbol: "circle",
                symbolSize: 6,
                showSymbol: false,
                sampling: "lttb",
                lineStyle: {width: props.area && index === 0 ? 3 : 2, color: item.color},
                itemStyle: {color: item.color, borderColor: dark ? "#0f172a" : "#ffffff", borderWidth: 2},
                emphasis: {focus: "series", lineStyle: {width: 3}},
                areaStyle: props.area && index === 0 ? {
                    opacity: 1,
                    color: {
                        type: "linear",
                        x: 0,
                        y: 0,
                        x2: 0,
                        y2: 1,
                        colorStops: [
                            {offset: 0, color: `${item.color}${dark ? "38" : "2d"}`},
                            {offset: 1, color: `${item.color}03`},
                        ],
                    },
                } : undefined,
            })),
        };
    });

    return <EChart option={option()} ariaLabel="Интерактивный график баланса"/>;
};
