import type {AccountRecord} from "@/shared/finbase/models";

const providerPart = (providerCode: string): string => providerCode
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "finbase";

/** Стабильный внешний id для операции, созданной человеком в интерфейсе. */
export const manualTransactionExternalId = (
    account: Pick<AccountRecord, "provider_code"> | undefined,
    uuid: string = crypto.randomUUID(),
): string => `${providerPart(account?.provider_code ?? "")}_manual_${uuid}`;
