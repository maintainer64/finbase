const formatters = new Map<string, Intl.NumberFormat>();

export const formatMoney = (value: number, currency = "RUB"): string => {
    const code = (currency || "RUB").trim().toUpperCase();
    let formatter = formatters.get(code);
    if (!formatter) {
        try {
            formatter = new Intl.NumberFormat("ru-RU", {
                style: "currency",
                currency: code,
                maximumFractionDigits: 0,
            });
        } catch {
            return `${new Intl.NumberFormat("ru-RU", {maximumFractionDigits: 0}).format(value)} ${code}`;
        }
        formatters.set(code, formatter);
    }
    return formatter.format(value);
};
