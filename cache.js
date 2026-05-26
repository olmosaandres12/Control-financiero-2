// =============================================
// OLVISIÓN — Sistema de caché
// Muestra datos guardados al instante,
// actualiza en segundo plano desde Supabase
// =============================================

const OlvisionCache = {
  TTL: 5 * 60 * 1000, // 5 minutos

  set(clave, datos) {
    try {
      sessionStorage.setItem('cache_' + clave, JSON.stringify({
        datos,
        timestamp: Date.now()
      }));
    } catch(e) {}
  },

  get(clave) {
    try {
      const raw = sessionStorage.getItem('cache_' + clave);
      if (!raw) return null;
      const { datos, timestamp } = JSON.parse(raw);
      if (Date.now() - timestamp > this.TTL) return null;
      return datos;
    } catch(e) { return null; }
  },

  clear(clave) {
    try { sessionStorage.removeItem('cache_' + clave); } catch(e) {}
  },

  clearAll() {
    try {
      Object.keys(sessionStorage)
        .filter(k => k.startsWith('cache_'))
        .forEach(k => sessionStorage.removeItem(k));
    } catch(e) {}
  }
};
