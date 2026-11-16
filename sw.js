// Keeps a copy of the app's own files on the phone so it opens without internet.
// With signal it always checks GitHub for newer files first (3-second limit), so updates
// show up on the next open. Never caches GitHub API calls; your data is not stored here.
const CACHE = 'wt-v1.1.1';
const FILES = [
  './', 'index.html', 'styles.css', 'app.js', 'model.js', 'charts.js', 'backup.js', 'seed.js',
  'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('wt-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function fromNetwork(req) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), 3000);
    fetch(req, { cache: 'no-cache' }).then((res) => {
      clearTimeout(timer);
      if (!res.ok) return reject(new Error(`HTTP ${res.status}`));
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
      resolve(res);
    }, (err) => { clearTimeout(timer); reject(err); });
  });
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fromNetwork(e.request).catch(() => caches.match(e.request, { ignoreSearch: true })
      .then((hit) => hit || caches.match('index.html'))),
  );
});
