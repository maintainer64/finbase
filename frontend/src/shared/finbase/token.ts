const VISIBLE_ASCII = /^[\x21-\x7e]+$/;

/**
 * PocketBase выдаёт JWT из ASCII-символов. Заголовки Fetch принимают только
 * байтовые значения, поэтому случайно вставленный русский текст нужно поймать
 * до вызова fetch и объяснить пользователю, как восстановить сеанс.
 */
export const normalizeFinbaseToken = (value: string): string =>
    value.trim().replace(/^Bearer\s+/i, "").trim();

export const getFinbaseTokenError = (value: string): string | null => {
    const token = normalizeFinbaseToken(value);
    if (!token) return "Finbase: нет активного сеанса. Войдите через OIDC в настройках.";
    if (!VISIBLE_ASCII.test(token)) {
        return "Finbase: токен содержит недопустимые символы. Очистите ручной токен и войдите через OIDC заново.";
    }
    return null;
};

export const requireFinbaseToken = (value: string): string => {
    const error = getFinbaseTokenError(value);
    if (error) throw new Error(error);
    return normalizeFinbaseToken(value);
};
