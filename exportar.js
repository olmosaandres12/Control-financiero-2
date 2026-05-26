// ============================================================
// exportar.js — Exportación Excel mensual para Olvisión
// Requiere: SheetJS (CDN), supabase (config.js)
// ============================================================

// ── Helpers de celda ────────────────────────────────────────
const $c = v => ({ v: parseFloat(v) || 0, t: 'n', z: '"$"#,##0' }); // moneda
const Nc = v => ({ v: parseFloat(v) || 0, t: 'n' });                  // número
const Sc = v => ({ v: String(v || ''),    t: 's' });                   // texto

async function exportarExcelMes(mes, db) {
  const boton = document.getElementById('btn-exportar-excel');
  if (boton) { boton.disabled = true; boton.textContent = '⏳ Generando...'; }

  try {
    // ── 1. Calcular mes siguiente ────────────────────────────
    const mesNum = parseInt(mes.split('-')[1]);
    const anio   = parseInt(mes.split('-')[0]);
    const mesSig = `${mesNum === 12 ? anio + 1 : anio}-${String(mesNum === 12 ? 1 : mesNum + 1).padStart(2,'0')}`;

    // ── 2. Traer datos en paralelo ───────────────────────────
    const [{ data: registros, error: errR }, { data: gastos, error: errG }] = await Promise.all([
      db.from('registros').select('*')
        .gte('fecha', mes + '-01').lt('fecha', mesSig + '-01')
        .order('fecha', { ascending: true }).order('created_at', { ascending: true }),
      db.from('gastos').select('*')
        .gte('fecha', mes + '-01').lt('fecha', mesSig + '-01')
        .order('fecha', { ascending: true })
    ]);

    if (errR) throw errR;
    if (!registros || registros.length === 0) {
      alert('No hay operaciones registradas en ' + formatearMesLabel(mes)); return;
    }

    const ventas  = registros.filter(r => !r.egreso || parseFloat(r.egreso) === 0);
    const egresos = registros.filter(r => parseFloat(r.egreso) > 0);
    const metricas = calcularMetricas(ventas, egresos, gastos || []);

    // ── 3. Construir workbook ────────────────────────────────
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, hojaOperaciones(registros),  'OPERACIONES');
    XLSX.utils.book_append_sheet(wb, hojaGastos(gastos || []),    'GASTOS');
    XLSX.utils.book_append_sheet(wb, hojaResumen(metricas, mes),  'RESUMEN');

    XLSX.writeFile(wb, `Olvision_${mes}.xlsx`);

  } catch (err) {
    console.error('Error al exportar:', err);
    alert('Ocurrió un error al generar el Excel.');
  } finally {
    if (boton) { boton.disabled = false; boton.textContent = '📊 Exportar Excel del mes'; }
  }
}

// ============================================================
// HOJA 1 — OPERACIONES
// ============================================================
function hojaOperaciones(data) {
  const headers = [
    'Fecha','Tipo','Cliente','N° Orden','Producto',
    'Observaciones','Total','A Cuenta','Saldo','Forma de Pago','Vendedor'
  ];

  const filas = data.map(r => {
    const esEgreso = parseFloat(r.egreso) > 0;
    const esSena   = !esEgreso && parseFloat(r.a_cuenta) > 0;
    return [
      Sc(formatearFecha(r.fecha)),
      Sc(esEgreso ? 'Egreso' : esSena ? 'Seña' : 'Venta'),
      Sc(esEgreso ? (r.observacion || 'Egreso') : (r.nombre_cliente || '')),
      Sc(r.numero_orden || ''),
      Sc(esEgreso ? 'EGRESO' : (r.producto || '')),
      Sc(r.observacion || ''),
      $c(esEgreso ? -parseFloat(r.egreso) : (r.total || 0)),
      $c(r.a_cuenta || 0),
      $c(r.saldo || 0),
      Sc(r.forma_pago || ''),
      Sc(r.vendedor || ''),
    ];
  });

  // Fila de totales
  const totalVtas = data.filter(r=>!r.egreso||parseFloat(r.egreso)===0)
    .reduce((s,r)=>s+(parseFloat(r.total)||0),0);
  const totalEgr  = data.filter(r=>parseFloat(r.egreso)>0)
    .reduce((s,r)=>s+(parseFloat(r.egreso)||0),0);
  const totalCob  = data.filter(r=>!r.egreso||parseFloat(r.egreso)===0)
    .reduce((s,r)=>s+(parseFloat(r.a_cuenta)>0?parseFloat(r.a_cuenta):parseFloat(r.total)||0),0);

  const filaTotales = [
    Sc('TOTALES'), Sc(''), Sc(''), Sc(''), Sc(''), Sc(''),
    $c(totalVtas - totalEgr), $c(totalCob), Sc(''), Sc(''), Sc('')
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers.map(Sc), ...filas, [Sc('')], filaTotales]);
  ws['!cols'] = [
    {wch:12},{wch:10},{wch:24},{wch:10},{wch:16},
    {wch:28},{wch:16},{wch:14},{wch:14},{wch:16},{wch:12}
  ];
  return ws;
}

// ============================================================
// HOJA 2 — GASTOS
// ============================================================
function hojaGastos(gastos) {
  if (!gastos || gastos.length === 0) {
    return XLSX.utils.aoa_to_sheet([[Sc('Sin gastos registrados en este mes')]]);
  }

  const headers = ['Fecha','Descripción','Categoría','Monto','Forma de Pago','Observaciones'];

  const filas = gastos.map(g => [
    Sc(formatearFecha(g.fecha)),
    Sc(g.descripcion || ''),
    Sc(g.categoria || ''),
    $c(g.monto || 0),
    Sc(g.forma_pago || ''),
    Sc(g.observacion || ''),
  ]);

  const totalGral = gastos.reduce((s,g)=>s+(parseFloat(g.monto)||0),0);
  const filaTotalGral = [Sc(''), Sc('TOTAL GASTOS'), Sc(''), $c(totalGral), Sc(''), Sc('')];

  // Subtotales por categoría
  const porCat = {};
  gastos.forEach(g => {
    const cat = g.categoria || 'Sin categoría';
    porCat[cat] = (porCat[cat] || 0) + (parseFloat(g.monto) || 0);
  });
  const headerSubt = [Sc(''), Sc('SUBTOTALES POR CATEGORÍA'), Sc('Monto'), Sc(''), Sc(''), Sc('')];
  const filasCat = Object.entries(porCat)
    .sort((a,b)=>b[1]-a[1])
    .map(([cat, monto]) => [Sc(''), Sc(cat), $c(monto), Sc(''), Sc(''), Sc('')]);

  const ws = XLSX.utils.aoa_to_sheet([
    headers.map(Sc),
    ...filas,
    [Sc('')],
    filaTotalGral,
    [Sc('')],
    headerSubt,
    ...filasCat,
  ]);
  ws['!cols'] = [{wch:12},{wch:30},{wch:22},{wch:16},{wch:16},{wch:28}];
  return ws;
}

// ============================================================
// HOJA 3 — RESUMEN ejecutivo
// ============================================================
function hojaResumen(m, mes) {
  const label = formatearMesLabel(mes).toUpperCase();
  const rows = [];

  rows.push([Sc(`REPORTE MENSUAL — ${label} — OLVISIÓN`)]);
  rows.push([Sc('')]);

  // Resumen financiero
  rows.push([Sc('RESUMEN FINANCIERO'), Sc('')]);
  rows.push([Sc('Facturado este mes (ventas nuevas)'),     $c(m.totalFacturado)]);
  rows.push([Sc('Saldos de meses anteriores cobrados'),    $c(m.saldosAnterioresCobrados)]);
  rows.push([Sc('Total cobrado en caja'),                  $c(m.totalCobrado)]);
  rows.push([Sc('Egresos de caja'),                        $c(-m.totalEgresosCaja)]);
  rows.push([Sc('Neto en caja'),                           $c(m.netoCaja)]);
  rows.push([Sc('Falta cobrar (señas pendientes)'),        $c(m.faltaCobrar || 0)]);
  rows.push([Sc('Gastos del mes'),                         $c(-m.totalGastos)]);
  rows.push([Sc('Cantidad de ventas nuevas'),              Nc(m.cantVentas)]);
  rows.push([Sc('Ticket promedio'),                        $c(m.ticketPromedio)]);
  rows.push([Sc('')]);

  // Medios de pago
  rows.push([Sc('MEDIOS DE PAGO'), Sc('Monto cobrado'), Sc('Porcentaje')]);
  ['Efectivo','T. Credito','Debito','QR','Transferencia'].forEach(f => {
    const monto = m.porFormaPago[f] || 0;
    if (!monto) return;
    const pct = m.totalCobrado > 0 ? ((monto / m.totalCobrado) * 100).toFixed(1) + '%' : '0%';
    rows.push([Sc(f), $c(monto), Sc(pct)]);
  });
  rows.push([Sc('')]);

  // Por producto
  rows.push([Sc('PRODUCTOS'), Sc('Facturación'), Sc('Cantidad'), Sc('Ticket prom.')]);
  Object.entries(m.porProducto).sort((a,b)=>b[1].total-a[1].total).forEach(([prod,d]) => {
    rows.push([Sc(prod), $c(d.total), Nc(d.cantidad), $c(d.cantidad>0?Math.round(d.total/d.cantidad):0)]);
  });
  rows.push([Sc('')]);

  // Por vendedor
  rows.push([Sc('VENDEDORES'), Sc('Facturación'), Sc('Cant. ventas'), Sc('Ticket prom.')]);
  Object.entries(m.porVendedor).sort((a,b)=>b[1].total-a[1].total).forEach(([vend,d]) => {
    rows.push([Sc(vend), $c(d.total), Nc(d.cantidad), $c(d.cantidad>0?Math.round(d.total/d.cantidad):0)]);
  });
  rows.push([Sc('')]);

  // Gastos por categoría
  if (Object.keys(m.gastosPorCategoria).length > 0) {
    rows.push([Sc('GASTOS POR CATEGORÍA'), Sc('Monto'), Sc('Cantidad')]);
    Object.entries(m.gastosPorCategoria).sort((a,b)=>b[1].total-a[1].total).forEach(([cat,d]) => {
      rows.push([Sc(cat), $c(d.total), Nc(d.cantidad)]);
    });
    rows.push([Sc('TOTAL GASTOS'), $c(m.totalGastos)]);
    rows.push([Sc('')]);
  }

  // Evolución diaria
  rows.push([Sc('DÍA'), Sc('Facturado'), Sc('Cobrado'), Sc('N° operaciones')]);
  Object.entries(m.porDia).sort((a,b)=>a[0].localeCompare(b[0])).forEach(([fecha,d]) => {
    rows.push([Sc(formatearFecha(fecha)), $c(d.total), $c(d.cobrado), Nc(d.cantidad)]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:38},{wch:18},{wch:14},{wch:14}];
  return ws;
}

// ============================================================
// CÁLCULO DE MÉTRICAS
// ============================================================
function calcularMetricas(ventas, egresos, gastos) {
  const m = {
    totalFacturado: 0, saldosAnterioresCobrados: 0, totalCobrado: 0,
    totalEgresosCaja: 0, netoCaja: 0, faltaCobrar: 0, totalGastos: 0,
    cantVentas: 0, ticketPromedio: 0,
    porFormaPago: {}, porProducto: {}, porVendedor: {}, porDia: {}, gastosPorCategoria: {},
  };

  m.totalEgresosCaja = egresos.reduce((s,r)=>s+(parseFloat(r.egreso)||0),0);

  ventas.forEach(r => {
    const total   = parseFloat(r.total) || 0;
    const acuenta = parseFloat(r.a_cuenta) || 0;
    const saldo   = parseFloat(r.saldo) || 0;
    const cobrado = acuenta > 0 ? acuenta : total;
    const esSaldo = r.producto === 'Saldo';

    m.totalCobrado += cobrado;
    if (esSaldo) {
      m.saldosAnterioresCobrados += cobrado;
    } else {
      m.totalFacturado += total;
      m.cantVentas++;
      if (acuenta > 0 && saldo > 0) m.faltaCobrar += saldo;
    }

    const fp = r.forma_pago || 'Sin datos';
    m.porFormaPago[fp] = (m.porFormaPago[fp] || 0) + cobrado;

    const prod = r.producto || 'Sin datos';
    if (!m.porProducto[prod]) m.porProducto[prod] = { total: 0, cantidad: 0 };
    m.porProducto[prod].total += total; m.porProducto[prod].cantidad++;

    const vend = r.vendedor || 'Sin datos';
    if (!m.porVendedor[vend]) m.porVendedor[vend] = { total: 0, cantidad: 0 };
    m.porVendedor[vend].total += total; m.porVendedor[vend].cantidad++;

    const fecha = r.fecha;
    if (!m.porDia[fecha]) m.porDia[fecha] = { total: 0, cantidad: 0, cobrado: 0 };
    m.porDia[fecha].total   += esSaldo ? 0 : total;
    m.porDia[fecha].cantidad++;
    m.porDia[fecha].cobrado += cobrado;
  });

  m.netoCaja       = m.totalCobrado - m.totalEgresosCaja;
  m.ticketPromedio = m.cantVentas > 0 ? Math.round(m.totalFacturado / m.cantVentas) : 0;

  gastos.forEach(g => {
    const monto = parseFloat(g.monto) || 0;
    m.totalGastos += monto;
    const cat = g.categoria || 'Sin categoría';
    if (!m.gastosPorCategoria[cat]) m.gastosPorCategoria[cat] = { total: 0, cantidad: 0 };
    m.gastosPorCategoria[cat].total += monto; m.gastosPorCategoria[cat].cantidad++;
  });

  return m;
}

// ============================================================
// HELPERS
// ============================================================
function formatearFecha(fechaISO) {
  if (!fechaISO) return '';
  const [y, mes, d] = fechaISO.split('-');
  return `${d}/${mes}/${y}`;
}

function formatearMesLabel(mes) {
  const meses = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const [y, m] = mes.split('-');
  return `${meses[parseInt(m)]} ${y}`;
}
