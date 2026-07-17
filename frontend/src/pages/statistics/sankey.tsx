import {Component, createMemo} from "solid-js";
import {AccountRecord, CategoryRecord, FlowSplitRecord} from "@/shared/finbase/models";
import {EChart, escapeChartHtml, type ChartOption} from "./echart";
import {isDarkTheme} from "@/shared/theme";

const formatter = new Intl.NumberFormat("ru-RU", {maximumFractionDigits: 0});
const money = (value: number) => `${formatter.format(value)} ₽`;

type SankeyNode = {
    name: string;
    displayName: string;
    kind: "account" | "category";
    depth: number;
    itemStyle: {color: string};
};

type SankeyLink = {
    source: string;
    target: string;
    value: number;
    lineStyle: {color: string; opacity: number};
};

/** Потоки расходов «счёт → корневая категория» на едином движке ECharts. */
export const Sankey: Component<{
    accounts: AccountRecord[];
    categories: CategoryRecord[];
    splits: FlowSplitRecord[];
}> = (props) => {
    const flow = createMemo(() => {
        const categoryById = new Map(props.categories.map((item) => [item.id, item]));
        const parentById = new Map(props.categories.map((item) => [item.id, item.parent_category || ""]));
        const accountById = new Map(props.accounts.map((item) => [item.id, item]));
        const rootOf = (categoryId: string): string => {
            let current = categoryId;
            let guard = 0;
            while (parentById.get(current) && guard++ < 50) current = parentById.get(current)!;
            return current;
        };

        const amounts = new Map<string, number>();
        for (const split of props.splits) {
            if (!split.account || split.delta >= 0) continue;
            const category = split.category ? rootOf(split.category) : "without-category";
            const key = `${split.account}:${category}`;
            amounts.set(key, (amounts.get(key) ?? 0) - split.delta);
        }

        const accountIds = new Set<string>();
        const categoryIds = new Set<string>();
        const links: SankeyLink[] = [];
        for (const [key, value] of amounts) {
            const separator = key.indexOf(":");
            const accountId = key.slice(0, separator);
            const categoryId = key.slice(separator + 1);
            accountIds.add(accountId);
            categoryIds.add(categoryId);
            links.push({
                source: `account:${accountId}`,
                target: `category:${categoryId}`,
                value,
                lineStyle: {color: "gradient", opacity: 0.32},
            });
        }

        const nodes: SankeyNode[] = [
            ...[...accountIds].map((id, index) => ({
                name: `account:${id}`,
                displayName: accountById.get(id)?.name ?? id,
                kind: "account" as const,
                depth: 0,
                itemStyle: {color: ["#3b82f6", "#6366f1", "#06b6d4", "#8b5cf6"][index % 4]},
            })),
            ...[...categoryIds].map((id) => ({
                name: `category:${id}`,
                displayName: id === "without-category" ? "Без категории" : categoryById.get(id)?.name ?? id,
                kind: "category" as const,
                depth: 1,
                itemStyle: {color: categoryById.get(id)?.color || "#94a3b8"},
            })),
        ];
        return {nodes, links, rows: Math.max(accountIds.size, categoryIds.size)};
    });

    const option = createMemo<ChartOption>(() => {
        const dark = isDarkTheme();
        return {
            animationDuration: 700,
            animationEasing: "cubicOut",
            aria: {enabled: true, decal: {show: false}},
            tooltip: {
                trigger: "item",
                triggerOn: "mousemove",
                confine: true,
                backgroundColor: dark ? "rgba(2, 6, 23, .96)" : "rgba(255, 255, 255, .97)",
                borderColor: dark ? "#334155" : "#dbe3ee",
                textStyle: {color: dark ? "#e2e8f0" : "#1e293b"},
                formatter: (params: {dataType?: string; data?: SankeyNode | SankeyLink; value?: number}) => {
                    if (params.dataType === "edge") {
                        const link = params.data as SankeyLink;
                        const source = flow().nodes.find((node) => node.name === link.source)?.displayName ?? "";
                        const target = flow().nodes.find((node) => node.name === link.target)?.displayName ?? "";
                        return `<b>${escapeChartHtml(source)} → ${escapeChartHtml(target)}</b><br/>${money(link.value)}`;
                    }
                    const node = params.data as SankeyNode;
                    return `<b>${escapeChartHtml(node.displayName)}</b><br/>${money(Number(params.value ?? 0))}`;
                },
            },
            series: [{
                type: "sankey",
                left: 16,
                right: 24,
                top: 18,
                bottom: 18,
                nodeWidth: 16,
                nodeGap: 14,
                nodeAlign: "justify",
                layoutIterations: 48,
                draggable: false,
                data: flow().nodes,
                links: flow().links,
                label: {
                    color: dark ? "#cbd5e1" : "#475569",
                    fontSize: 11,
                    fontWeight: 600,
                    formatter: (params: {data?: SankeyNode}) => params.data?.displayName ?? "",
                },
                levels: [
                    {depth: 0, label: {position: "left", distance: 8}},
                    {depth: 1, label: {position: "right", distance: 8}},
                ],
                lineStyle: {curveness: 0.56, opacity: 0.28},
                itemStyle: {
                    borderWidth: 1,
                    borderColor: dark ? "rgba(255,255,255,.18)" : "rgba(255,255,255,.8)",
                    borderRadius: 4,
                },
                emphasis: {
                    focus: "adjacency",
                    lineStyle: {opacity: 0.72},
                },
            }],
        };
    });

    const height = createMemo(() => Math.max(300, Math.min(620, flow().rows * 38 + 56)));
    return (
        <div style={{height: `${height()}px`}}>
            <EChart option={option()} ariaLabel="Потоки расходов от счетов к категориям"/>
        </div>
    );
};
