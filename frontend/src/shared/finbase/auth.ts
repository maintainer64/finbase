import PocketBase, {RecordModel} from "pocketbase";
import {finbaseTokenClaims, requireFinbaseToken} from "@/shared/finbase/token";

export interface FinbaseAuthResult {
    token: string;
    userId: string;
    displayName: string;
}

const normalizeUrl = (url: string): string => url.trim().replace(/\/+$/, "");

/** A 200 empty list is not proof of auth: PocketBase list rules filter guests. */
export const refreshFinbaseSession = async (url: string, token: string): Promise<FinbaseAuthResult> => {
    const pb = new PocketBase(normalizeUrl(url));
    pb.autoCancellation(false);
    const normalized = requireFinbaseToken(token);
    pb.authStore.save(normalized, null);
    const collection = finbaseTokenClaims(normalized)?.collectionId === "_pb_superusers_auth_" ? "_superusers" : "users";
    const result = await pb.collection(collection).authRefresh();
    return {token: requireFinbaseToken(result.token), userId: result.record.id, displayName: String(result.record.name || result.record.email || result.record.id)};
};

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
