const CACHE_NAME = 'olvision-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/caja.html',
  '/cheques.html',
  '/gastos.html',
  '/sueldos.html',
  '/saldos.html',
  '/ajustes.html',
  '/configuracion.html',
  '/importar.html',
  '/app.css',
  '/estetica.css',
  '/cache.js',
  '/config.js',
  '/utils.js',
  '/exportar.js',
  '/caja_pdf.js',
  '/logo_app.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
});