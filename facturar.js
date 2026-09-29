// ══════════════════════════════════════════════════════════════
//  facturar.js — Pestaña "🧾 Facturar" dentro de Caja Diaria
//  Lista mensual de operaciones cobradas con T. Crédito, Débito,
//  QR y Transferencia, con la descripción lista para pegar en ARCA
//  (RCEL · Factura C · campo Producto/Servicio).
//  Se carga al final de caja.html:  <script src="facturar.js"></script>
//  Requiere la columna registros.facturada (boolean, default false).
// ══════════════════════════════════════════════════════════════

(function () {
  const FORMAS_FACTURAR = ['T. Credito', 'Debito', 'QR', 'Transferencia'];

  // ── GENERADOR DE DESCRIPCIONES PARA ARCA (funciones puras) ──
  const PLURAL_TIPO = { monofocal: 'monofocales', bifocal: 'bifocales', ocupacional: 'ocupacionales', progresivo: 'progresivos', 'teñido': 'teñidos' };

  function limpiar(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

  function textoCristales(cantidad, tipo, tratamiento) {
    const c = limpiar(cantidad).toLowerCase();
    const t = limpiar(tipo).toLowerCase();
    const tr = limpiar(tratamiento);
    const esUno = c === 'medio par' || c === '1 cristal';
    if (esUno) return limpiar(`1 cristal ${t} ${tr}`);
    return limpiar(`1 par de cristales ${PLURAL_TIPO[t] || t} ${tr}`);
  }

  function textoGraduacion(od, oi) {
    od = limpiar(od); oi = limpiar(oi);
    if (od && oi && od !== oi) return `OD ${od} / OI ${oi}`;
    return od || oi || '';
  }

  function textoCantContacto(n) {
    if (typeof n === 'string') {
      const s = n.trim().toLowerCase();
      if (s === '½ par' || s === 'medio par') n = 0.5;
      else n = parseFloat(s) || 1;
    }
    n = Number(n) || 1;
    if (n === 1) return '1 par de lentes de contacto';
    if (Number.isInteger(n)) return `${n} pares de lentes de contacto`;
    const unidades = Math.round(n * 2);
    return unidades === 1 ? '1 lente de contacto' : `${unidades} lentes de contacto`;
  }

  function textoLiquido(it) {
    const cant = parseInt(it.cantidad) || 1;
    const prod = limpiar(it.producto);
    const pres = limpiar(it.presentacion);
    if (/pastillas nac/i.test(prod)) {
      if (/caja/i.test(prod)) return `${cant} caja${cant > 1 ? 's' : ''} de pastillas NAC x10`;
      return `${cant} pastilla${cant > 1 ? 's' : ''} NAC`;
    }
    return limpiar(`${cant} líquido${cant > 1 ? 's' : ''} ${prod} ${pres}`);
  }

  const GENERICO = {
    'Recetado': '1 anteojo recetado',
    'PAMI': '1 anteojo recetado',
    'Sol': '1 par de anteojos de sol',
    'Pase': '1 armazón',
    'Lentes': '1 par de lentes de contacto',
    'Liquidos': '1 líquido para lentes de contacto',
    'Accesorio': '1 accesorio óptico',
    'Taller': 'Reparación de anteojo',
    'Reposicion C.': 'Reposición de 1 par de cristales'
  };

  // Devuelve { texto, completo }. completo=false → falta detalle, revisar antes de copiar.
  function descripcionARCA(producto, detalleJson) {
    let d = null;
    if (detalleJson) { try { d = JSON.parse(detalleJson); } catch (e) { d = null; } }
    if (!d) return { texto: GENERICO[producto] || '', completo: false };

    switch (producto) {
      case 'Recetado':
      case 'PAMI': {
        let arm = '1 anteojo recetado';
        if (limpiar(d.marca)) arm += ` marca ${limpiar(d.marca)}`;
        if (limpiar(d.codigo)) arm += ` código ${limpiar(d.codigo)}`;
        const cris = textoCristales(d.cantidad || '1 par', d.tipo, d.tratamiento);
        return { texto: `${arm} + ${cris}`, completo: !!(limpiar(d.marca) && limpiar(d.tipo)) };
      }
      case 'Lentes': {
        const partes = [];
        if (Array.isArray(d.items) && d.items.length) {
          d.items.forEach(it => partes.push(limpiar(`${textoCantContacto(it.cantidad)} ${limpiar(it.marca)} ${textoGraduacion(it.od, it.oi)}`)));
        } else if (d.marca || d.od || d.oi) {
          partes.push(limpiar(`${textoCantContacto(d.cantidad || 1)} ${limpiar(d.marca)} ${textoGraduacion(d.od, d.oi)}`));
        }
        (d.liquidos || []).forEach(it => { if (it.producto) partes.push(textoLiquido(it)); });
        if (!partes.length) return { texto: GENERICO['Lentes'], completo: false };
        return { texto: partes.join(' + '), completo: true };
      }
      case 'Liquidos': {
        const partes = (d.items || []).filter(it => it.producto).map(textoLiquido);
        if (!partes.length) return { texto: GENERICO['Liquidos'], completo: false };
        return { texto: partes.join(' + '), completo: true };
      }
      case 'Sol': {
        const t = limpiar(`1 par de anteojos de sol ${limpiar(d.marca)} ${limpiar(d.codigo)}`);
        return { texto: t, completo: !!limpiar(d.marca) };
      }
      case 'Pase': {
        let t = '1 armazón';
        if (limpiar(d.marca)) t += ` marca ${limpiar(d.marca)}`;
        if (limpiar(d.codigo)) t += ` código ${limpiar(d.codigo)}`;
        return { texto: t, completo: !!limpiar(d.marca) };
      }
      case 'Accesorio': {
        const items = (d.items || []).map(i => `1 ${limpiar(i).toLowerCase()}`);
        if (!items.length) return { texto: GENERICO['Accesorio'], completo: false };
        return { texto: items.join(' + '), completo: true };
      }
      case 'Taller': {
        const items = (d.items || []).map(i => limpiar(i).toLowerCase());
        if (!items.length) return { texto: GENERICO['Taller'], completo: false };
        return { texto: `Reparación de anteojo: ${items.join(', ')}`, completo: true };
      }
      case 'Reposicion C.': {
        const c = limpiar(d.cantidad).toLowerCase() === '2 cristales' ? '1 par' : (d.cantidad || '1 par');
        return { texto: `Reposición de ${textoCristales(c, d.tipo, d.tratamiento)}`, completo: !!limpiar(d.tipo) };
      }
      default:
        return { texto: GENERICO[producto] || '', completo: false };
    }
  }

  // Exponer para pruebas
  if (typeof window !== 'undefined') window.FacturarARCA = { descripcionARCA };
  if (typeof document === 'undefined') return;

  // ── ESTADO ──────────────────────────────────────────────────
  const hoy = new Date();
  let fMes = hoy.getMonth(), fAnio = hoy.getFullYear();
  let fRegs = [];               // operaciones del mes
  let fOrigen = {};             // numero_orden → {producto, detalle} para los cobros de Saldo
  let fEdits = {};              // id → texto editado a mano (no se guarda)
  let fFiltroPago = 'Todas', fFiltroEstado = 'Pendientes';
  let fHayColumna = true;
  let fCargando = false;

  // ── ESTILOS ─────────────────────────────────────────────────
  const css = `
    .fc-kpis{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}
    .fc-kpi{background:white;border-radius:16px;padding:16px;box-shadow:0 2px 6px rgba(0,0,0,0.05);text-align:center}
    .fc-kpi.azul{background:#1E3A8A}
    .fc-kpi .l{font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px}
    .fc-kpi.azul .l{color:#93c5fd}
    .fc-kpi .v{font-size:22px;font-weight:900;color:#1e293b;margin-top:4px}
    .fc-kpi.azul .v{color:white}
    .fc-kpi .s{font-size:12px;color:#94a3b8;margin-top:2px}
    .fc-kpi.azul .s{color:#93c5fd}
    .fc-chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
    .fc-chip{padding:7px 14px;border-radius:20px;border:1.5px solid #e2e8f0;background:white;font-family:'Nunito',sans-serif;font-size:12px;font-weight:700;color:#64748b;cursor:pointer}
    .fc-chip.activo{background:#1E3A8A;border-color:#1E3A8A;color:white}
    .fc-card{background:white;border-radius:16px;padding:14px 16px;box-shadow:0 2px 6px rgba(0,0,0,0.05);margin-bottom:10px;border-left:4px solid #1E3A8A;transition:opacity .3s}
    .fc-card.hecha{border-left-color:#10b981;background:#f8fafc}
    .fc-card.saliendo{opacity:0}
    .fc-top{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
    .fc-cli{font-size:15px;font-weight:800;color:#1e293b}
    .fc-sub{font-size:12px;color:#64748b;margin-top:2px}
    .fc-monto{font-size:18px;font-weight:900;color:#1e293b;white-space:nowrap}
    .fc-desc{width:100%;box-sizing:border-box;margin:10px 0 8px;padding:10px 12px;border:1.5px solid #d0d9f0;border-radius:12px;background:#f0f4ff;font-family:'Nunito',sans-serif;font-size:14px;font-weight:700;color:#1E3A8A;resize:vertical;min-height:48px;line-height:1.4;outline:none}
    .fc-desc:focus{border-color:#1E3A8A;background:white}
    .fc-aviso{font-size:12px;font-weight:700;color:#b45309;background:#fffbeb;border-radius:8px;padding:6px 10px;margin-bottom:8px}
    .fc-acciones{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    .fc-btn{background:#1E3A8A;color:white;border:none;border-radius:10px;padding:9px 12px;font-family:'Nunito',sans-serif;font-size:13px;font-weight:800;cursor:pointer}
    .fc-btn.sec{background:#eff6ff;color:#1E3A8A}
    .fc-btn.ok{background:#10b981;color:white}
    .fc-check{margin-left:auto;display:flex;align-items:center;gap:6px;font-size:13px;font-weight:800;color:#64748b;cursor:pointer;user-select:none}
    .fc-check input{width:20px;height:20px;accent-color:#10b981;cursor:pointer}
    .fc-card.hecha .fc-check{color:#10b981}
    .fc-banner{background:#fef2f2;border:2px solid #fca5a5;border-radius:14px;padding:12px 14px;margin-bottom:14px;font-size:13px;font-weight:700;color:#991b1b}
  `;
  const st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  // ── INYECTAR PESTAÑA Y PANEL ───────────────────────────────
  const tabs = document.querySelector('.main-tabs');
  if (tabs && !document.getElementById('maintab-facturar')) {
    const b = document.createElement('button');
    b.className = 'main-tab';
    b.id = 'maintab-facturar';
    b.textContent = '🧾 Facturar';
    b.setAttribute('onclick', "cambiarMainTab('facturar')");
    tabs.appendChild(b);
  }
  const panelHist = document.getElementById('panel-historial');
  if (panelHist && !document.getElementById('panel-facturar')) {
    const p = document.createElement('div');
    p.id = 'panel-facturar';
    p.style.display = 'none';
    p.innerHTML = `
      <div class="mes-selector">
        <button class="mes-btn" onclick="facturarCambiarMes(-1)">‹</button>
        <span class="mes-nombre" id="fc-mes-nombre">—</span>
        <button class="mes-btn" id="fc-mes-next" onclick="facturarCambiarMes(1)">›</button>
      </div>
      <div id="fc-banner"></div>
      <div class="fc-kpis">
        <div class="fc-kpi azul"><div class="l">Falta facturar</div><div class="v" id="fc-k-pend">$0</div><div class="s" id="fc-k-pend-n">0 operaciones</div></div>
        <div class="fc-kpi"><div class="l">Ya facturado</div><div class="v" id="fc-k-fac" style="color:#10b981">$0</div><div class="s" id="fc-k-fac-n">0 operaciones</div></div>
      </div>
      <div class="fc-chips" id="fc-chips-pago"></div>
      <div class="fc-chips" id="fc-chips-estado" style="margin-bottom:14px"></div>
      <div id="fc-lista"><p class="empty">Cargando...</p></div>`;
    panelHist.parentNode.insertBefore(p, panelHist.nextSibling);
  }

  // ── EXTENDER cambiarMainTab (sin tocar caja.html) ──────────
  const _cambiarMainTabOriginal = window.cambiarMainTab;
  window.cambiarMainTab = function (tab) {
    const pf = document.getElementById('panel-facturar');
    if (tab === 'facturar') {
      document.querySelectorAll('.main-tab').forEach(t => t.classList.remove('activo'));
      document.getElementById('maintab-facturar').classList.add('activo');
      document.getElementById('panel-hoy').style.display = 'none';
      document.getElementById('panel-historial').style.display = 'none';
      if (pf) pf.style.display = 'block';
      cargarFacturar();
      return;
    }
    if (pf) pf.style.display = 'none';
    _cambiarMainTabOriginal(tab);
  };

  // ── CARGA ───────────────────────────────────────────────────
  function montoCobrado(r) {
    const ac = parseFloat(r.a_cuenta) || 0;
    return Math.round(ac > 0 ? ac : (parseFloat(r.total) || 0));
  }

  async function cargarFacturar() {
    if (fCargando) return;
    fCargando = true;
    const mes = `${fAnio}-${String(fMes + 1).padStart(2, '0')}`;
    const nA = fMes === 11 ? fAnio + 1 : fAnio, nM = fMes === 11 ? 1 : fMes + 2;
    const mesSig = `${nA}-${String(nM).padStart(2, '0')}`;
    document.getElementById('fc-mes-nombre').textContent = `${MESES[fMes]} ${fAnio}`;
    document.getElementById('fc-mes-next').disabled = (fAnio > hoy.getFullYear()) || (fAnio === hoy.getFullYear() && fMes >= hoy.getMonth());
    document.getElementById('fc-lista').innerHTML = '<p class="empty">Cargando...</p>';

    try {
      const { data, error } = await db.from('registros').select('*')
        .gte('fecha', mes + '-01').lt('fecha', mesSig + '-01')
        .in('forma_pago', FORMAS_FACTURAR)
        .order('fecha', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      fRegs = (data || []).filter(r => (parseFloat(r.egreso) || 0) === 0 && montoCobrado(r) > 0);
      fHayColumna = fRegs.length === 0 || Object.prototype.hasOwnProperty.call(fRegs[0], 'facturada');

      // Cobros de saldo: buscar la venta original de esa orden para tomar su descripción
      const ordenes = [...new Set(fRegs.filter(r => r.producto === 'Saldo' && !r.detalle_producto && (r.numero_orden || '').trim()).map(r => r.numero_orden.trim()))];
      fOrigen = {};
      if (ordenes.length) {
        const { data: orig } = await db.from('registros')
          .select('numero_orden,producto,detalle_producto,fecha,created_at')
          .in('numero_orden', ordenes).neq('producto', 'Saldo')
          .order('fecha', { ascending: true }).order('created_at', { ascending: true });
        (orig || []).forEach(o => {
          const k = (o.numero_orden || '').trim();
          if (!k || !o.producto) return;
          // Preferir la que tenga detalle cargado
          if (!fOrigen[k] || (o.detalle_producto && !fOrigen[k].detalle)) fOrigen[k] = { producto: o.producto, detalle: o.detalle_producto };
        });
      }
    } catch (e) {
      document.getElementById('fc-lista').innerHTML = `<div class="empty">Error al cargar: ${escH(e.message || e)}</div>`;
      fCargando = false;
      return;
    }
    fCargando = false;
    renderFacturar();
  }

  function descripcionDe(r) {
    if (fEdits[String(r.id)] !== undefined) return { texto: fEdits[String(r.id)], completo: true };
    if (r.producto === 'Saldo' && !r.detalle_producto) {
      const o = fOrigen[(r.numero_orden || '').trim()];
      if (!o) return { texto: '', completo: false, sinOrigen: true };
      return descripcionARCA(o.producto, o.detalle);
    }
    return descripcionARCA(r.producto, r.detalle_producto);
  }

  // ── RENDER ──────────────────────────────────────────────────
  function renderFacturar() {
    const banner = document.getElementById('fc-banner');
    banner.innerHTML = fHayColumna ? '' : '<div class="fc-banner">⚠️ Falta correr el SQL en Supabase para poder marcar operaciones como facturadas.</div>';

    const pend = fRegs.filter(r => !r.facturada), fac = fRegs.filter(r => r.facturada);
    const suma = arr => arr.reduce((s, r) => s + montoCobrado(r), 0);
    const ops = n => `${n} operación${n !== 1 ? 'es' : ''}`;
    document.getElementById('fc-k-pend').textContent = formatPesos(suma(pend));
    document.getElementById('fc-k-pend-n').textContent = ops(pend.length);
    document.getElementById('fc-k-fac').textContent = formatPesos(suma(fac));
    document.getElementById('fc-k-fac-n').textContent = ops(fac.length);

    const chip = (grupo, val, sel) => `<button class="fc-chip${val === sel ? ' activo' : ''}" onclick="facturarFiltro('${grupo}','${val}')">${val}</button>`;
    document.getElementById('fc-chips-pago').innerHTML = ['Todas', ...FORMAS_FACTURAR].map(v => chip('pago', v, fFiltroPago)).join('');
    document.getElementById('fc-chips-estado').innerHTML = ['Pendientes', 'Facturadas', 'Todas'].map(v => chip('estado', v, fFiltroEstado)).join('');

    let items = fRegs;
    if (fFiltroPago !== 'Todas') items = items.filter(r => r.forma_pago === fFiltroPago);
    if (fFiltroEstado === 'Pendientes') items = items.filter(r => !r.facturada);
    if (fFiltroEstado === 'Facturadas') items = items.filter(r => r.facturada);

    const lista = document.getElementById('fc-lista');
    if (!items.length) {
      lista.innerHTML = `<div class="empty">${fFiltroEstado === 'Pendientes' && fRegs.length ? '✅ No queda nada por facturar con este filtro' : 'Sin operaciones para este filtro'}</div>`;
      return;
    }

    lista.innerHTML = items.map(r => {
      const id = String(r.id);
      const desc = descripcionDe(r);
      const esSena = (parseFloat(r.a_cuenta) || 0) > 0 && r.producto !== 'Saldo';
      const [, m, d] = r.fecha.split('-');
      const aviso = desc.sinOrigen
        ? '<div class="fc-aviso">⚠️ No encontré la venta original de esta orden. Escribí la descripción a mano.</div>'
        : (!desc.completo ? '<div class="fc-aviso">⚠️ Falta detalle cargado. Revisá o completá antes de copiar.</div>' : '');
      const tipoTag = esSena ? ' · <span style="color:#b45309;font-weight:800">Seña</span>' : (r.producto === 'Saldo' ? ' · <span style="color:#7c3aed;font-weight:800">Saldo</span>' : '');
      return `<div class="fc-card${r.facturada ? ' hecha' : ''}" id="fc-card-${escH(id)}">
        <div class="fc-top">
          <div>
            <div class="fc-cli">${escH(r.nombre_cliente || 'Sin nombre')}</div>
            <div class="fc-sub">${d}/${m} · ${escH(r.forma_pago || '—')}${r.numero_orden ? ' · #' + escH(r.numero_orden) : ''}${tipoTag}</div>
          </div>
          <div class="fc-monto">${formatPesos(montoCobrado(r))}</div>
        </div>
        <textarea class="fc-desc" id="fc-desc-${escH(id)}" rows="2" placeholder="Escribí la descripción…" oninput="facturarEditar('${escH(id)}',this.value)">${escH(desc.texto)}</textarea>
        ${aviso}
        <div class="fc-acciones">
          <button class="fc-btn" onclick="facturarCopiar('desc','${escH(id)}',this)">📋 Copiar descripción</button>
          <button class="fc-btn sec" onclick="facturarCopiar('monto','${escH(id)}',this)">📋 Copiar monto</button>
          ${esViewer ? '' : `<label class="fc-check"><input type="checkbox" ${r.facturada ? 'checked' : ''} ${fHayColumna ? '' : 'disabled'} onchange="facturarMarcar('${escH(id)}',this.checked)"> Facturada</label>`}
        </div>
      </div>`;
    }).join('');
  }

  // ── ACCIONES ────────────────────────────────────────────────
  async function copiarTexto(texto) {
    try {
      if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(texto); return true; }
    } catch (e) { /* sigue al plan B */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = texto; ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, texto.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  window.facturarCopiar = async function (que, id, btn) {
    const r = fRegs.find(x => String(x.id) === String(id));
    if (!r) return;
    let texto;
    if (que === 'monto') texto = String(montoCobrado(r));
    else texto = (document.getElementById('fc-desc-' + id)?.value || '').trim();
    if (!texto) { alert('La descripción está vacía. Escribila antes de copiar.'); return; }
    const ok = await copiarTexto(texto);
    const original = btn.textContent;
    btn.textContent = ok ? '✅ Copiado' : '❌ No se pudo copiar';
    btn.classList.add('ok');
    setTimeout(() => { btn.textContent = original; btn.classList.remove('ok'); }, 1300);
  };

  window.facturarEditar = function (id, valor) { fEdits[String(id)] = valor; };

  window.facturarMarcar = async function (id, marcada) {
    if (esViewer) return;
    const r = fRegs.find(x => String(x.id) === String(id));
    if (!r) return;
    const anterior = !!r.facturada;
    r.facturada = marcada;
    const card = document.getElementById('fc-card-' + id);
    const seVa = (fFiltroEstado === 'Pendientes' && marcada) || (fFiltroEstado === 'Facturadas' && !marcada);
    if (card) card.classList.toggle('hecha', marcada);
    const { error } = await db.from('registros').update({ facturada: marcada }).eq('id', r.id);
    if (error) {
      r.facturada = anterior;
      alert('No se pudo guardar: ' + error.message + (/facturada/i.test(error.message) ? '\n\nFalta correr el SQL en Supabase.' : ''));
      renderFacturar();
      return;
    }
    if (seVa && card) { card.classList.add('saliendo'); setTimeout(renderFacturar, 320); }
    else renderFacturar();
  };

  window.facturarFiltro = function (grupo, val) {
    if (grupo === 'pago') fFiltroPago = val; else fFiltroEstado = val;
    renderFacturar();
  };

  window.facturarCambiarMes = function (dir) {
    let m = fMes + dir, a = fAnio;
    if (m > 11) { m = 0; a++; }
    if (m < 0) { m = 11; a--; }
    if (a > hoy.getFullYear() || (a === hoy.getFullYear() && m > hoy.getMonth())) return;
    fMes = m; fAnio = a; fEdits = {};
    cargarFacturar();
  };
})();
