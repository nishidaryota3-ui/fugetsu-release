const CACHE_NAME = 'fugetsu-release-v123';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon.png',
  './omikuji-cat.png',
  './icon_top_input.png',
  './icon_top_output.png',
  './kiyose.png',
  './data/koyomi.json',
  './data/saijiki.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Network-First for HTML/JS/CSS (電波があれば常に最新を取得し、オフライン時はキャッシュ)
self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  
  if (url.endsWith('.html') || url.endsWith('.js') || url.endsWith('.css') || url.endsWith('/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 画像・データファイルなどはキャッシュ優先
  // 画像はバージョン番号（?v=）の有無に関わらず同じキャッシュを再利用する
  // （インストール時は「./icon.png」で保存されるため、クエリ付きの実際の
  //   リクエストと一致せずオフライン時に読み込めなくなる問題への対処）
  const isImage = /\.(png|jpe?g|svg|gif|webp|ico)(\?|$)/.test(url);
  const matchOptions = isImage ? { ignoreSearch: true } : undefined;

  event.respondWith(
    caches.match(event.request, matchOptions).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return response;
      }).catch(() => new Response('', { status: 504, statusText: 'Offline' }));
    })
  );
});
