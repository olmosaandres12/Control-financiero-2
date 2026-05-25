// ─────────────────────────────────────────────────────────────────────────────
// config.js — Credenciales, autenticación y control de acceso
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL     = 'https://svmhzocelhkmfeetczzw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2bWh6b2NlbGhrbWZlZXRjenp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNjcyNjcsImV4cCI6MjA5MDY0MzI2N30.rJpRBbXcdGxQHN4jhlgXJ_ptQDGGSOdnwcOaAFI9udM';

// ── PINs de acceso ────────────────────────────────────────────────────────────
const PIN_ADMIN  = '0325';   // Andres — acceso completo
const PIN_VIEWER = '1111';   // Luis   — solo lectura (podés cambiar este número)

// ─────────────────────────────────────────────────────────────────────────────
// CAPA 1 — Helpers de autenticación
// ─────────────────────────────────────────────────────────────────────────────

function checkAuth() {
  if (!sessionStorage.getItem('userRole')) {
    window.location.replace('index.html');
  }
}

function getRole()  { return sessionStorage.getItem('userRole') || null; }
function isAdmin()  { return getRole() === 'admin'; }
function isViewer() { return getRole() === 'viewer'; }

function logout() {
  sessionStorage.clear();
  window.location.replace('index.html');
}

// Sobrescribe salir() globalmente para que todas las páginas limpien bien
function salir() {
  sessionStorage.clear();
  window.location.replace('index.html');
}

// ─────────────────────────────────────────────────────────────────────────────
// CAPA 2 — Cliente Supabase con bloqueo de escrituras para viewer
// El Proxy intercepta CUALQUIER intento de insert/update/delete/upsert
// sin importar qué pase en la UI.
// ─────────────────────────────────────────────────────────────────────────────

;(function initSupabase() {
  const _module = window.supabase;            // módulo CDN original (tiene createClient)
  const { createClient } = _module;

  // Respuesta bloqueada que imita la forma de Supabase para no romper el código
  function blocked() {
    console.warn('[Olvisión] ⛔ Operación bloqueada: modo solo lectura.');
    const result = { data: null, error: { message: 'Modo solo lectura: operación bloqueada.' } };
    const p = Promise.resolve(result);
    p.select  = () => p;
    p.eq      = () => p;
    p.neq     = () => p;
    p.single  = () => p;
    p.order   = () => p;
    p.limit   = () => p;
    p.match   = () => p;
    return p;
  }

  const WRITE_METHODS = ['insert', 'update', 'delete', 'upsert'];

  // Envuelve un cliente para interceptar escrituras en modo viewer
  function protectedClient(client) {
    return new Proxy(client, {
      get(target, prop) {
        if (prop === 'from') {
          return function(table) {
            const qb = target.from(table);
            if (!isViewer()) return qb;   // admin: acceso total
            return new Proxy(qb, {
              get(t, p) {
                if (WRITE_METHODS.includes(String(p))) return blocked;
                const v = t[p];
                return typeof v === 'function' ? v.bind(t) : v;
              }
            });
          };
        }
        const val = target[prop];
        return typeof val === 'function' ? val.bind(target) : val;
      }
    });
  }

  // Reemplaza window.supabase preservando createClient del módulo CDN
  // Así el código de cada página que hace: const { createClient } = supabase
  // recibe una versión que devuelve clientes protegidos
  window.supabase = new Proxy(_module, {
    get(target, prop) {
      if (prop === 'createClient') {
        return function(url, key) {
          return protectedClient(createClient(url, key));
        };
      }
      const val = target[prop];
      return typeof val === 'function' ? val.bind(target) : val;
    }
  });
})();

// ─────────────────────────────────────────────────────────────────────────────
// CAPA 3 — Bloqueo de UI para viewer (DOM + MutationObserver)
// ─────────────────────────────────────────────────────────────────────────────

// Palabras clave que identifican botones SEGUROS (nunca bloquear)
const _SAFE_KW = [
  'historial','hoy','ver','detalle','mostrar','ocultar','expandir','colapsar',
  'pendientes','pagados','agenda','ventas','egresos','arqueo','comisiones',
  'sueldos','histórico','resumen','inicio','caja','gastos','cheques','saldos',
  'dashboard','mes','año','anterior','siguiente'
];

// Palabras clave que identifican botones de acción (a ocultar)
const _ACTION_KW = [
  'guardar','agregar','nuevo','nueva','añadir','nueva operación','nueva op',
  'eliminar','borrar','pagar','cerrar caja','registrar','confirmar',
  'actualizar','editar','marcar cobrado','marcar como cobrado','cobrado',
  'cobrar','cargar cheque','cargar','crear','completar','configurar',
  'saldar','registrar pago','pago','abrir caja','cerrar','generar cierre',
  'importar','exportar'
];

// Íconos/emojis que identifican botones de acción
const _ACTION_ICONS = ['✏️','🗑️','✏','🗑','💾','⚙️','⚙','📝','➕','✅'];

function _looksLikeAction(btn) {
  const txt = (btn.textContent || btn.value || btn.title || btn.ariaLabel || '').toLowerCase().trim();
  // Las palabras de ACCIÓN siempre ganan — aunque haya una palabra segura en el texto
  if (_ACTION_KW.some(k => txt.includes(k))) return true;
  if (btn.type === 'submit') return true;
  // Solo si NO hay acción, verificar si es seguro
  if (_SAFE_KW.some(k => txt.includes(k))) return false;
  if (_ACTION_ICONS.some(ic => (btn.textContent || '').includes(ic))) return true;
  return false;
}

function _isNavElement(el) {
  // Elementos de navegación que deben mantenerse operativos
  if (el.closest('nav, .bottom-nav, .sidebar, .nav-item, .nav-link, .nav-tabs')) return true;
  // Botones de tab (cambiar vista)
  if (el.dataset && el.dataset.tab !== undefined) return true;
  if (el.closest('.tabs, .tab-nav, .tab-bar, .tab-buttons, [role="tablist"], .main-tabs, .sub-tabs')) return true;
  if (el.classList && (
    el.classList.contains('tab-btn')  ||
    el.classList.contains('tab-link') ||
    el.classList.contains('main-tab') ||
    el.classList.contains('sub-tab')  ||
    el.classList.contains('mes-btn')
  )) return true;
  // Flechas de navegación de mes (◀ ▶ < > etc.)
  const txt = (el.textContent || '').trim();
  if (/^[◀▶←→‹›«»<>]$/.test(txt)) return true;
  return false;
}

// Inyecta los estilos del viewer mode sin tocar app.css
function _injectViewerStyles() {
  if (document.getElementById('viewer-styles')) return;
  const s = document.createElement('style');
  s.id = 'viewer-styles';
  s.textContent = `
    /* ── Banner modo lectura ── */
    #viewer-banner {
      position: fixed;
      top: 0; left: 0; right: 0;
      z-index: 99999;
      background: #f9f4ab;
      color: #1E3A8A;
      font-family: 'Nunito', sans-serif;
      font-size: 13px;
      font-weight: 700;
      text-align: center;
      padding: 7px 16px;
      border-bottom: 2px solid #1E3A8A;
      letter-spacing: 0.2px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    #viewer-banner .vb-dot {
      width: 8px; height: 8px;
      background: #1E3A8A;
      border-radius: 50%;
      display: inline-block;
    }

    /* Espacio para que el banner no tape el contenido */
    body.viewer-mode { padding-top: 36px !important; }
    body.viewer-mode .nav { top: 36px !important; }
    body.viewer-mode .main { padding-top: 16px; }
    @media (min-width: 769px) {
      body.viewer-mode .sidebar { top: 36px !important; }
      body.viewer-mode .main-content { margin-top: 36px; }
    }

    /* Ocultar formularios de alta / acción */
    body.viewer-mode form:not(.viewer-ok),
    body.viewer-mode .modal-overlay:not(.viewer-ok),
    body.viewer-mode .modal:not(.viewer-ok),
    body.viewer-mode [class*="form-nueva"],
    body.viewer-mode [class*="nueva-op"],
    body.viewer-mode [class*="add-form"],
    body.viewer-mode .overlay { display: none !important; }

    /* Inputs deshabilitados en viewer */
    body.viewer-mode input:not([data-viewer-ok]),
    body.viewer-mode textarea:not([data-viewer-ok]) {
      pointer-events: none !important;
      opacity: 0.65 !important;
      cursor: not-allowed !important;
    }

    /* Selects de navegación (mes/año): se mantienen activos */
    body.viewer-mode select { pointer-events: auto !important; opacity: 1 !important; }
  `;
  document.head.appendChild(s);
}

function _lockElement(el) {
  el.disabled = true;
  el.style.display = 'none';
}

function _lockInput(el) {
  el.readOnly = true;
  el.style.pointerEvents = 'none';
  el.style.opacity = '0.65';
}

// Procesa todos los botones e inputs presentes en el DOM ahora mismo
function _scanAndLock() {
  // Botones de acción → ocultar
  document.querySelectorAll('button').forEach(btn => {
    if (_isNavElement(btn)) return;
    if (_looksLikeAction(btn)) _lockElement(btn);
  });

  // Inputs y textareas → solo lectura
  document.querySelectorAll('input, textarea').forEach(el => {
    if (!_isNavElement(el)) _lockInput(el);
  });

  // ContentEditable → off
  document.querySelectorAll('[contenteditable="true"]').forEach(el => {
    el.contentEditable = 'false';
  });
}

// ── Función principal del viewer mode ──────────────────────────────────────
function applyViewerMode() {
  if (!isViewer()) return;

  document.body.classList.add('viewer-mode');
  _injectViewerStyles();

  // Banner
  if (!document.getElementById('viewer-banner')) {
    const banner = document.createElement('div');
    banner.id = 'viewer-banner';
    banner.innerHTML = '<span class="vb-dot"></span> <strong>Modo Visualización — Solo Lectura</strong> &nbsp;|&nbsp; Hola Luis 👋';
    document.body.insertBefore(banner, document.body.firstChild);
  }

  // Bloquear submit de CUALQUIER formulario aunque llegue a enviarse
  document.addEventListener('submit', e => {
    e.preventDefault();
    e.stopImmediatePropagation();
    console.warn('[Olvisión] ⛔ Submit bloqueado: modo solo lectura.');
  }, true);

  // Bloquear click en botones de acción (segunda línea de defensa UI)
  document.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (_isNavElement(btn)) return;
    if (_looksLikeAction(btn)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);

  // Primer escaneo del DOM
  _scanAndLock();

  // Restaurar explícitamente tabs de navegación que nunca deben bloquearse
  const IDS_SEGUROS = [
    'maintab-hoy','maintab-historial',
    'subtab-ventas','subtab-egresos','subtab-arqueo',
    'btn-fecha-next','mes-btn'
  ];
  IDS_SEGUROS.forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.disabled = false; el.style.display = ''; el.style.pointerEvents = ''; el.style.opacity = ''; }
  });
  // También restaurar todos los botones con clase main-tab, sub-tab y mes-btn
  document.querySelectorAll('.main-tab, .sub-tab, .mes-btn, .tab-btn, .snav-item, .bnav-item').forEach(el => {
    el.disabled = false;
    el.style.display = '';
    el.style.pointerEvents = '';
    el.style.opacity = '';
  });

  // Corregir saludo con nombre del usuario real
  const userName = sessionStorage.getItem('userName') || 'Luis';
  const saludoEl = document.getElementById('saludo');
  if (saludoEl) {
    saludoEl.textContent = saludoEl.textContent.replace('Andres', userName);
  }

  // MutationObserver: bloquea elementos que se agreguen DINÁMICAMENTE
  // (listas de datos, modales, paneles que se renderizan después de cargar)
  const obs = new MutationObserver(mutations => {
    mutations.forEach(m => {
      m.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;

        // Nuevos botones
        const btns = node.matches?.('button') ? [node] : [...(node.querySelectorAll?.('button') || [])];
        btns.forEach(btn => {
          if (!_isNavElement(btn) && !btn.classList.contains('main-tab') && !btn.classList.contains('sub-tab') && !btn.classList.contains('mes-btn') && _looksLikeAction(btn)) _lockElement(btn);
        });

        // Nuevos inputs
        const inputs = node.matches?.('input,textarea') ? [node] : [...(node.querySelectorAll?.('input,textarea') || [])];
        inputs.forEach(el => {
          if (!_isNavElement(el)) _lockInput(el);
        });

        // ContentEditable nuevo
        if (node.contentEditable === 'true') node.contentEditable = 'false';
        node.querySelectorAll?.('[contenteditable="true"]').forEach(el => {
          el.contentEditable = 'false';
        });
      });
    });
  });

  obs.observe(document.body, { childList: true, subtree: true });
}

// ── Auto-aplicar al cargar cualquier página (excepto index.html) ─────────────
document.addEventListener('DOMContentLoaded', () => {
  // No aplicar viewer mode en la pantalla de login
  const esLogin = window.location.pathname.endsWith('index.html') || window.location.pathname === '/';
  if (isViewer() && !esLogin) applyViewerMode();
});
