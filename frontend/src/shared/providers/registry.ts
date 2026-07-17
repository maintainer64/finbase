import {ProviderAny, ProviderKind} from "@/shared/providers/base";
import {tBankTransactions} from "@/shared/providers/sources/tbank_transactions";
import {yandexBankTransactions} from "@/shared/providers/sources/yandex_bank_transactions";
import {lifeMartProducts} from "@/shared/providers/sources/lifemart_products";
import {yandexLavkaProducts} from "@/shared/providers/sources/yandex_lavka_products";
import {sberTransactions} from "@/shared/providers/sources/sber_transactions";

export const sourceProviders: ProviderAny[] = [
    tBankTransactions,
    yandexBankTransactions,
    sberTransactions,
    yandexLavkaProducts,
    lifeMartProducts,
];

export function findProviderByName(name: string): ProviderAny | undefined {
    return sourceProviders.find(p => p.getName() === name);
}

/** Категория провайдера; по умолчанию — банк. */
export function providerKind(provider: ProviderAny): ProviderKind {
    return provider.getKind?.() ?? 'bank';
}

export function providersByKind(kind: ProviderKind): ProviderAny[] {
    return sourceProviders.filter(p => providerKind(p) === kind);
}
