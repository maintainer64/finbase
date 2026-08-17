import {Trade} from "@/shared/providers/base";
import {Trade as SureTrade, Transaction as SureTransaction} from "@/shared/providers/services/sure/sureClient/data-contracts";

export function parseFlexibleNumber(value: string | number | null | undefined): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        let cleaned = value.replace(/[^\d,.-]/g, '').trim();
        if (cleaned === '' || cleaned === '-') return 0;

        const hasDot = cleaned.includes('.');
        const hasComma = cleaned.includes(',');

        if (hasDot && hasComma) {
            const lastDot = cleaned.lastIndexOf('.');
            const lastComma = cleaned.lastIndexOf(',');
            if (lastComma > lastDot) {
                cleaned = cleaned.replace(/\./g, '').replace(',', '.');
            } else {
                cleaned = cleaned.replace(/,/g, '');
            }
        } else if (hasComma) {
            cleaned = cleaned.replace(',', '.');
        }

        const num = parseFloat(cleaned);
        return isNaN(num) ? 0 : Math.abs(num);
    }
    return 0;
}

function matchBase(
    item: { account?: { id?: string } | null; date: string; currency?: string | null; name?: string | null },
    date: string,
    type: string,
    accountId: string,
    currentCurrency?: string | null,
): boolean {
    if (item.account?.id !== accountId) return false;
    if (item.date.slice(0, 10) !== date) return false;
    if (item.currency && currentCurrency && item.currency !== currentCurrency) return false;
    const itemName = (item.name ?? "").toLowerCase();
    if (!itemName.includes(type)) return false;
    return true;
}

export function searchTrade(
    existTrades: SureTrade[],
    currentTrade: Trade,
    accountId: string,
): SureTrade | undefined {
    const date = currentTrade.date.slice(0, 10);
    const type = currentTrade.type.toLowerCase();
    const qty = parseFlexibleNumber(currentTrade.qty);
    const price = parseFlexibleNumber(currentTrade.price);
    const amount = parseFlexibleNumber(currentTrade.amount) || qty * price;

    return existTrades.find(trade => {
        if (!matchBase(trade, date, type, accountId, currentTrade.currency)) return false;

        // Матчим по qty+price
        if (type === 'buy' || type === 'sell') {
            const tradeQty = parseFlexibleNumber(trade.qty);
            const tradePrice = parseFlexibleNumber(trade.price);
            if ((Math.abs(tradeQty - qty) <= 0.0001) && (Math.abs(tradePrice - price) <= 0.0001)) return true;
        }
        const tradeAmount = parseFlexibleNumber(trade.amount);
        if (Math.abs(tradeAmount - amount) <= 0.0001) return true;
        return false;
    });
}

export function searchTransaction(
    existTransactions: SureTransaction[],
    currentTrade: Trade,
    accountId: string,
): SureTransaction | undefined {
    const date = currentTrade.date.slice(0, 10);
    const type = currentTrade.type.toLowerCase();
    const absAmount = Math.abs(parseFlexibleNumber(currentTrade.amount));

    return existTransactions.find(transaction => {
        if (!matchBase(transaction, date, type, accountId, currentTrade.currency)) return false;

        const transactionAmount = Math.abs(parseFlexibleNumber(transaction.amount));
        if (Math.abs(transactionAmount - absAmount) <= 0.0001) return true;
        return false;
    });
}
