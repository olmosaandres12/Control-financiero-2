// ═══════════════════════════════════════════════════════════════
// motorAnalisis.js — OLVISIÓN · Centro de Inteligencia
// ═══════════════════════════════════════════════════════════════
// Motor de cálculo puro (sin DOM). Recibe datos crudos de Supabase
// (registros, gastos, empleados) y devuelve indicadores y análisis.
// No hace llamadas a IA externa ni consume tokens: todo es JS local.
//
// Funciones exportadas (todas quedan en window, sin bundler):
//   calcularKPIsMes()
//   calcularObjetivosAutomaticos() / resolverObjetivos()
//   calcularCEOScore()
//   ajustarCoherenciaScore()          [nuevo]
//   generarResumen()
//   detectarAlertas()
//   detectarOportunidades()
//   generarPlanAccion()
//   generarRecomendaciones()
//   compararMeses()
//   compararConPromedio()             [nuevo]
//   calcularCostoOportunidad()        [nuevo]
//   detectarMemoriaHistorica()        [nuevo]
//   generarPortadaEjecutiva()         [nuevo]
//   generarCEOBrief()                 [nuevo]
//   generarSaludNegocio()             [nuevo]
//   generarMetaDelMes()                [Sprint 1]
//   generarProyeccionCierre()          [Sprint 1]
//   generarMotorComercial()            [Sprint 1]
//   predecirCierre()
//   semaforoKPI()
//   comentarioVendedor()
//   calcularSerieDiaria()
//
// Depende de REGLAS_NEGOCIO y REGLAS_RACHAS, definidos en reglasNegocio.js
// (cargar ese script ANTES que este, o después — el orden no
// importa porque las reglas se leen recién cuando se ejecuta
// detectarAlertas()/generarRecomendaciones()/detectarMemoriaHistorica(),
// no al cargar el archivo).
// ═══════════════════════════════════════════════════════════════

// ── Constantes de negocio (únicas, no repetidas por reglas) ──────
const PRODUCTOS_OPTICOS_IA = ['Recetado', 'Reposicion C.', 'PAMI', 'Pase'];
// Trabajos que requieren vendedor asignado (generan comisión). Distinto de
// PRODUCTOS_OPTICOS_IA (que se usa para ticket óptico / multifocales) porque
// acá además entra "Sol" — confirmado por Andrés: los 5 comisionables son
// recetado, PAMI, reposición de cristales, sol y pases.
const PRODUCTOS_COMISIONABLES_IA = ['Recetado', 'PAMI', 'Reposicion C.', 'Sol', 'Pase'];
const TIPO_MULTIFOCAL_IA = 'progresivo'; // confirmado por Andrés: multifocal = progresivo

// Pesos del CEO Score sin el factor Margen (no hay datos de costo todavía).
// Editable acá o, más adelante, desde configuracion.ceo_score_pesos en Supabase.
const PESOS_CEO_SCORE_DEFAULT = {
  facturacion: 30,
  ordenes: 23,
  ticket: 18,
  dependencia: 12,
  mix: 6,
  cobranza: 6,
  gastos: 5
};

// Umbrales de dependencia comercial — ÚNICA fuente de verdad, usada por
// calcularCEOScore(), las reglas de alerta (reglasNegocio.js) y
// generarSaludNegocio(), para que nunca se contradigan entre sí.
// 0-50 verde · 50-65 amarillo · 65-80 naranja (alerta) · +80 rojo (alerta)
const DEPENDENCIA_UMBRAL_AMARILLO = 50;
const DEPENDENCIA_UMBRAL_NARANJA = 65;
const DEPENDENCIA_UMBRAL_ROJO = 80;

function clampIA(n, min, max) { return Math.max(min, Math.min(max, n)); }
function formatPesosIA(n) { if (!n || isNaN(n)) return '$0'; return '$' + Math.round(n).toLocaleString('es-AR'); }

// Normaliza variantes de escritura de productos (mismo criterio que caja.html)
function normalizarProductoIA(raw) {
  if (!raw) return raw;
  const s = raw.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const mapa = {
    'recetado':'Recetado','sol':'Sol','lentes':'Lentes','taller':'Taller',
    'accesorio':'Accesorio','saldo':'Saldo','liquidos':'Liquidos','pase':'Pase','pami':'PAMI',
    'reposicion c.':'Reposicion C.','reposicion c':'Reposicion C.',
    'reposicion cristales':'Reposicion C.','reposicion':'Reposicion C.'
  };
  return mapa[s] || raw;
}

function parseDetalleIA(detalleJson) {
  if (!detalleJson) return null;
  try { return JSON.parse(detalleJson); } catch (e) { return null; }
}

// ── 1. KPIs del mes ────────────────────────────────────────────
// registrosMes: array crudo de la tabla `registros` (ventas + egresos mezclados)
// gastosMes: array crudo de la tabla `gastos`
// empleados: array de la tabla `empleados`
function calcularKPIsMes(registrosMes, gastosMes, empleados) {
  const regs = (registrosMes || []).map(r => ({ ...r, producto: normalizarProductoIA(r.producto) }));
  const ventas = regs.filter(r => !r.egreso || parseFloat(r.egreso) === 0);
  const egresosArr = regs.filter(r => parseFloat(r.egreso) > 0);
  const ventasReales = ventas.filter(r => r.producto !== 'Saldo'); // Saldo = cobro de deuda, no venta nueva

  const facturacion = ventasReales.reduce((s, r) => s + (parseFloat(r.total) || 0), 0);
  const cantOrdenes = ventasReales.length;
  const ticketPromedio = cantOrdenes > 0 ? facturacion / cantOrdenes : 0;

  const cobrado = ventas.reduce((s, r) => s + (parseFloat(r.a_cuenta) > 0 ? parseFloat(r.a_cuenta) : parseFloat(r.total) || 0), 0);
  const egresosCaja = egresosArr.reduce((s, r) => s + (parseFloat(r.egreso) || 0), 0);
  const netoCaja = cobrado - egresosCaja;
  const saldoPendiente = ventasReales.reduce((s, r) => s + (parseFloat(r.saldo) || 0), 0);

  const opticas = ventasReales.filter(r => PRODUCTOS_OPTICOS_IA.includes(r.producto));
  const totalOptico = opticas.reduce((s, r) => s + (parseFloat(r.total) || 0), 0);
  const cantOpticas = opticas.length;
  const ticketOptico = cantOpticas > 0 ? totalOptico / cantOpticas : 0;
  const mixOpticoPct = facturacion > 0 ? (totalOptico / facturacion * 100) : 0;

  // Multifocales / fotocromáticos: solo entre las ópticas que tienen "tipo" cargado
  let conTipo = 0, multifocales = 0, fotocromaticos = 0;
  opticas.forEach(r => {
    const d = parseDetalleIA(r.detalle_producto);
    if (!d || !d.tipo) return;
    conTipo++;
    if ((d.tipo || '').toLowerCase() === TIPO_MULTIFOCAL_IA) multifocales++;
    if ((d.tratamiento || '').toLowerCase().includes('fotocrom')) fotocromaticos++;
  });
  const multifocalesPct = conTipo > 0 ? (multifocales / conTipo * 100) : 0;
  const fotocromaticosPct = conTipo > 0 ? (fotocromaticos / conTipo * 100) : 0;

  // Cobertura comercial: SOLO entre trabajos comisionables (recetado, PAMI,
  // reposición de cristales, sol, pases). Los no comisionables (líquidos,
  // accesorios, reparaciones chicas, etc.) no requieren vendedor y quedan
  // completamente afuera de este cálculo — antes se mezclaba todo junto y
  // generaba falsas alertas de "facturación sin asignar".
  const comisionables = ventasReales.filter(r => PRODUCTOS_COMISIONABLES_IA.includes(r.producto));
  const cantComisionables = comisionables.length;
  const comisionablesConVendedor = comisionables.filter(r => !!r.vendedor).length;
  const comisionablesSinVendedor = cantComisionables - comisionablesConVendedor;
  const coberturaComercialPct = cantComisionables > 0 ? (comisionablesConVendedor / cantComisionables * 100) : 100;

  // Ranking por vendedor (por facturado). Solo vendedores REALES: las ventas
  // sin vendedor asignado ya no se agrupan como si fueran un vendedor más
  // (antes "Sin asignar" podía terminar siendo el "vendedorLider" y disparar
  // una alerta de dependencia comercial falsa: "Sin asignar concentra XX%").
  const porVendedor = {};
  ventasReales.filter(r => !!r.vendedor).forEach(r => {
    const v = r.vendedor;
    if (!porVendedor[v]) porVendedor[v] = { monto: 0, cant: 0, mix: {} };
    porVendedor[v].monto += (parseFloat(r.total) || 0);
    porVendedor[v].cant += 1;
    porVendedor[v].mix[r.producto] = (porVendedor[v].mix[r.producto] || 0) + (parseFloat(r.total) || 0);
  });
  const rankingVendedores = Object.entries(porVendedor).map(([nombre, d]) => ({
    nombre, monto: d.monto, cant: d.cant,
    ticket: d.cant > 0 ? d.monto / d.cant : 0,
    pct: facturacion > 0 ? (d.monto / facturacion * 100) : 0,
    mix: d.mix
  })).sort((a, b) => b.monto - a.monto);
  const vendedorLider = rankingVendedores[0] || null;
  const dependenciaPct = vendedorLider ? vendedorLider.pct : 0;

  // Participación por producto
  const porProducto = {};
  ventasReales.forEach(r => {
    const p = r.producto || 'Otro';
    if (!porProducto[p]) porProducto[p] = { monto: 0, cant: 0 };
    porProducto[p].monto += (parseFloat(r.total) || 0);
    porProducto[p].cant += 1;
  });
  const participacionProductos = Object.entries(porProducto).map(([nombre, d]) => ({
    nombre, monto: d.monto, cant: d.cant, pct: facturacion > 0 ? (d.monto / facturacion * 100) : 0
  })).sort((a, b) => b.monto - a.monto);

  // Concentración por forma de pago
  const porForma = {};
  ventas.forEach(r => {
    const f = r.forma_pago || 'Sin dato';
    const monto = parseFloat(r.a_cuenta) > 0 ? parseFloat(r.a_cuenta) : parseFloat(r.total) || 0;
    porForma[f] = (porForma[f] || 0) + monto;
  });
  const formaPagoArr = Object.entries(porForma).map(([nombre, monto]) => ({
    nombre, monto, pct: cobrado > 0 ? (monto / cobrado * 100) : 0
  })).sort((a, b) => b.monto - a.monto);
  const formaPagoMax = formaPagoArr[0] || null;

  const gastosAdmin = (gastosMes || []).reduce((s, g) => s + (parseFloat(g.monto) || 0), 0);
  const gastosPct = facturacion > 0 ? (gastosAdmin / facturacion * 100) : 0;
  const cobranzaPct = facturacion > 0 ? Math.min(100, cobrado / facturacion * 100) : 0;

  const diasSinVentasConsecutivos = calcularRachaSinVentasIA(regs);

  return {
    facturacion, cobrado, saldoPendiente, egresosCaja, gastosAdmin, netoCaja,
    cantOrdenes, ticketPromedio, cantOpticas, ticketOptico, mixOpticoPct,
    multifocalesPct, fotocromaticosPct,
    cantComisionables, comisionablesConVendedor, comisionablesSinVendedor, coberturaComercialPct,
    dependenciaPct, vendedorLider, cobranzaPct, gastosPct,
    rankingVendedores, participacionProductos, formaPagoArr, formaPagoMax,
    diasSinVentasConsecutivos
  };
}

function calcularRachaSinVentasIA(regs) {
  const ventas = regs.filter(r => !r.egreso || parseFloat(r.egreso) === 0);
  const diasConVenta = new Set(ventas.map(r => r.fecha));
  let racha = 0;
  const hoy = new Date();
  for (let i = 0; i < 30; i++) {
    const d = new Date(hoy); d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (diasConVenta.has(key)) break;
    racha++;
  }
  return racha;
}

// ── 2. Objetivos automáticos ───────────────────────────────────
// historicoMeses: array de resultados de calcularKPIsMes() de hasta 3 meses previos
function calcularObjetivosAutomaticos(historicoMeses) {
  if (!historicoMeses || !historicoMeses.length) return null;
  const prom = campo => historicoMeses.reduce((s, m) => s + (m[campo] || 0), 0) / historicoMeses.length;
  return {
    facturacion: Math.round(prom('facturacion') * 1.10),
    ticketPromedio: Math.round(prom('ticketPromedio') * 1.10),
    cantOrdenes: Math.round(prom('cantOrdenes') * 1.10),
    cobranzaPct: Math.min(100, Math.round(prom('cobranzaPct') * 1.05)),
    gastosPct: Math.round(prom('gastosPct') * 0.90),
    dependenciaPct: Math.round(prom('dependenciaPct') * 0.90)
  };
}

// Combina el objetivo automático con overrides manuales (futuro: configuracion.kpi_objetivos_manual)
function resolverObjetivos(objetivosAuto, overridesManual) {
  return { ...(objetivosAuto || {}), ...(overridesManual || {}) };
}

// ── 3. CEO Score ────────────────────────────────────────────────
// comparacion (opcional): resultado de compararMeses(), para citar % concretos
// en la explicación ("bajó por la caída de facturación (-22%)..."). Si no se
// pasa, la explicación queda igual que antes (compatible con llamadas viejas).
function calcularCEOScore(kpis, objetivos, pesos, comparacion) {
  pesos = pesos || PESOS_CEO_SCORE_DEFAULT;
  if (!objetivos) {
    return {
      score: null, nivel: 'Sin datos suficientes', emoji: '⚪', detalle: [],
      explicacion: 'Todavía no hay al menos un mes anterior con datos para calcular objetivos automáticos. El score se habilita a partir del segundo mes de uso.'
    };
  }
  const scoreFacturacion = objetivos.facturacion > 0 ? Math.min(100, kpis.facturacion / objetivos.facturacion * 100) : 0;
  const scoreOrdenes = objetivos.cantOrdenes > 0 ? Math.min(100, kpis.cantOrdenes / objetivos.cantOrdenes * 100) : 0;
  const scoreTicket = objetivos.ticketPromedio > 0 ? Math.min(100, kpis.ticketPromedio / objetivos.ticketPromedio * 100) : 0;
  // "Dependencia comercial" combina dos riesgos bajo el mismo peso (sin
  // agregar un factor nuevo, sin tocar pesos): concentración en un solo
  // vendedor (como antes) y cobertura comercial (comisionables sin vendedor).
  // Se toma el peor de los dos. Si la cobertura es 100%, no resta nada.
  const scoreConcentracion = clampIA(100 - Math.max(0, (kpis.dependenciaPct - 30)) * 2, 0, 100);
  const scoreCobertura = clampIA(kpis.coberturaComercialPct, 0, 100);
  const scoreDependencia = Math.min(scoreConcentracion, scoreCobertura);
  const scoreMix = clampIA(kpis.mixOpticoPct / 60 * 100, 0, 100); // objetivo interno: 60% ópticos
  const scoreCobranza = clampIA(kpis.cobranzaPct, 0, 100);
  const scoreGastos = clampIA(100 - Math.max(0, (kpis.gastosPct - 25)) * 3, 0, 100); // objetivo interno: gastos <=25%

  const detalle = [
    { factor: 'Facturación', peso: pesos.facturacion, score: scoreFacturacion, campoComparacion: 'facturacion' },
    { factor: 'Órdenes', peso: pesos.ordenes, score: scoreOrdenes, campoComparacion: 'cantOrdenes' },
    { factor: 'Ticket promedio', peso: pesos.ticket, score: scoreTicket, campoComparacion: 'ticketPromedio' },
    { factor: 'Dependencia comercial', peso: pesos.dependencia, score: scoreDependencia, campoComparacion: null },
    { factor: 'Mix de productos', peso: pesos.mix, score: scoreMix, campoComparacion: null },
    { factor: 'Cobranza', peso: pesos.cobranza, score: scoreCobranza, campoComparacion: 'cobrado' },
    { factor: 'Gastos', peso: pesos.gastos, score: scoreGastos, campoComparacion: 'gastosAdmin', invertido: true }
  ];
  const score = Math.round(detalle.reduce((s, d) => s + (d.peso / 100 * d.score), 0));

  let nivel, emoji;
  if (score >= 80) { nivel = 'Excelente'; emoji = '🟢'; }
  else if (score >= 60) { nivel = 'Bueno'; emoji = '🟡'; }
  else if (score >= 40) { nivel = 'Atención'; emoji = '🟠'; }
  else { nivel = 'Crítico'; emoji = '🔴'; }

  const factorMasDebil = [...detalle].sort((a, b) => a.score - b.score)[0];
  const fuertes = detalle.filter(d => d.score >= 70);
  const debiles = detalle.filter(d => d.score < 50);

  // Un factor "fuerte" (score alto contra objetivo) puede igual estar en mala
  // tendencia si el objetivo automático quedó bajo. No tiene sentido decir que
  // "compensa" algo si en realidad también viene cayendo (o, para Gastos —
  // donde menos es mejor— si viene subiendo). Se filtran antes de armar la frase.
  const feo = f => {
    const c = f.campoComparacion && comparacion ? comparacion[f.campoComparacion] : null;
    if (!c) return false;
    return f.invertido ? c.direccion === 'up' : c.direccion === 'down';
  };
  const fuertesEstables = fuertes.filter(f => !feo(f));

  const conVariacion = factores => factores.slice(0, 3).map(f => {
    const c = f.campoComparacion && comparacion ? comparacion[f.campoComparacion] : null;
    if (c && c.direccion !== '=') {
      const signo = c.direccion === 'down' ? '-' : '+';
      return `${f.factor.toLowerCase()} (${signo}${Math.abs(c.pct).toFixed(0)}%)`;
    }
    return f.factor.toLowerCase();
  });

  const joinNatural = arr => {
    if (arr.length === 0) return '';
    if (arr.length === 1) return arr[0];
    if (arr.length === 2) return arr[0] + ' y ' + arr[1];
    return arr.slice(0, -1).join(', ') + ' y ' + arr[arr.length - 1];
  };

  let explicacion;
  if (debiles.length) {
    explicacion = `El puntaje ${score < 60 ? 'bajó' : 'se ve afectado'} principalmente por ${joinNatural(conVariacion(debiles))}.`;
    if (fuertesEstables.length) explicacion += ` ${fuertesEstables.length === 1 ? 'Compensa' : 'Compensan'} parcialmente ${joinNatural(conVariacion(fuertesEstables))}.`;
  } else if (fuertesEstables.length) {
    explicacion = `El puntaje se apoya en ${joinNatural(conVariacion(fuertesEstables))}.`;
  } else {
    explicacion = 'El puntaje refleja un desempeño parejo, sin factores que se destaquen especialmente.';
  }
  explicacion += ` El punto más débil es "${factorMasDebil.factor}" (${Math.round(factorMasDebil.score)}/100).`;

  return { score, nivel, emoji, detalle, explicacion };
}

// ── 3b. Coherencia Score ↔ Alertas ─────────────────────────────
// Nunca sube el nivel mostrado, solo lo puede bajar (techo). El número del
// score NO se toca — solo la etiqueta (Excelente/Bueno/Atención/Crítico) para
// que nunca diga "Excelente" habiendo alertas críticas activas.
// Llamar DESPUÉS de tener las alertas ya calculadas: 
//   const ceo = calcularCEOScore(...); 
//   const alertas = detectarAlertas({...ctx, ceoScore: ceo});
//   const ceoFinal = ajustarCoherenciaScore(ceo, alertas);
const _NIVEL_SCORE_RANK = { 'Crítico': 0, 'Atención': 1, 'Bueno': 2, 'Excelente': 3 };
const _RANK_NIVEL_SCORE = ['Crítico', 'Atención', 'Bueno', 'Excelente'];
const _RANK_EMOJI_SCORE = ['🔴', '🟠', '🟡', '🟢'];

function ajustarCoherenciaScore(ceoScore, alertas) {
  if (!ceoScore || ceoScore.score === null) return ceoScore;
  const criticas = (alertas || []).filter(a => a.nivel === 'crítico').length;
  const altas = (alertas || []).filter(a => a.nivel === 'alto').length;

  let techoRank = 3; // sin techo (puede ser Excelente)
  if (criticas >= 2) techoRank = 1;       // como mucho "Atención"
  else if (criticas === 1) techoRank = 2; // como mucho "Bueno"
  else if (altas >= 3) techoRank = 2;     // como mucho "Bueno"

  const rankOriginal = _NIVEL_SCORE_RANK[ceoScore.nivel] ?? 3;
  const rankFinal = Math.min(rankOriginal, techoRank);
  if (rankFinal === rankOriginal) return { ...ceoScore, nivelAjustado: false };

  return {
    ...ceoScore,
    nivel: _RANK_NIVEL_SCORE[rankFinal],
    emoji: _RANK_EMOJI_SCORE[rankFinal],
    nivelAjustado: true,
    explicacion: ceoScore.explicacion + ` El nivel mostrado se ajustó por la cantidad de alertas activas (${criticas} crítica${criticas !== 1 ? 's' : ''}${altas ? `, ${altas} de impacto alto` : ''}).`
  };
}

// ── 4. Resumen ejecutivo (texto por reglas, sin IA) ────────────
function generarResumen(kpis, ceoScore, alertas, comparacion) {
  const frases = [];
  if (ceoScore.score !== null) {
    frases.push(`El negocio cierra el mes con un CEO Score de ${ceoScore.score}/100 (${ceoScore.nivel}).`);
  }
  if (comparacion && comparacion.facturacion) {
    const c = comparacion.facturacion;
    const verbo = c.direccion === 'up' ? 'creció' : c.direccion === 'down' ? 'cayó' : 'se mantuvo estable';
    frases.push(`La facturación ${verbo}${c.direccion !== '=' ? ' un ' + Math.abs(c.pct).toFixed(0) + '%' : ''} respecto al mes anterior.`);
  }
  if (kpis.dependenciaPct >= DEPENDENCIA_UMBRAL_NARANJA && kpis.vendedorLider) {
    frases.push(`Hay una dependencia comercial alta: ${kpis.vendedorLider.nombre} concentra el ${kpis.dependenciaPct.toFixed(0)}% de las ventas.`);
  }
  if (kpis.cantOpticas >= 5 && kpis.multifocalesPct < 10) {
    frases.push(`Las ventas de multifocales están por debajo del potencial (${kpis.multifocalesPct.toFixed(0)}% de las órdenes ópticas), hay una oportunidad de crecimiento ahí.`);
  }
  const criticas = (alertas || []).filter(a => a.nivel === 'crítico');
  if (criticas.length) {
    frases.push(`Se detectaron ${criticas.length} situación${criticas.length !== 1 ? 'es' : ''} que requiere${criticas.length !== 1 ? 'n' : ''} atención inmediata este mes.`);
  } else {
    frases.push('No hay alertas críticas este mes.');
  }
  return frases.join(' ');
}

// ── 5/10. Alertas y recomendaciones (leen REGLAS_NEGOCIO) ──────
function _evaluarRegla(regla, ctx) {
  try { return !!regla.condicion(ctx); } catch (e) { console.warn('Regla', regla.id, 'falló:', e); return false; }
}

function detectarAlertas(ctx) {
  if (typeof REGLAS_NEGOCIO === 'undefined') return [];
  return REGLAS_NEGOCIO.filter(r => r.alerta && _evaluarRegla(r, ctx)).map(r => ({
    id: r.id,
    nivel: r.nivel,       // 'crítico' | 'alto' | 'medio' | 'informativo'
    impacto: r.impacto,   // 1-5, misma escala que usa el plan de acción
    mensaje: typeof r.alerta.mensaje === 'function' ? r.alerta.mensaje(ctx) : r.alerta.mensaje,
    causa: typeof r.alerta.causa === 'function' ? r.alerta.causa(ctx) : r.alerta.causa
  }));
}

function generarRecomendaciones(ctx) {
  if (typeof REGLAS_NEGOCIO === 'undefined') return [];
  return REGLAS_NEGOCIO.filter(r => r.recomendacion && _evaluarRegla(r, ctx)).map(r => ({
    id: r.id,
    mensaje: typeof r.recomendacion.mensaje === 'function' ? r.recomendacion.mensaje(ctx) : r.recomendacion.mensaje,
    impacto: r.impacto,             // ★ 1-5
    dificultad: r.dificultad,       // 1-5 (1 = fácil/rápido, 5 = difícil/largo)
    tiempoEstimado: r.tiempoEstimado,
    nivel: r.nivel
  })).sort((a, b) => b.impacto - a.impacto);
}

function generarPlanAccion(ctx, maxItems) {
  maxItems = maxItems || 5; // "máximo 5 acciones concretas"
  const recs = generarRecomendaciones(ctx);
  const vistos = new Set();
  const plan = [];
  recs.forEach(r => { if (!vistos.has(r.mensaje)) { vistos.add(r.mensaje); plan.push(r); } });
  return plan.slice(0, maxItems);
}

// ── 6. Oportunidades (estimaciones "qué pasaría si") ───────────
// maxItems opcional: si se pasa, devuelve solo las N de mayor impacto
// (pedido: "mostrar siempre las tres de mayor impacto"). Sin el parámetro,
// devuelve todas — mismo comportamiento que antes, no rompe nada existente.
function detectarOportunidades(kpis, maxItems) {
  const oportunidades = [];
  if (kpis.ticketPromedio > 0 && kpis.cantOrdenes > 0) {
    const extra = kpis.ticketPromedio * 0.10 * kpis.cantOrdenes;
    oportunidades.push({ mensaje: 'Si el ticket promedio aumentara un 10%', estimado: extra, detalle: `facturación estimada adicional de ${formatPesosIA(extra)}` });
  }
  if (kpis.ticketOptico > 0) {
    const extra = kpis.ticketOptico * 5;
    oportunidades.push({ mensaje: 'Si se vendieran 5 multifocales más este mes', estimado: extra, detalle: `ingreso adicional estimado de ${formatPesosIA(extra)} (usando el ticket óptico promedio como referencia)` });
  }
  if (kpis.facturacion > 0) {
    const extra = kpis.facturacion * 0.05;
    oportunidades.push({ mensaje: 'Si la conversión de consultas a ventas mejorara un 5%', estimado: extra, detalle: `facturación estimada adicional de ${formatPesosIA(extra)} — estimación aproximada, la app no registra tráfico/consultas todavía` });
  }
  const contacto = (kpis.participacionProductos || []).find(p => p.nombre === 'Lentes');
  if (contacto && contacto.monto > 0) {
    const extra = contacto.monto * 0.15;
    oportunidades.push({ mensaje: 'Si crecieran un 15% las ventas de lentes de contacto', estimado: extra, detalle: `ingreso adicional estimado de ${formatPesosIA(extra)}` });
  }
  oportunidades.sort((a, b) => b.estimado - a.estimado);
  return maxItems ? oportunidades.slice(0, maxItems) : oportunidades;
}

// ── 7. Comparación de meses ─────────────────────────────────────
function compararMeses(actual, anterior, mismoMesAnioPasado) {
  const campos = ['facturacion', 'ticketPromedio', 'cantOrdenes', 'cobrado', 'gastosAdmin'];
  const comparar = (a, b) => {
    if (!a || !b) return null;
    const out = {};
    campos.forEach(c => {
      const va = a[c] || 0, vb = b[c] || 0;
      let pct = 0, direccion = '=';
      if (vb > 0) pct = ((va - vb) / vb) * 100;
      else if (va > 0) pct = 100;
      if (pct > 1) direccion = 'up'; else if (pct < -1) direccion = 'down';
      out[c] = { pct, direccion, valorAnterior: vb, valorActual: va };
    });
    return out;
  };
  const vsAnterior = comparar(actual, anterior);
  return { ...(vsAnterior || {}), vsAnioPasado: mismoMesAnioPasado ? comparar(actual, mismoMesAnioPasado) : null };
}

// ── 7b. Comparación contra el promedio de N meses (Tendencias) ─
// historico: array de calcularKPIsMes(), más reciente primero (mismo orden
// que ya arma inteligencia.html para calcularObjetivosAutomaticos).
// cantMeses: 3 o 6, según qué tendencia se pida.
// Reutiliza los mismos campos que compararMeses, sin duplicar la fórmula.
function compararConPromedio(actual, historico, cantMeses) {
  if (!historico || !historico.length) return null;
  const ultimos = historico.slice(0, cantMeses);
  if (!ultimos.length) return null;
  const campos = ['facturacion', 'ticketPromedio', 'cantOrdenes', 'cobrado', 'gastosAdmin'];
  const out = {};
  campos.forEach(c => {
    const prom = ultimos.reduce((s, m) => s + (m[c] || 0), 0) / ultimos.length;
    const va = actual[c] || 0;
    let pct = 0, direccion = '=';
    if (prom > 0) pct = ((va - prom) / prom) * 100;
    else if (va > 0) pct = 100;
    if (pct > 1) direccion = 'up'; else if (pct < -1) direccion = 'down';
    out[c] = { pct, direccion, promedio: prom, valorActual: va };
  });
  return out;
}

// ── 7c. Costo de oportunidad ────────────────────────────────────
// "Cuánto se dejó de facturar por vender con un ticket más bajo que el
// promedio reciente." Solo aparece cuando hay una caída real (si no, null).
function calcularCostoOportunidad(kpis, historico) {
  if (!historico || !historico.length || kpis.cantOrdenes <= 0) return null;
  const ultimos3 = historico.slice(0, 3);
  const promTicket = ultimos3.reduce((s, m) => s + (m.ticketPromedio || 0), 0) / ultimos3.length;
  if (promTicket <= 0 || kpis.ticketPromedio >= promTicket) return null;
  const gapTicket = promTicket - kpis.ticketPromedio;
  const monto = gapTicket * kpis.cantOrdenes;
  return {
    monto,
    ticketPromedioHistorico: promTicket,
    ticketActual: kpis.ticketPromedio,
    mensaje: `Este mes se dejaron de facturar aproximadamente ${formatPesosIA(monto)} debido a la disminución del ticket promedio respecto al promedio de los últimos tres meses.`
  };
}

// ── 8. Predicción de cierre ─────────────────────────────────────
function predecirCierre(kpis, fechaHoy, anio, mes) {
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();
  const esMesEnCurso = (fechaHoy.getFullYear() === anio && fechaHoy.getMonth() === mes);
  const diaActual = esMesEnCurso ? fechaHoy.getDate() : diasEnMes;
  const pctTranscurrido = diaActual / diasEnMes;
  if (pctTranscurrido <= 0) return null;

  const ritmoFacturacion = kpis.facturacion / diaActual;
  const ritmoOrdenes = kpis.cantOrdenes / diaActual;
  const ritmoCobrado = kpis.cobrado / diaActual;

  let confianza = 'baja';
  if (!esMesEnCurso) confianza = 'alta (mes cerrado)';
  else if (pctTranscurrido >= 0.7) confianza = 'alta';
  else if (pctTranscurrido >= 0.3) confianza = 'media';

  // confianzaPct: versión numérica (0-100) del mismo concepto, para mostrar
  // "Confianza 91%" como pide el informe ejecutivo. Se agrega sin tocar
  // `confianza` (texto) para no romper la pantalla que ya está en producción.
  const confianzaPct = !esMesEnCurso ? 99 : Math.round(Math.min(97, 35 + pctTranscurrido * 65));

  return {
    esMesEnCurso,
    facturacionEstimada: Math.round(ritmoFacturacion * diasEnMes),
    ordenesEstimadas: Math.round(ritmoOrdenes * diasEnMes),
    cobradoEstimado: Math.round(ritmoCobrado * diasEnMes),
    confianza, confianzaPct, diasTranscurridos: diaActual, diasEnMes,
    utilidadEstimada: null // no disponible: requiere datos de costo por venta
  };
}

// ── 9. Semáforo genérico para KPIs individuales ────────────────
// invertido = true para KPIs donde "menos es mejor" (ej: gastos, dependencia)
function semaforoKPI(actual, objetivo, invertido) {
  if (!objetivo || objetivo <= 0) return { emoji: '⚪', pct: null };
  const pct = invertido ? (objetivo / Math.max(actual, 0.0001) * 100) : (actual / objetivo * 100);
  if (pct >= 100) return { emoji: '🟢', pct };
  if (pct >= 80) return { emoji: '🟡', pct };
  if (pct >= 60) return { emoji: '🟠', pct };
  return { emoji: '🔴', pct };
}

// ── Detalle por vendedor: comentario automático ────────────────
function comentarioVendedor(v) {
  if (v.pct >= 40) return `${v.nombre} concentra el ${v.pct.toFixed(0)}% de las ventas. Riesgo de dependencia.`;
  if (v.pct < 10) return `${v.nombre} tiene baja participación (${v.pct.toFixed(0)}%). Revisar involucramiento comercial.`;
  return `${v.nombre} tiene una participación equilibrada (${v.pct.toFixed(0)}%).`;
}

// ── Serie diaria de facturación (para el gráfico de barras por día) ────
// Devuelve un array con TODOS los días del mes (aunque no haya ventas ese día),
// para que el gráfico muestre huecos reales en vez de saltarlos.
function calcularSerieDiaria(registrosMes, anio, mes) {
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();
  const porDia = {};
  for (let d = 1; d <= diasEnMes; d++) {
    const fecha = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    porDia[fecha] = 0;
  }
  (registrosMes || []).forEach(r => {
    if (parseFloat(r.egreso) > 0) return;
    const p = normalizarProductoIA(r.producto);
    if (p === 'Saldo') return;
    if (porDia[r.fecha] === undefined) return;
    porDia[r.fecha] += (parseFloat(r.total) || 0);
  });
  return Object.keys(porDia).sort().map(fecha => ({
    fecha, dia: parseInt(fecha.split('-')[2], 10), monto: porDia[fecha]
  }));
}

// ── 10. Memoria histórica (rachas de varios meses) ─────────────
// serieHistorica: array de calcularKPIsMes(), ORDENADO DE MÁS VIEJO A MÁS
// NUEVO, con el mes actual como último elemento (orden inverso al que usa
// calcularObjetivosAutomaticos/compararConPromedio — ojo al armarlo).
// Depende de REGLAS_RACHAS (reglasNegocio.js): cada regla define su propia
// condición y mensaje, así que agregar una racha nueva no toca esta función.
function detectarMemoriaHistorica(serieHistorica) {
  if (typeof REGLAS_RACHAS === 'undefined' || !serieHistorica || serieHistorica.length < 2) return [];
  const rachas = [];
  REGLAS_RACHAS.forEach(regla => {
    let cant = 0;
    for (let i = serieHistorica.length - 1; i >= 0; i--) {
      const actual = serieHistorica[i];
      const anterior = i > 0 ? serieHistorica[i - 1] : null;
      let cumple;
      try { cumple = !!regla.condicion(actual, anterior); } catch (e) { cumple = false; }
      if (cumple) cant++; else break;
    }
    if (cant >= (regla.minMeses || 3)) {
      rachas.push({ id: regla.id, meses: cant, mensaje: regla.mensaje(cant) });
    }
  });
  return rachas;
}

// ── 11. Portada ejecutiva ───────────────────────────────────────
// Pura composición: no calcula nada nuevo, solo arma un resumen tipo "informe
// gerencial" con datos que ya salieron de calcularCEOScore/detectarAlertas/
// generarPlanAccion. Llamar con el score YA ajustado por ajustarCoherenciaScore.
function generarPortadaEjecutiva(kpis, ceoScoreAjustado, alertas, plan, mesLabel) {
  const loMejor = [];
  if (kpis.cobranzaPct >= 85) loMejor.push('Buena cobranza.');
  const factorTicket = (ceoScoreAjustado.detalle || []).find(d => d.factor === 'Ticket promedio');
  if (factorTicket && factorTicket.score >= 70) loMejor.push('Ticket estable o por encima del objetivo.');
  if (kpis.mixOpticoPct >= 50) loMejor.push('Buen mix de productos ópticos.');
  if (kpis.dependenciaPct < DEPENDENCIA_UMBRAL_AMARILLO) loMejor.push('Dependencia comercial bajo control.');
  if (!loMejor.length) loMejor.push('Sin destacados particulares este mes.');

  const riesgos = (alertas || [])
    .filter(a => a.nivel === 'crítico' || a.nivel === 'alto')
    .slice(0, 4)
    .map(a => a.mensaje);

  const prioridades = (plan || []).slice(0, 3).map(p => p.mensaje);

  return {
    mesLabel,
    estadoGeneral: ceoScoreAjustado.nivel,
    estadoEmoji: ceoScoreAjustado.emoji,
    score: ceoScoreAjustado.score,
    loMejor,
    riesgos: riesgos.length ? riesgos : ['Sin riesgos relevantes detectados este mes.'],
    prioridades: prioridades.length ? prioridades : ['Sin prioridades puntuales este mes.']
  };
}

// ── 12. CEO Brief ────────────────────────────────────────────────
// Composición pura: no calcula nada nuevo. Reutiliza ceoScore.detalle (para
// el "cuello de botella" = el factor con peor puntaje), comparacion (para el
// ticket), plan[0] (para la prioridad de la semana) y kpis ya calculados.
// Llamar con el score YA ajustado por ajustarCoherenciaScore().
const _MAPA_CUELLO_BOTELLA = {
  'Facturación': 'la baja generación de ventas',
  'Órdenes': 'la baja cantidad de operaciones',
  'Ticket promedio': 'el ticket promedio bajo',
  'Dependencia comercial': 'la alta dependencia comercial',
  'Mix de productos': 'el mix de productos poco balanceado',
  'Cobranza': 'la cobranza lenta',
  'Gastos': 'los gastos administrativos elevados'
};

function generarCEOBrief(kpis, ceoScoreAjustado, plan, comparacion) {
  if (ceoScoreAjustado.score === null) {
    return { score: null, nivel: ceoScoreAjustado.nivel, emoji: ceoScoreAjustado.emoji, bullets: [ceoScoreAjustado.explicacion], prioridadSemana: 'Todavía no hay historial suficiente.' };
  }
  const bullets = [];

  const factFacturacion = (ceoScoreAjustado.detalle || []).find(d => d.factor === 'Facturación');
  if (factFacturacion) {
    if (factFacturacion.score < 50) bullets.push('La facturación se encuentra muy por debajo del objetivo mensual.');
    else if (factFacturacion.score < 80) bullets.push('La facturación está por debajo del objetivo mensual.');
    else bullets.push('La facturación está en línea o por encima del objetivo mensual.');
  }

  if (comparacion && comparacion.ticketPromedio) {
    const c = comparacion.ticketPromedio;
    if (c.direccion === 'down') bullets.push(`El ticket promedio cayó ${Math.abs(c.pct).toFixed(0)}% respecto al mes anterior.`);
    else if (c.direccion === 'up') bullets.push(`El ticket promedio mejoró ${Math.abs(c.pct).toFixed(0)}% respecto al mes anterior.`);
  }

  if (kpis.cantComisionables > 0) {
    if (kpis.coberturaComercialPct >= 95) bullets.push('La calidad del registro comercial es excelente.');
    else if (kpis.coberturaComercialPct >= 80) bullets.push('La calidad del registro comercial es buena, con algún trabajo sin vendedor asignado.');
    else bullets.push('Hay varios trabajos comisionables sin vendedor asignado — conviene revisar la carga diaria.');
  }

  if (kpis.cobranzaPct >= 85) bullets.push('La cobranza permanece saludable.');
  else if (kpis.cobranzaPct >= 70) bullets.push('La cobranza es aceptable, con margen para mejorar.');
  else bullets.push('La cobranza está débil este mes.');

  const debil = [...(ceoScoreAjustado.detalle || [])].sort((a, b) => a.score - b.score)[0];
  if (debil) {
    bullets.push(`El cuello de botella principal es ${_MAPA_CUELLO_BOTELLA[debil.factor] || debil.factor.toLowerCase()}.`);
  }

  const prioridadSemana = (plan && plan.length) ? plan[0].mensaje : 'Sin prioridades puntuales esta semana.';

  return {
    score: ceoScoreAjustado.score,
    nivel: ceoScoreAjustado.nivel,
    emoji: ceoScoreAjustado.emoji,
    bullets,
    prioridadSemana
  };
}

// ── 13. Salud del Negocio ────────────────────────────────────────
// Estados de semáforo (máximo 5) sobre las 5 dimensiones centrales del
// negocio. Usa los MISMOS umbrales que ya usa calcularCEOScore (25% gastos,
// objetivo de ticket/facturación, DEPENDENCIA_UMBRAL_*) para que este bloque
// nunca diga algo distinto de lo que dice el Score o las alertas.
function generarSaludNegocio(kpis, objetivos) {
  const estados = [];

  if (kpis.cantComisionables > 0) {
    if (kpis.coberturaComercialPct >= 95) estados.push({ emoji: '🟢', texto: 'Cobertura comercial excelente.' });
    else if (kpis.coberturaComercialPct >= 80) estados.push({ emoji: '🟡', texto: 'Cobertura comercial aceptable, con trabajos sin vendedor.' });
    else estados.push({ emoji: '🔴', texto: 'Cobertura comercial baja: muchos trabajos sin vendedor.' });
  }

  if (kpis.cobranzaPct >= 85) estados.push({ emoji: '🟢', texto: 'Cobranza saludable.' });
  else if (kpis.cobranzaPct >= 70) estados.push({ emoji: '🟡', texto: 'Cobranza aceptable.' });
  else estados.push({ emoji: '🔴', texto: 'Cobranza débil.' });

  if (objetivos && objetivos.ticketPromedio > 0) {
    const pct = kpis.ticketPromedio / objetivos.ticketPromedio * 100;
    if (pct >= 100) estados.push({ emoji: '🟢', texto: 'Ticket promedio en objetivo.' });
    else if (pct >= 80) estados.push({ emoji: '🟡', texto: 'Ticket promedio bajo.' });
    else estados.push({ emoji: '🔴', texto: 'Ticket promedio muy bajo.' });
  }

  if (objetivos && objetivos.facturacion > 0) {
    const pct = kpis.facturacion / objetivos.facturacion * 100;
    if (pct >= 100) estados.push({ emoji: '🟢', texto: 'Facturación en objetivo.' });
    else if (pct >= 70) estados.push({ emoji: '🟡', texto: 'Facturación por debajo del objetivo.' });
    else estados.push({ emoji: '🔴', texto: 'Facturación crítica.' });
  }

  if (kpis.dependenciaPct < DEPENDENCIA_UMBRAL_AMARILLO) estados.push({ emoji: '🟢', texto: 'Dependencia comercial baja.' });
  else if (kpis.dependenciaPct < DEPENDENCIA_UMBRAL_NARANJA) estados.push({ emoji: '🟡', texto: 'Dependencia comercial moderada.' });
  else if (kpis.dependenciaPct < DEPENDENCIA_UMBRAL_ROJO) estados.push({ emoji: '🟠', texto: 'Dependencia comercial alta.' });
  else estados.push({ emoji: '🔴', texto: 'Dependencia comercial crítica.' });

  return estados.slice(0, 5);
}

// ── 14. Meta del Mes (Sprint 1 — "OLVISIÓN OS") ─────────────────
// objetivoFacturacion: número plano, ya resuelto por resolverObjetivos()
// (auto + override manual desde `configuracion.meta_facturacion_mensual`,
// leído en inteligencia.html). prediccion: resultado de predecirCierre(),
// se reusa tal cual para los días restantes — no se recalcula fecha nada.
//
// No llama a motorRentabilidad.js (motores hermanos, no se llaman entre
// sí): la fórmula de avance/faltante es la misma idea que
// calcularAvanceEquilibrio() de ese motor, repetida acá en 2 líneas para
// que este archivo siga pudiendo cargarse solo.
function generarMetaDelMes(kpis, objetivoFacturacion, prediccion) {
  if (!objetivoFacturacion || objetivoFacturacion <= 0) return null;
  const actual = kpis.facturacion || 0;
  const pctAvance = Math.min(999, (actual / objetivoFacturacion) * 100);
  const faltante = Math.max(0, objetivoFacturacion - actual);
  const diasRestantes = prediccion ? Math.max(0, prediccion.diasEnMes - prediccion.diasTranscurridos) : null;
  const ritmoDiarioNecesario = (diasRestantes && diasRestantes > 0) ? (faltante / diasRestantes) : null;
  return { objetivo: objetivoFacturacion, actual, pctAvance, faltante, diasRestantes, ritmoDiarioNecesario };
}

// ── 15. Proyección de cierre ─────────────────────────────────────
// Reusa predecirCierre() tal cual — el promedio diario de ventas ya está
// calculado ahí, acá solo se interpreta contra la meta.
function generarProyeccionCierre(prediccion, objetivoFacturacion) {
  if (!prediccion) return null;
  const facturacionProyectada = prediccion.facturacionEstimada;
  let probabilidad = null;
  if (objetivoFacturacion > 0) {
    const ratio = facturacionProyectada / objetivoFacturacion;
    if (ratio >= 1) probabilidad = { nivel: 'alta', texto: 'Probabilidad alta de cumplir el objetivo.' };
    else if (ratio >= 0.85) probabilidad = { nivel: 'media', texto: 'Probabilidad media de cumplir el objetivo.' };
    else probabilidad = { nivel: 'baja', texto: 'Probabilidad baja de cumplir el objetivo.' };
  }
  const diferencia = objetivoFacturacion > 0 ? (facturacionProyectada - objetivoFacturacion) : null;
  return { facturacionProyectada, objetivo: objetivoFacturacion, diferencia, probabilidad, confianzaPct: prediccion.confianzaPct };
}

// ── 16. Motor Comercial ───────────────────────────────────────────
// Traduce la meta de facturación en cantidad de órdenes, usando el ticket
// promedio actual. Misma idea que calcularOrdenesNecesarias() de
// motorRentabilidad.js, repetida acá por la misma razón de independencia
// entre motores hermanos explicada arriba.
function generarMotorComercial(kpis, objetivoFacturacion) {
  const ticketPromedioActual = kpis.ticketPromedio || 0;
  const ordenesActuales = kpis.cantOrdenes || 0;
  if (!objetivoFacturacion || objetivoFacturacion <= 0 || ticketPromedioActual <= 0) {
    return { ordenesActuales, ticketPromedioActual, ordenesNecesarias: null, ordenesFaltantes: null };
  }
  const ordenesNecesarias = Math.ceil(objetivoFacturacion / ticketPromedioActual);
  const ordenesFaltantes = Math.max(0, ordenesNecesarias - ordenesActuales);
  return { ordenesActuales, ticketPromedioActual, ordenesNecesarias, ordenesFaltantes };
}
