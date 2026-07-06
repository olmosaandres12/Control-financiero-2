// ═══════════════════════════════════════════════════════════════
// reglasRentabilidad.js — OLVISIÓN · Motor de Rentabilidad
// ═══════════════════════════════════════════════════════════════
// Mismo patrón que reglasNegocio.js: cada regla es un objeto independiente,
// con TODO lo que describe esa situación (nivel, impacto, dificultad,
// tiempo). Agregar una regla nueva = agregar un objeto a REGLAS_RENTABILIDAD,
// sin tocar motorRentabilidad.js.
//
// ctx (armado en inteligencia.html en la Fase 4/6):
//   { kpis, rentabilidad, gastosFijos, margenPct }
//   rentabilidad = resultado de calcularResultadoRentabilidad()
//
// tipo: 'estructural' | 'operativo'
//   estructural — el problema es la estructura de costos fijos / el punto
//                 de equilibrio (lo que este módulo mide)
//   operativo   — el problema es venta del día a día (dominio de
//                 reglasNegocio.js) — se etiqueta acá solo para que
//                 generarDiagnosticoEstructural() lo pueda separar del
//                 diagnóstico operativo en el CEO Brief (Fase 6)
//
// nivel: 'crítico' | 'alto' | 'medio' | 'informativo' (mismos 4 niveles que
// reglasNegocio.js, para que las alertas de ambos motores se puedan mezclar
// y ordenar juntas sin traducir nada).
//
// diagnostico (opcional):  { mensaje }   — para el bloque "Diagnóstico estructural"
// recomendacion (opcional): { mensaje }  — para el Plan de Acción unificado
// ═══════════════════════════════════════════════════════════════

const REGLAS_RENTABILIDAD = [

  // ── Punto de equilibrio ─────────────────────────────────────
  {
    id: 'debajo_equilibrio_critico',
    tipo: 'estructural', nivel: 'crítico', impacto: 5, dificultad: 4, tiempoEstimado: '1-2 meses',
    condicion: ctx => ctx.rentabilidad?.avanceEquilibrio?.pctAvance !== null && ctx.rentabilidad.avanceEquilibrio.pctAvance < 70,
    diagnostico: { mensaje: ctx => `La facturación cubre solo el ${ctx.rentabilidad.avanceEquilibrio.pctAvance.toFixed(0)}% del punto de equilibrio mensual. La rentabilidad está limitada por una estructura fija elevada para el volumen actual — para absorberla, se necesita aumentar volumen de ventas y/o ticket promedio.` },
    recomendacion: { mensaje: 'Revisar los gastos fijos más grandes y evaluar si alguno se puede reducir o renegociar.' }
  },
  {
    id: 'debajo_equilibrio_alto',
    tipo: 'estructural', nivel: 'alto', impacto: 4, dificultad: 3, tiempoEstimado: '3-4 semanas',
    condicion: ctx => ctx.rentabilidad?.avanceEquilibrio?.pctAvance !== null && ctx.rentabilidad.avanceEquilibrio.pctAvance >= 70 && ctx.rentabilidad.avanceEquilibrio.pctAvance < 100,
    diagnostico: { mensaje: ctx => `Falta ${_fmtPesosRent(ctx.rentabilidad.avanceEquilibrio.faltante)} en facturación para llegar al punto de equilibrio este mes.` },
    recomendacion: { mensaje: 'Generar más presupuestos calificados y hacer seguimiento activo de los que están pendientes.' }
  },
  {
    id: 'margen_seguridad_bajo',
    tipo: 'estructural', nivel: 'medio', impacto: 3, dificultad: 2, tiempoEstimado: '2-3 semanas',
    condicion: ctx => ctx.rentabilidad?.margenSeguridad !== null && ctx.rentabilidad.margenSeguridad >= 0 && ctx.rentabilidad.margenSeguridad < 15,
    diagnostico: { mensaje: ctx => `El negocio superó el punto de equilibrio, pero por poco margen (${ctx.rentabilidad.margenSeguridad.toFixed(0)}%). Cualquier baja de ventas puede llevarlo a pérdida.` },
    recomendacion: { mensaje: 'Evitar promociones que bajen el margen sin aumentar el volumen de ventas.' }
  },
  {
    id: 'margen_seguridad_saludable',
    tipo: 'estructural', nivel: 'informativo', impacto: 1, dificultad: 1, tiempoEstimado: 'continuo',
    condicion: ctx => ctx.rentabilidad?.margenSeguridad !== null && ctx.rentabilidad.margenSeguridad >= 30,
    diagnostico: { mensaje: ctx => `El negocio opera con un margen de seguridad saludable (${ctx.rentabilidad.margenSeguridad.toFixed(0)}% por encima del punto de equilibrio).` },
    recomendacion: { mensaje: 'Mantener el mismo ritmo de ventas y estructura de costos.' }
  },

  // ── Estructura de costos fijos ──────────────────────────────
  {
    id: 'estructura_fija_pesada',
    tipo: 'estructural', nivel: 'alto', impacto: 4, dificultad: 4, tiempoEstimado: '1-2 meses',
    condicion: ctx => ctx.kpis?.facturacion > 0 && ctx.rentabilidad?.costosFijosTotal > 0 && (ctx.rentabilidad.costosFijosTotal / ctx.kpis.facturacion) >= 0.5,
    diagnostico: { mensaje: 'La estructura fija representa una porción muy grande de la facturación mensual. La rentabilidad está limitada por una estructura fija elevada — para absorberla, se necesita aumentar volumen de ventas y/o ticket promedio.' },
    recomendacion: { mensaje: 'Revisar la estructura fija completa (Configurar en Estructura fija mensual) y priorizar los ítems más grandes.' }
  },
  {
    id: 'categoria_gasto_concentrada',
    tipo: 'estructural', nivel: 'medio', impacto: 2, dificultad: 3, tiempoEstimado: '3-4 semanas',
    condicion: ctx => {
      const det = ctx.rentabilidad?.costosFijosDetalle;
      if (!det || !det.length || !ctx.rentabilidad.costosFijosTotal) return false;
      return (det[0].monto / ctx.rentabilidad.costosFijosTotal) >= 0.4;
    },
    diagnostico: { mensaje: ctx => `"${ctx.rentabilidad.costosFijosDetalle[0].categoria}" concentra el ${(ctx.rentabilidad.costosFijosDetalle[0].monto / ctx.rentabilidad.costosFijosTotal * 100).toFixed(0)}% de la estructura fija.` },
    recomendacion: { mensaje: ctx => `Revisar el gasto de "${ctx.rentabilidad.costosFijosDetalle[0].categoria}" — es el más grande de la estructura fija.` }
  },
  {
    id: 'publicidad_configurada',
    tipo: 'estructural', nivel: 'informativo', impacto: 2, dificultad: 2, tiempoEstimado: '1 semana',
    condicion: ctx => (ctx.rentabilidad?.costosFijosDetalle || []).some(c => c.categoria === 'Publicidad' && c.monto > 0),
    diagnostico: { mensaje: 'Hay inversión en publicidad dentro de la estructura fija configurada.' },
    recomendacion: { mensaje: 'Analizar si la inversión en publicidad (Meta Ads, etc.) se justifica según las órdenes necesarias para cubrir el punto de equilibrio.' }
  },

  // ── Camino hacia el equilibrio: ticket vs. órdenes ──────────
  {
    id: 'oportunidad_ticket_para_equilibrio',
    tipo: 'estructural', nivel: 'medio', impacto: 4, dificultad: 3, tiempoEstimado: '2-3 semanas',
    condicion: ctx => ctx.rentabilidad?.ticketNecesario !== null && ctx.kpis?.ticketPromedio > 0 && ctx.rentabilidad.ticketNecesario > ctx.kpis.ticketPromedio,
    diagnostico: { mensaje: ctx => `Con la cantidad de órdenes actual, el ticket promedio necesario para el equilibrio es ${_fmtPesosRent(ctx.rentabilidad.ticketNecesario)} (hoy: ${_fmtPesosRent(ctx.kpis.ticketPromedio)}).` },
    recomendacion: { mensaje: 'Aumentar el ticket promedio ofreciendo Blue HD, fotocromáticos o multifocales en cada presupuesto.' }
  },
  {
    id: 'oportunidad_ordenes_para_equilibrio',
    tipo: 'estructural', nivel: 'medio', impacto: 4, dificultad: 3, tiempoEstimado: '2-3 semanas',
    condicion: ctx => ctx.rentabilidad?.ordenesNecesarias !== null && ctx.kpis?.cantOrdenes >= 0 && ctx.rentabilidad.ordenesNecesarias > ctx.kpis.cantOrdenes,
    diagnostico: { mensaje: ctx => `Con el ticket promedio actual, hacen falta ${ctx.rentabilidad.ordenesNecesarias} órdenes este mes para llegar al equilibrio (hoy: ${ctx.kpis.cantOrdenes}).` },
    recomendacion: { mensaje: 'Generar más presupuestos calificados para acercarse a la cantidad de órdenes necesaria.' }
  },

  // ── Utilidad ──────────────────────────────────────────────────
  {
    id: 'utilidad_negativa',
    tipo: 'estructural', nivel: 'crítico', impacto: 5, dificultad: 3, tiempoEstimado: 'esta semana',
    condicion: ctx => ctx.rentabilidad?.utilidadEstimada !== undefined && ctx.rentabilidad.utilidadEstimada < 0,
    diagnostico: { mensaje: ctx => `La utilidad estimada del mes es negativa (${_fmtPesosRent(ctx.rentabilidad.utilidadEstimada)}): el margen bruto generado no alcanza a cubrir la estructura fija.` },
    recomendacion: { mensaje: 'Priorizar aumentar ventas o ticket antes de sumar nuevos gastos fijos este mes.' }
  }

  // ─────────────────────────────────────────────────────────────
  // Para sumar una regla nueva, copiar este bloque y completarlo:
  //
  // {
  //   id: 'id_unico',
  //   tipo: 'estructural'|'operativo',
  //   nivel: 'crítico'|'alto'|'medio'|'informativo',
  //   impacto: 1,        // 1 a 5
  //   dificultad: 1,     // 1 a 5
  //   tiempoEstimado: '...',
  //   condicion: ctx => /* true/false */,
  //   diagnostico: { mensaje: ctx => `...` },     // opcional
  //   recomendacion: { mensaje: '...' }            // opcional
  // },
  // ─────────────────────────────────────────────────────────────
];

// Helper de formato local — duplicado intencional de formatPesosIA()
// (motorAnalisis.js) para que este archivo no dependa de ningún otro.
function _fmtPesosRent(n) {
  if (!n || isNaN(n)) return '$0';
  return '$' + Math.round(Math.abs(n)).toLocaleString('es-AR') + (n < 0 ? ' negativos' : '');
}
