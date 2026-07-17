import PocketBase, {RecordModel} from "pocketbase";
import {requireFinbaseToken} from "@/shared/finbase/token";

export interface FinbaseAuthResult {
    token: string;
    userId: string;
    displayName: string;
}

const normalizeUrl = (url: string): string => url.trim().replace(/\/+$/, "");

export const loginWithFinbaseOIDC = async (url: string): Promise<FinbaseAuthResult> => {
    const baseUrl = normalizeUrl(url);
    if (!baseUrl) throw new Error("Сначала укажите адрес PocketBase");

    const pb = new PocketBase(baseUrl);
    pb.autoCancellation(false);
    const result = await pb.collection("users").authWithOAuth2({provider: "oidc"});
    const record = result.record as RecordModel;
    const name = String(record.name || record.email || record.id);
    return {token: requireFinbaseToken(result.token), userId: record.id, displayName: name};
};
