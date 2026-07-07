// ═══════════════════════════════════════════════════════════════
// datosRentabilidad.js — OLVISIÓN · Motor de Rentabilidad
// ═══════════════════════════════════════════════════════════════
// Capa de acceso a datos: la ÚNICA pieza del Motor de Rentabilidad que
// habla con Supabase. motorRentabilidad.js (los cálculos) y
// reglasRentabilidad.js (el diagnóstico) nunca hacen fetch — reciben los
// datos que este archivo trae. Sin esta separación, cualquier futuro PDF
// o simulador que quiera reusar el motor de cálculo arrastraría también
// la lógica de Supabase, aunque no la necesite.
//
// Todas las funciones reciben `db` (el cliente de Supabase que cada página
// ya crea con createClient(), mismo patrón que caja.html/gastos.html/etc.)
// como PRIMER parámetro — no asumen ningún global. Así este archivo
// tampoco depende de inteligencia.html: se podría llamar desde cualquier
// otra página pasándole su propio `db`.
//
// Sin caching acá adentro, a propósito: OlvisionCache ya se usa en el HTML
// que llama a estas funciones (mismo criterio que ya tenés en el resto de
// la app) — cachear en esta capa también sería duplicar el mismo trabajo
// en dos lugares.
//
// Funciones exportadas:
//   cargarGastosFijos(db, periodo)
//   crearGastoFijo(db, item)
//   actualizarGastoFijo(db, id, cambios)
//   eliminarGastoFijo(db, id)
//   toggleActivoGastoFijo(db, id, activoNuevo)
//   duplicarGastosFijosDesdeMesAnterior(db, periodoOrigen, periodoDestino)
//   cargarMargenBrutoEstimado(db)
//   guardarMargenBrutoEstimado(db, pct)
//   cargarCategoriasGastosFijos(db)
//   guardarCategoriasGastosFijos(db, categorias)
//   cargarContextoRentabilidad(db, periodo)
// ═══════════════════════════════════════════════════════════════

const TABLA_GASTOS_FIJOS = 'gastos_fijos_configurados';
const CLAVE_MARGEN_BRUTO = 'margen_bruto_estimado_pct';
const CLAVE_CATEGORIAS_GASTOS_FIJOS = 'categorias_gastos_fijos';
const MARGEN_BRUTO_DEFAULT = 45; // si todavía no se configuró nada en `configuracion`

// ── Gastos fijos configurados ("Estructura fija mensual") ───────

async function cargarGastosFijos(db, periodo) {
  const { data, error } = await db
    .from(TABLA_GASTOS_FIJOS)
    .select('*')
    .eq('periodo', periodo)
    .order('categoria', { ascending: true })
    .order('orden', { ascending: true });
  if (error) { console.warn('cargarGastosFijos:', error.message); return []; }
  return data || [];
}

async function crearGastoFijo(db, item) {
  // item: { periodo, categoria, nombre, monto, activo?, orden? }
  const payload = {
    periodo: item.periodo,
    categoria: item.categoria,
    nombre: item.nombre,
    monto: item.monto || 0,
    activo: item.activo !== false,
    orden: item.orden || 0
  };
  const { data, error } = await db.from(TABLA_GASTOS_FIJOS).insert([payload]).select().single();
  if (error) return { ok: false, error: error.message, data: null };
  return { ok: true, error: null, data };
}

async function actualizarGastoFijo(db, id, cambios) {
  const payload = { ...cambios, updated_at: new Date().toISOString() };
  const { data, error } = await db.from(TABLA_GASTOS_FIJOS).update(payload).eq('id', id).select().single();
  if (error) return { ok: false, error: error.message, data: null };
  return { ok: true, error: null, data };
}

async function eliminarGastoFijo(db, id) {
  const { error } = await db.from(TABLA_GASTOS_FIJOS).delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}

async function toggleActivoGastoFijo(db, id, activoNuevo) {
  return actualizarGastoFijo(db, id, { activo: activoNuevo });
}

// Copia todos los ítems de un mes al siguiente — la estructura fija suele
// repetirse mes a mes, esto evita recargarla a mano cada vez. NO pisa nada:
// si el período destino ya tiene ítems, no hace nada y avisa por qué.
async function duplicarGastosFijosDesdeMesAnterior(db, periodoOrigen, periodoDestino) {
  const existentesDestino = await cargarGastosFijos(db, periodoDestino);
  if (existentesDestino.length > 0) {
    return { ok: false, error: `${periodoDestino} ya tiene ${existentesDestino.length} ítem(s) cargado(s). No se duplicó nada para no pisarlos.`, cantidad: 0 };
  }
  const origen = await cargarGastosFijos(db, periodoOrigen);
  if (origen.length === 0) {
    return { ok: false, error: `${periodoOrigen} no tiene ítems para copiar.`, cantidad: 0 };
  }
  const nuevos = origen.map(g => ({
    periodo: periodoDestino, categoria: g.categoria, nombre: g.nombre,
    monto: g.monto, activo: g.activo, orden: g.orden
  }));
  const { error } = await db.from(TABLA_GASTOS_FIJOS).insert(nuevos);
  if (error) return { ok: false, error: error.message, cantidad: 0 };
  return { ok: true, error: null, cantidad: nuevos.length };
}

// ── Configuración (tabla `configuracion`, clave/valor ya existente) ──

async function cargarMargenBrutoEstimado(db) {
  const { data, error } = await db.from('configuracion').select('valor').eq('clave', CLAVE_MARGEN_BRUTO).maybeSingle();
  if (error || !data) return MARGEN_BRUTO_DEFAULT;
  const pct = parseFloat(data.valor);
  return isNaN(pct) ? MARGEN_BRUTO_DEFAULT : pct;
}

async function guardarMargenBrutoEstimado(db, pct) {
  const { error } = await db.from('configuracion').update({ valor: String(pct) }).eq('clave', CLAVE_MARGEN_BRUTO);
  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}

async function cargarCategoriasGastosFijos(db) {
  const { data, error } = await db.from('configuracion').select('valor').eq('clave', CLAVE_CATEGORIAS_GASTOS_FIJOS).maybeSingle();
  if (error || !data) return [];
  try { return JSON.parse(data.valor) || []; } catch (e) { return []; }
}

async function guardarCategoriasGastosFijos(db, categorias) {
  const { error } = await db.from('configuracion').update({ valor: JSON.stringify(categorias) }).eq('clave', CLAVE_CATEGORIAS_GASTOS_FIJOS);
  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}

// ── Consolidado — todo lo que necesita motorRentabilidad.js de una vez ──
// Trae en paralelo gastos fijos del período + margen + categorías, para
// que inteligencia.html (Fase 4) lo pida con un solo llamado en su
// cargarTodo(), mismo criterio que ya usa con Promise.all() en el resto
// de la página.
async function cargarContextoRentabilidad(db, periodo) {
  const [gastosFijos, margenPct, categorias] = await Promise.all([
    cargarGastosFijos(db, periodo),
    cargarMargenBrutoEstimado(db),
    cargarCategoriasGastosFijos(db)
  ]);
  return { gastosFijos, margenPct, categorias };
}
