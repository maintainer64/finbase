// Подмена Origin для всех поддерживаемых сервисов
const DNR_RULES = [
  {id: 1, urlFilter: '*.sberbank.ru/*',      origin: 'https://online.sberbank.ru'},
  {id: 2, urlFilter: 'bank.yandex.ru/*',      origin: 'https://bank.yandex.ru'},
  {id: 3, urlFilter: 'lavka.yandex.ru/*',     origin: 'https://lavka.yandex.ru'},
  {id: 4, urlFilter: 'api.lifemart.ru/*',     origin: 'https://lifemart.ru'},
];

(async () => {
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: DNR_RULES.map(r => ({
        id: r.id,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [{header: 'origin', operation: 'set', value: r.origin}]
        },
        condition: {urlFilter: r.urlFilter}
      })),
      removeRuleIds: DNR_RULES.map(r => r.id),
    });
  } catch (e) {
    console.error('DNR setup failed:', e);
  }
})();

// Прокси для fetch-запросов из popup (обходит CORS)
chrome.runtime.onConnect.addListener((port) => {
  port.onMessage.addListener(async (request) => {
    if (request.type === 'FETCH') {
      try {
        const res = await fetch(request.url, request.options);
        const body = await res.text();
        port.postMessage({
          id: request.id,
          ok: res.ok,
          status: res.status,
          body,
          headers: Object.fromEntries(res.headers.entries()),
        });
      } catch (err) {
        port.postMessage({ id: request.id, ok: false, error: err.message });
      }
    }
  });
});
