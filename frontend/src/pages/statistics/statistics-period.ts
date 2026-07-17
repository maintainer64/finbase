const DAY_MS = 86_400_000;

const dayKey = (date: Date): string => [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
].join("-");

export const STATISTICS_PERIODS: {key: string; label: string; range: () => {from: string; to: string}}[] = [
    {key: "30d", label: "30 дней", range: () => ({from: dayKey(new Date(Date.now() - 30 * DAY_MS)), to: dayKey(new Date())})},
    {key: "week", label: "Текущая неделя", range: () => {
        const now = new Date();
        const dayNum = (now.getDay() + 6) % 7;
        const monday = new Date(now);
        monday.setDate(now.getDate() - dayNum);
        return {from: dayKey(monday), to: dayKey(now)};
    }},
    {key: "month", label: "Текущий месяц", range: () => {
        const now = new Date();
        return {from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`, to: dayKey(now)};
    }},
    {key: "year", label: "Текущий год", range: () => {
        const now = new Date();
        return {from: `${now.getFullYear()}-01-01`, to: dayKey(now)};
    }},
    {key: "all", label: "Всё время", range: () => ({from: "", to: ""})},
];

export const statisticsRangeFromParams = (params: URLSearchParams): {period: string; from: string; to: string} => {
    const explicitPeriod = params.get("period") ?? "";
    const period = explicitPeriod || (!params.has("from") && !params.has("to") ? "year" : "");
    const presetRange = STATISTICS_PERIODS.find(item => item.key === period)?.range();
    return {
        period,
        from: params.has("from") ? params.get("from") ?? "" : presetRange?.from ?? "",
        to: params.has("to") ? params.get("to") ?? "" : presetRange?.to ?? "",
    };
};
