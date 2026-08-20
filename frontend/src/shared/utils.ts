export function downloadFile(filename: string, content: string | Blob | object, options: {
    type?: string;
    charset?: string;
    addBOM?: boolean;
} = {}) {
    const {
        type = 'application/octet-stream',
        charset = 'utf-8',
        addBOM = false
    } = options;

    try {
        let blobContent: BlobPart[] = [];
        let finalType = type;

        // Обрабатываем разные типы контента
        if (content instanceof Blob) {
            // Если уже Blob, используем как есть
            return downloadBlob(content, filename);
        } else if (typeof content === 'object') {
            // Если объект - преобразуем в JSON
            blobContent = [JSON.stringify(content, null, 2)];
            finalType = 'application/json; charset=utf-8';
        } else {
            // Если строка
            blobContent = [content];

            // Автоматически определяем тип по расширению файла
            if (!type || type === 'application/octet-stream') {
                finalType = getMimeType(filename);
            }

            // Добавляем BOM для CSV/Excel если нужно
            if (addBOM && (finalType.includes('csv') || filename.toLowerCase().endsWith('.csv'))) {
                blobContent.unshift('\uFEFF');
            }

            // Добавляем charset если не указан
            if (charset && !finalType.includes('charset')) {
                finalType = `${finalType}; charset=${charset}`;
            }
        }

        const blob = new Blob(blobContent, {type: finalType});
        downloadBlob(blob, filename);

    } catch (error) {
        console.error('Error downloading file:', error);
        throw error;
    }
}

// Вспомогательная функция для скачивания Blob
function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.getElementById('documentDownload') as HTMLAnchorElement;
    if (!link) return
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
}

// Определение MIME типа по расширению файла
function getMimeType(filename: string): string {
    const extension = filename.toLowerCase().split('.').pop();

    const mimeTypes: { [key: string]: string } = {
        'csv': 'text/csv',
        'json': 'application/json',
        'txt': 'text/plain',
        'html': 'text/html',
        'xml': 'application/xml',
        'pdf': 'application/pdf',
        'zip': 'application/zip',
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'gif': 'image/gif',
        'svg': 'image/svg+xml'
    };

    return mimeTypes[extension || ''] || 'application/octet-stream';
}

export async function getCookieByName(cookieName: string, url?: string) {
    // url задаётся явно провайдером (его BASE_URL). Это важно для синка в
    // отдельном окне: там активная вкладка — страница расширения, а не банк,
    // поэтому опираться на активную вкладку нельзя. Fallback на активную
    // вкладку оставлен для запуска из popup.
    let tabUrl = url;
    if (!tabUrl) {
        const tabs = await chrome.tabs.query({active: true, currentWindow: true});
        if (tabs.length == 0) {
            throw Error("No tabs found");
        }
        tabUrl = tabs[0].url;
    }

    if (!(tabUrl && (tabUrl.startsWith('http://') || tabUrl.startsWith('https://')))) {
        return ""
    }
    const cookie = await chrome.cookies.get({url: tabUrl, name: cookieName});
    if (!cookie) {
        return ""
    }
    return cookie.value
}

export function getMaxTransactions(param: string): number {
    try {
        return Math.max(1, parseInt(param))
    } catch (e) {
        return 1000
    }
}
