/* Sebiston: сервис-воркер нужен, чтобы сайт ставился как приложение (без адресной строки).
   Страница всегда грузится из сети; копия — только если сети нет. Запросы к таблице не трогаем. */
const C = "sebiston-v1";
self.addEventListener("install", e => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(fetch(r).then(res => {
    if (res.ok && !/\.(mp4|webm)$/.test(u.pathname)) {
      const copy = res.clone(); caches.open(C).then(c => c.put(r, copy)).catch(() => {});
    }
    return res;
  }).catch(() => caches.match(r).then(m => m || caches.match("./"))));
});
