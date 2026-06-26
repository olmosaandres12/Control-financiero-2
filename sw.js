// ─────────────────────────────────────────────────────────────
// sw.js — Olvisión
// Service worker DESACTIVADO a propósito.
//
// Antes guardaba copias de las páginas para funcionar sin internet,
// pero eso dejaba copias rotas pegadas en el navegador (la pantalla
// "ERR_FAILED" / "No se puede acceder a este sitio web").
//
// Esta versión NO intercepta nada: limpia las copias viejas y se
// desregistra sola. La app va siempre directo a internet.
// ─────────────────────────────────────────────────────────────

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Borrar todas las copias (cachés) viejas
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    // Apagar y desregistrar este service worker
    await self.registration.unregister();
  })());
});

// (No hay handler de 'fetch' a propósito: el navegador va directo a
//  la red y no se intercepta ninguna página.)
