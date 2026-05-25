// ── UTILS.JS — Olvisión ─────────────────────────────────────
// Formatea automáticamente todos los inputs de dinero con puntos de miles
// Uso: agregar <script src="utils.js"></script> en cada HTML

// Formatea un input mientras el usuario escribe
function fmtMiles(input) {
  // Guardar posición del cursor
  const selStart = input.selectionStart;
  const prevLen = input.value.length;

  // Solo dígitos
  let raw = input.value.replace(/\./g, '').replace(/[^0-9]/g, '');
  if (!raw) { input.value = ''; input.dataset.raw = ''; return; }

  // Formatear con puntos cada 3 dígitos
  const formatted = parseInt(raw).toLocaleString('es-AR');
  input.value = formatted;
  input.dataset.raw = raw;

  // Restaurar cursor ajustado por los puntos agregados/eliminados
  const diff = formatted.length - prevLen;
  const newPos = Math.max(0, selStart + diff);
  try { input.setSelectionRange(newPos, newPos); } catch(e) {}
}

// Lee el valor numérico real de un input formateado (sin puntos)
function getVal(input) {
  if (!input) return 0;
  const raw = (input.dataset.raw || input.value || '').replace(/\./g, '').replace(/,/g, '.');
  return parseFloat(raw) || 0;
}

// Establece un valor numérico en un input con formato de miles
function setVal(input, numero) {
  if (!input) return;
  if (!numero || isNaN(numero) || numero === 0) { input.value = ''; input.dataset.raw = ''; return; }
  const n = Math.round(numero);
  input.value = n.toLocaleString('es-AR');
  input.dataset.raw = String(n);
}

// Auto-aplicar a todos los inputs con data-miles="true" al cargar la página
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('input[data-miles="true"]').forEach(input => {
    input.setAttribute('inputmode', 'numeric');
    input.addEventListener('input', () => fmtMiles(input));
    input.addEventListener('focus', () => { if (!input.value) return; });
  });
});
