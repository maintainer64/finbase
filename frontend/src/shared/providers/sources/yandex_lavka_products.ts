import {Product, ProviderAny, ProviderParams} from "../base";
import {getMaxTransactions} from "@/shared/utils";
import {swFetch} from "@/shared/sw-fetch";
import {logItems} from "@/shared/providers/utils";


const PREFIX = "lavka_yandex_";


async function getOrdersByParams(count: number, lastOrderId?: string) {
    const requestOptions: any = {
        method: "GET",
        redirect: "follow",
        credentials: "include",
    };
    const queryParams = new URLSearchParams({count: count} as any);
    if (lastOrderId) {
        queryParams.append('lastOrderId', lastOrderId)
    }
    const query = queryParams.toString();
    const response = await swFetch(
        `https://lavka.yandex.ru/api/v1/orders/v1/history/list?${query}`,
        requestOptions,
    );
    return await response.json();
}

async function getOrdersByMaxLimit(maxLimit: number) {
    let lastOrderId = undefined;
    let rows: any[] = [];
     
    while (true) {
        const data = await getOrdersByParams(20, lastOrderId);
        rows = rows.concat(data?.data?.orders || []);
        lastOrderId = rows[rows.length - 1]?.deliveryInfo?.orderId
        if (!lastOrderId) break
        if (data?.data?.isEnd === true) break
        if (rows.length > maxLimit) break
    }
    return rows.slice(0, maxLimit);
}

function getAddress(legalEntities: any) {
    for (const entity of (legalEntities || [])) {
        if (entity?.type !== "restaurant") continue;
        for (const property of (entity?.additionalProperties || [])) {
            if (property.title !== "Адрес") continue;
            return property.value
        }
    }
}

export const yandexLavkaProducts: ProviderAny = {
    getName: () => {
        return "Яндекс Лавка"
    },
    getKind: () => 'shop' as const,

    getIcon: () => {
        return "yandex_lavka.png"
    },
    getUrl: () => {
        return "https://lavka.yandex.ru/history"
    },
    baseUrlLogo: () => {
        return "lavka.yandex.ru"
    },
    getConfigKeys: () => ['general-max-transactions', 'user-name', 'accounts', 'date-start', 'date-end'],

    getProducts: async (params: ProviderParams): Promise<Product[]> => {
        const rows: Product[] = [];
        const maxLimit = getMaxTransactions(params.config['general-max-transactions']);
        const orders = await getOrdersByMaxLimit(maxLimit);

        for (const order of orders) {
            if (order?.deliveryInfo?.isCanceled === true || order?.deliveryInfo?.isFailed === true) {
                continue;
            }
            if (order?.deliveryInfo?.status !== "closed") {
                continue;
            }
            for (const product of order?.positions || []) {
                const id = (order?.deliveryInfo?.orderId || order?.deliveryInfo?.cartId || order?.deliveryInfo?.shortOrderId || '') + "_" + product?.id || "";
                rows.push({
                    uniform_id: id,
                    product_id: product?.id || "",
                    name: product?.title || "",
                    date: order?.deliveryInfo?.closedAt || order?.deliveryInfo?.createdAt,
                    type: order?.trackedOrderInfo?.deliveryType || order?.trackedOrderInfo?.originalDeliveryType || "",
                    shop_location: order?.deliveryInfo?.address || order?.deliveryInfo?.destination?.shortAddress,
                    quantity: product?.quantity || 1,
                    shop_id: PREFIX + getAddress(order?.legalEntities),
                    weight_uom_code: "шт",
                    image: (product?.snippetImage?.url || "").replace("{w}", "500").replace("{h}", "500"),
                    price_per_unit: product?.price || 0,
                    price_per_quantity: (product?.price || 0) * (product?.count || 1),
                    discounted_price_per_unit: product?.fullPrice || product?.price || 0,
                    discounted_price_per_quantity: (product?.fullPrice || product?.price || 0) * (product?.count || 1),
                    import_from: 'LavkaYandex',
                });
            }
        }
        logItems("Яндекс Лавка", "заказов разобрано", rows);
        return rows;
    },
}