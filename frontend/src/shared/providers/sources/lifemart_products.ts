import {Product, ProviderAny, ProviderParams} from "../base";
import {getCookieByName, getMaxTransactions} from "@/shared/utils";
import {swFetch} from "@/shared/sw-fetch";
import {logItems} from "@/shared/providers/utils";


const PREFIX = "life_mart_";
// Домен для поиска куки: в окне синка активная вкладка — страница расширения.
const SITE_URL = "https://lifemart.ru";


async function getOrdersByParams(limit: number, offset: number) {
    const requestOptions: any = {
        method: "GET",
        headers: {
            "Authorization": await getCookieByName('auth', SITE_URL),
        },
        redirect: "follow"
    };
    const response = await swFetch(
        `https://api.lifemart.ru/api/orders/list?detailed=true&max_records=${limit}&offset=${offset}`,
        requestOptions,
    );
    return await response.json();
}

async function getOrdersByMaxLimit(maxLimit: number) {
    let rows: any[] = [];
    let page = 0;
     
    while (true) {
        const data = await getOrdersByParams(20, page * 20)
        const currentRows = data?.orders || [];
        rows = rows.concat(currentRows);
        if (rows.length > maxLimit || currentRows.length === 0) break;
        page++;
    }
    return rows.slice(0, maxLimit)
}

export const lifeMartProducts: ProviderAny = {
    getName: () => {
        return "Жизнь март"
    },
    getKind: () => 'shop' as const,

    getIcon: () => {
        return "lifemart.png"
    },
    getUrl: () => {
        return "https://lifemart.ru"
    },
    baseUrlLogo: () => {
        return "lifemart.ru"
    },
    getConfigKeys: () => ['general-max-transactions', 'user-name', 'accounts', 'date-start', 'date-end'],

    getProducts: async (params: ProviderParams): Promise<Product[]> => {
        const rows: Product[] = [];
        const maxLimit = getMaxTransactions(params.config['general-max-transactions']);
        const orders = await getOrdersByMaxLimit(maxLimit);
        for (const order of orders) {
            if (order?.status?.complete !== true) {
                continue;
            }
            for (const product of order?.products || []) {
                const id = (order?.id || "") + "_" + product?.id || "";
                rows.push({
                    uniform_id: id,
                    product_id: product?.id || "",
                    name: product?.name || "",
                    date: order?.delivery_time || order?.prepare_time || order?.create_time,
                    type: order?.type_id || "",
                    shop_location: order?.delivery_department_address || order?.delivery_department_name,
                    quantity: product?.quantity || 1,
                    shop_id: PREFIX + (order?.delivery_department_id || ""),
                    weight_uom_code: "шт",
                    image: product?.photo || "",
                    price_per_unit: product?.priceOverride || product?.price || 0,
                    price_per_quantity: (product?.priceOverride || product?.price || 0) * (product?.quantity || 1),
                    discounted_price_per_unit: product?.priceOverride || product?.price || 0,
                    discounted_price_per_quantity: (product?.priceOverride || product?.price || 0) * (product?.quantity || 1),
                    import_from: 'LifeMart',
                })
            }
        }
        logItems("Жизньмарт", "заказов разобрано", rows);
        return rows;
    },
}