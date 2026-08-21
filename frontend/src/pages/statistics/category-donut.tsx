import {Component, createMemo} from "solid-js";
import {EChart, escapeChartHtml, type ChartOption} from "./echart";
import {isDarkTheme} from "@/shared/theme";

export interface DonutItem {
    id: string;
    name: string;
    color: string;
    value: number;
}

const formatter = new Intl.NumberFormat("ru-RU", {maximumFractionDigits: 0});
const money = (value: number) => `${formatter.format(value)} ₽`;

export const CategoryDonut: Component<{
    title: string;
    items: DonutItem[];
    onSelect: (id: string) => void;
}> = (props) => {
    const option = createMemo<ChartOption>(() => {
        const dark = isDarkTheme();
        const total = props.items.reduce((sum, item) => sum + Math.abs(item.value), 0);
        return {
            animationDuration: 750,
            animationEasing: "cubicOut",
            aria: {enabled: true, decal: {show: false}},
            tooltip: {
                trigger: "item",
                confine: true,
                backgroundColor: dark ? "rgba(2, 6, 23, .96)" : "rgba(255, 255, 255, .97)",
                borderColor: dark ? "#334155" : "#dbe3ee",
                textStyle: {color: dark ? "#e2e8f0" : "#1e293b"},
                formatter: (params: {name?: string; value?: number; percent?: number}) =>
                    `<b>${escapeChartHtml(params.name)}</b><br/>${money(Number(params.value ?? 0))} · ${params.percent ?? 0}%`,
            },
            graphic: [{
                type: "group",
                left: "center",
                top: "center",
                children: [
                    {type: "text", style: {text: props.title, x: 0, y: -12, textAlign: "center", fill: dark ? "#94a3b8" : "#64748b", font: "500 11px Inter, sans-serif"}},
                    {type: "text", style: {text: money(total), x: 0, y: 9, textAlign: "center", fill: dark ? "#f8fafc" : "#0f172a", font: "700 15px Inter, sans-serif"}},
                ],
            }],
            series: [{
                type: "pie",
                radius: ["55%", "82%"],
                center: ["50%", "50%"],
                startAngle: 112,
                minAngle: 2,
                padAngle: 3,
                avoidLabelOverlap: true,
                itemStyle: {
                    borderRadius: 9,
                    borderColor: dark ? "#0f172a" : "#ffffff",
                    borderWidth: 3,
                },
                label: {show: false},
                labelLine: {show: false},
                emphasis: {scale: true, scaleSize: 9, itemStyle: {shadowBlur: 22, shadowColor: "rgba(15, 23, 42, .2)"}},
                data: props.items.map((item) => ({
                    id: item.id,
                    name: item.name,
                    value: Math.abs(item.value),
                    itemStyle: {color: item.color},
                })),
            }],
        };
    });

    return (
        <EChart
            option={option()}
            ariaLabel={`${props.title} по категориям`}
            onClick={(event) => {
                const id = (event.data as {id?: string} | undefined)?.id;
                if (id) props.onSelect(id);
            }}
        />
    );
};
