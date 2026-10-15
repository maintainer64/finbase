const VISIBLE_ASCII = /^[\x21-\x7e]+$/;

/**
 * PocketBase выдаёт JWT из ASCII-символов. Заголовки Fetch принимают только
 * байтовые значения, поэтому случайно вставленный русский текст нужно поймать
 * до вызова fetch и объяснить пользователю, как восстановить сеанс.
 */
export const normalizeFinbaseToken = (value: string): string =>
    value.trim().replace(/^Bearer\s+/i, "").trim();

export const finbaseTokenClaims = (value: string): {exp?: number; collectionId?: string} | null => {
    try {
        const payload = normalizeFinbaseToken(value).split(".")[1];
        const decoded: unknown = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
        return decoded && typeof decoded === "object" ? decoded : null;
    } catch {
        return null;
    }
};

export const getFinbaseTokenError = (value: string): string | null => {
    const token = normalizeFinbaseToken(value);
    if (!token) return "Finbase: нет активного сеанса. Войдите через OIDC в настройках.";
    if (!VISIBLE_ASCII.test(token)) {
        return "Finbase: токен содержит недопустимые символы. Очистите ручной токен и войдите через OIDC заново.";
    }
    const expiry = finbaseTokenClaims(token)?.exp;
    if (typeof expiry === "number" && expiry * 1000 <= Date.now()) {
        return "Finbase: срок сеанса истёк. Войдите заново в настройках; данные на сервере не удалены.";
    }
    return null;
};

export const requireFinbaseToken = (value: string): string => {
    const error = getFinbaseTokenError(value);
    if (error) throw new Error(error);
    return normalizeFinbaseToken(value);
};
