// ============================================================
// caja_pdf.js — Plugin exportación PDF mensual para caja.html
// Requiere: jsPDF CDN, html2canvas CDN (ya incluidos en caja.html)
// ============================================================

(function () {
  'use strict';

  // ── Inyectar botón PDF y template al cargar la página ──
  document.addEventListener('DOMContentLoaded', function () {
    // Esperar un tick para que los otros scripts terminen de inicializar
    setTimeout(function () {
      _inyectarBotonPDF();
      _inyectarTemplateDiv();
    }, 100);
  });

  function _inyectarBotonPDF() {
    const btnExcel = document.getElementById('btn-exportar-excel');
    if (!btnExcel) return;
    const btnPDF = document.createElement('button');
    btnPDF.id = 'btn-exportar-pdf';
    btnPDF.className = 'btn-exportar-excel';
    btnPDF.style.cssText = 'background:#dc2626;margin-bottom:10px';
    btnPDF.textContent = '📄 Exportar PDF del mes';
    btnPDF.addEventListener('click', exportarPDFCaja);
    btnExcel.insertAdjacentElement('afterend', btnPDF);
  }

  function _inyectarTemplateDiv() {
    if (document.getElementById('tpl-pdf-caja')) return;
    const div = document.createElement('div');
    div.id = 'tpl-pdf-caja';
    div.style.cssText = 'position:fixed;left:-9999px;top:0;width:820px;background:white;font-family:Nunito,sans-serif;padding:0';
    document.body.appendChild(div);
  }

  // ── Función principal exportarPDFCaja (global) ──────────────────────────
  window.exportarPDFCaja = async function () {
    const btn = document.getElementById('btn-exportar-pdf');
    if (btn) { btn.textContent = '⏳ Generando PDF...'; btn.disabled = true; }

    try {
      // Acceder a las variables globales de caja.html
      const regs    = (typeof registrosMes !== "undefined" ? registrosMes : []);
      const cierres = (typeof cierresMes   !== "undefined" ? cierresMes   : []);
      const gastos  = (typeof gastosMes    !== "undefined" ? gastosMes    : []);
      const emps    = (typeof empleados    !== "undefined" ? empleados    : []);
      const meses   = (typeof MESES !== "undefined" ? MESES : ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']);
      const hMes    = (typeof histMes  !== "undefined" ? histMes  : new Date().getMonth());
      const hAnio   = (typeof histAnio !== "undefined" ? histAnio : new Date().getFullYear());

      const mes      = `${hAnio}-${String(hMes + 1).padStart(2, '0')}`;
      const mesLabel = `${meses[hMes]} ${hAnio}`;

      // ── Métricas ───────────────────────────────────────────────────────
      const fp = n => '$' + Math.round(n || 0).toLocaleString('es-AR');

      const ventas  = regs.filter(r => !r.egreso || parseFloat(r.egreso) === 0);
      const egresos = regs.filter(r => parseFloat(r.egreso) > 0);

      const totalFact  = ventas.filter(r => r.producto !== 'Saldo').reduce((s, r) => s + (parseFloat(r.total) || 0), 0);
      const totalCob   = ventas.reduce((s, r) => s + (parseFloat(r.a_cuenta) > 0 ? parseFloat(r.a_cuenta) : parseFloat(r.total) || 0), 0);
      const saldosAnt  = ventas.filter(r => r.producto === 'Saldo').reduce((s, r) => s + (parseFloat(r.a_cuenta) > 0 ? parseFloat(r.a_cuenta) : parseFloat(r.total) || 0), 0);
      const totalEgr   = egresos.reduce((s, r) => s + (parseFloat(r.egreso) || 0), 0);
      const neto       = totalCob - totalEgr;
      const cantVentas = ventas.filter(r => r.producto !== 'Saldo').length;
      const ticket     = cantVentas > 0 ? Math.round(totalFact / cantVentas) : 0;

      const formas = ['Efectivo', 'T. Credito', 'Debito', 'QR', 'Transferencia'];
      const porF = {};
      formas.forEach(f => {
        porF[f] = ventas.filter(r => r.forma_pago === f)
          .reduce((s, r) => s + (parseFloat(r.a_cuenta) > 0 ? parseFloat(r.a_cuenta) : parseFloat(r.total) || 0), 0);
      });

      const nombresVend = emps.length > 0 ? emps.map(e => e.nombre) : ['Sandra', 'Valentina', 'Andres', 'Luis'];
      const ranking = nombresVend.map(v => ({
        nombre: v,
        total: ventas.filter(r => r.vendedor === v).reduce((s, r) => s + (parseFloat(r.a_cuenta) > 0 ? parseFloat(r.a_cuenta) : parseFloat(r.total) || 0), 0),
        cant: ventas.filter(r => r.vendedor === v).length
      })).filter(v => v.total > 0).sort((a, b) => b.total - a.total);

      const PRODS = ['Recetado', 'Sol', 'Lentes', 'Taller', 'Accesorio', 'Saldo', 'Liquidos', 'Pase', 'PAMI', 'Reposicion C.'];
      const prodData = PRODS.map(p => ({
        nombre: p,
        total: ventas.filter(r => r.producto === p).reduce((s, r) => s + (parseFloat(r.total) || 0), 0),
        cant: ventas.filter(r => r.producto === p).length
      })).filter(p => p.total > 0).sort((a, b) => b.total - a.total);

      const dias = [...new Set(regs.map(r => r.fecha))].sort().reverse();

      // ── Construir HTML del template ────────────────────────────────────
      const medallas = ['🥇', '🥈', '🥉', '4°', '5°'];
      const fmtFecha = f => { if (!f) return '—'; const [y, m, d] = f.split('-'); return `${d}/${m}/${y}`; };

      const html = `
        <div style="background:#1E3A8A;padding:24px 32px;display:flex;justify-content:space-between;align-items:center">
          <div>
            <img src="logo_reporte.png" style="height:48px;object-fit:contain;display:block" onerror="this.style.display='none'" />
            <div style="color:white;font-size:22px;font-weight:900;margin-top:6px">OLVISIÓN</div>
            <div style="color:#93c5fd;font-size:13px;margin-top:2px;font-weight:600">📊 Reporte Mensual · ${mesLabel}</div>
          </div>
          <div style="text-align:right">
            <div style="color:#93c5fd;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px">💵 Neto en caja</div>
            <div style="color:white;font-size:30px;font-weight:900">${fp(neto)}</div>
            <div style="color:#93c5fd;font-size:11px;margin-top:2px">Generado ${new Date().toLocaleDateString('es-AR')}</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(4,1fr);border-bottom:2px solid #e2e8f0">
          ${[
            { lbl: 'Facturado', val: fp(totalFact), color: '#1E3A8A' },
            { lbl: 'Total cobrado', val: fp(totalCob), color: '#10b981' },
            { lbl: 'Egresos caja', val: fp(totalEgr), color: '#ef4444' },
            { lbl: 'Ticket promedio', val: fp(ticket), color: '#f59e0b' },
          ].map(s => `<div style="padding:16px 20px;border-right:1px solid #e2e8f0;text-align:center">
            <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">${s.lbl}</div>
            <div style="font-size:20px;font-weight:900;color:${s.color}">${s.val}</div>
          </div>`).join('')}
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;padding:24px 32px">
          <div>
            <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px">💳 Formas de pago</div>
            ${formas.filter(f => porF[f] > 0).map(f => `
              <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f1f5f9">
                <span style="font-size:13px;color:#475569;font-weight:700">${f}</span>
                <span style="font-size:14px;font-weight:900;color:#1e293b">${fp(porF[f])}</span>
              </div>`).join('') || '<div style="color:#94a3b8;font-size:13px">Sin datos</div>'}
            ${saldosAnt > 0 ? `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f1f5f9">
              <span style="font-size:13px;color:#6366f1;font-weight:700">🔄 Saldos ant. cobrados</span>
              <span style="font-size:14px;font-weight:900;color:#6366f1">${fp(saldosAnt)}</span>
            </div>` : ''}
            ${gastos.length > 0 ? `
              <div style="margin-top:16px;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px">💸 Gastos del mes</div>
              ${[...new Set(gastos.map(g => g.categoria))].map(cat => {
                const t = gastos.filter(g => g.categoria === cat).reduce((s, g) => s + (parseFloat(g.monto) || 0), 0);
                return `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f8fafc">
                  <span style="font-size:12px;color:#64748b;font-weight:600">${cat}</span>
                  <span style="font-size:13px;font-weight:800;color:#ef4444">-${fp(t)}</span>
                </div>`;
              }).join('')}
              <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:2px solid #f1f5f9;margin-top:4px">
                <span style="font-size:13px;color:#475569;font-weight:800">Total gastos</span>
                <span style="font-size:14px;font-weight:900;color:#ef4444">-${fp(gastos.reduce((s, g) => s + (parseFloat(g.monto) || 0), 0))}</span>
              </div>` : ''}
          </div>
          <div>
            <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px">🏆 Ranking vendedoras</div>
            ${ranking.map((v, i) => `
              <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f1f5f9">
                <span style="font-size:16px;width:24px;text-align:center">${medallas[i] || ''}</span>
                <div style="flex:1">
                  <div style="font-size:13px;font-weight:800;color:#1e293b">${v.nombre}</div>
                  <div style="font-size:11px;color:#94a3b8">${v.cant} venta${v.cant !== 1 ? 's' : ''}</div>
                </div>
                <span style="font-size:14px;font-weight:900;color:#1E3A8A">${fp(v.total)}</span>
              </div>`).join('') || '<div style="color:#94a3b8;font-size:13px">Sin datos</div>'}
            <div style="margin-top:16px;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px">📦 Por producto</div>
            ${prodData.slice(0, 7).map(p => `
              <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f8fafc">
                <span style="font-size:12px;color:#475569;font-weight:700">${p.nombre} <span style="color:#94a3b8;font-weight:600">(${p.cant})</span></span>
                <span style="font-size:13px;font-weight:900;color:#1e293b">${fp(p.total)}</span>
              </div>`).join('') || '<div style="color:#94a3b8;font-size:13px">Sin datos</div>'}
          </div>
        </div>

        <div style="padding:0 32px 24px">
          <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px">📅 Días del mes</div>
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead>
              <tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0">
                <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase">Fecha</th>
                <th style="padding:8px 12px;text-align:right;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase">Operaciones</th>
                <th style="padding:8px 12px;text-align:right;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase">Neto</th>
                <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase">Estado</th>
              </tr>
            </thead>
            <tbody>
              ${dias.map((fecha, idx) => {
                const cierre = cierres.find(c => c.fecha === fecha);
                const opsD   = regs.filter(r => r.fecha === fecha);
                const vd     = opsD.filter(r => !r.egreso || parseFloat(r.egreso) === 0);
                const ed     = opsD.filter(r => parseFloat(r.egreso) > 0);
                const netoD  = cierre
                  ? cierre.neto
                  : vd.reduce((s, r) => s + (parseFloat(r.a_cuenta) > 0 ? parseFloat(r.a_cuenta) : parseFloat(r.total) || 0), 0)
                    - ed.reduce((s, r) => s + (parseFloat(r.egreso) || 0), 0);
                const [y, m, d] = fecha.split('-');
                const bg = idx % 2 === 0 ? 'white' : '#f9f9fb';
                return `<tr style="background:${bg};border-bottom:1px solid #f1f5f9">
                  <td style="padding:8px 12px;font-weight:700;color:#1e293b">${d}/${m}/${y}</td>
                  <td style="padding:8px 12px;text-align:right;color:#64748b">${opsD.length}</td>
                  <td style="padding:8px 12px;text-align:right;font-weight:900;color:${netoD >= 0 ? '#10b981' : '#ef4444'}">${fp(netoD)}</td>
                  <td style="padding:8px 12px;text-align:center;font-size:11px;font-weight:700;color:${cierre ? '#10b981' : '#f59e0b'}">${cierre ? '✅ Cerrado' : '⏳ Abierto'}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>

        <div style="background:#f8fafc;padding:12px 32px;text-align:center;border-top:1px solid #e2e8f0">
          <span style="font-size:11px;color:#94a3b8">Olvisión · Reporte ${mesLabel} · ${regs.length} operaciones totales</span>
        </div>
      `;

      // ── Renderizar y convertir a PDF ───────────────────────────────────
      const tplDiv = document.getElementById('tpl-pdf-caja');
      tplDiv.innerHTML = html;

      await new Promise(r => setTimeout(r, 250));

      const canvas  = await html2canvas(tplDiv, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
      const imgData = canvas.toDataURL('image/png');

      const { jsPDF } = window.jspdf;
      // Landscape A4 para que la tabla quede más legible
      const pw = 297, ph = 210;
      const imgH = (canvas.height * pw) / canvas.width;
      const pdf  = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

      let yOffset = 0, remaining = imgH, page = 0;
      while (remaining > 0) {
        if (page > 0) pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, -yOffset, pw, imgH);
        yOffset   += ph;
        remaining -= ph;
        page++;
      }
      pdf.save(`caja_${mes}.pdf`);

    } catch (e) {
      alert('Error al generar PDF: ' + e.message);
      console.error(e);
    }

    if (btn) { btn.textContent = '📄 Exportar PDF del mes'; btn.disabled = false; }
  };

})();
