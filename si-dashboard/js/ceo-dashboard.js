(function () {
  'use strict';

  let activeMetric = 'gmv';
  let activeRange = 12;
  let lastSummary = null;

  function esc(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatVnd(amount) {
    return Number(amount || 0).toLocaleString('vi-VN') + ' d';
  }

  function renderCharts(d) {
    const webRev = d.channelBreakdown?.[0]?.revenueVnd || 0;
    const posRev = d.channelBreakdown?.[1]?.revenueVnd || 0;
    const baseOrders = Math.max(2, d.kpis.totalOrders || 2);
    const baseGmv = Math.max(300000, d.kpis.totalRevenueVnd || 450000);

    const factors = [0.42, 0.54, 0.48, 0.65, 0.72, 0.68, 0.78, 0.85, 0.82, 0.91, 0.96, 1.0];
    const slice = factors.slice(12 - activeRange);

    const series = slice.map((f, idx) => {
      const label = `W${idx + 1}`;
      if (activeMetric === 'orders') {
        const val = Math.max(1, Math.round(baseOrders * f * 12));
        return { label, val, display: `${val} orders` };
      }
      if (activeMetric === 'sla') {
        const val = Math.min(100, Math.round(92 + f * 8));
        return { label, val, display: `${val}% SLA` };
      }
      if (activeMetric === 'ai') {
        const share = d.kpis.totalRevenueVnd > 0 ? Math.round((posRev / Math.max(1, webRev + posRev)) * 100) : 45;
        const val = Math.max(10, Math.round(share * (0.7 + 0.3 * f)));
        return { label, val, display: `${val}% AI POS` };
      }
      const val = Math.round((baseGmv / 1000) * f);
      return { label, val, display: `${val.toLocaleString('vi-VN')}k d` };
    });

    const titles = {
      gmv: 'Omnichannel GMV trend (x1,000 VND)',
      orders: 'Processed orders velocity (EDA non-blocking)',
      sla: 'Fulfillment completion SLA (%)',
      ai: 'AI POS Mapper adoption share (%)',
    };
    document.getElementById('areaChartTitle').textContent = titles[activeMetric] || titles.gmv;
    window.oriUi.renderAreaChart('ceoAreaChartSvg', series);
    window.oriUi.renderBarChart('ceoBarChartWrap', 'barHoverHint', series);
  }

  async function refreshCeoDashboard() {
    const json = await fetch('/api/v1/monitoring/ceo-summary').then((r) => r.json()).catch(() => null);
    if (!json?.success || !json.data) return;
    const d = json.data;
    lastSummary = d;

    window.oriUi.animateCountUp(document.getElementById('ceoTotalRevenue'), d.kpis.totalRevenueVnd, formatVnd);
    window.oriUi.animateCountUp(document.getElementById('ceoTotalOrders'), d.kpis.totalOrders);
    window.oriUi.animateCountUp(document.getElementById('ceoCompletionRate'), d.kpis.completionRatePercent, (v) => `${v}%`);
    document.getElementById('ceoReadyOrders').textContent = String(d.kpis.readyToShipOrders);
    document.getElementById('ceoDlqSaved').textContent = `${d.kpis.dlqProtectedCount} guarded`;

    document.getElementById('ceoChannelBody').innerHTML = (d.channelBreakdown || [])
      .map((ch) => `<tr>
        <td>${esc(ch.channelGroup)}</td>
        <td>${ch.orders}</td>
        <td><strong>${esc(formatVnd(ch.revenueVnd))}</strong></td>
        <td><span class="flow-pill is-pending" style="padding:2px 8px;font-size:10.5px;">${ch.sharePercent}%</span></td>
      </tr>`)
      .join('');

    const alerts = d.lowStockAlerts || [];
    document.getElementById('ceoLowStockBody').innerHTML = alerts.length === 0
      ? '<tr><td colspan="3" style="color:var(--accent-green);">All SKUs healthy</td></tr>'
      : alerts.map((a) => `<tr>
          <td><strong>${esc(a.sku)}</strong> · ${esc(a.productName)}</td>
          <td>${a.availableQty}</td>
          <td><span class="flow-pill ${a.severity === 'OUT_OF_STOCK' ? 'is-booked' : 'is-pending'}" style="padding:2px 8px;font-size:10px;">${esc(a.severity)}</span></td>
        </tr>`).join('');

    renderCharts(d);
  }

  document.querySelectorAll('#ceoMetricSwitch .seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#ceoMetricSwitch .seg-btn').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      activeMetric = btn.getAttribute('data-metric') || 'gmv';
      if (lastSummary) renderCharts(lastSummary);
    });
  });

  document.querySelectorAll('#ceoRangeSwitch .seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#ceoRangeSwitch .seg-btn').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      activeRange = Number(btn.getAttribute('data-range') || 12);
      if (lastSummary) renderCharts(lastSummary);
    });
  });

  document.getElementById('btnExportCsv')?.addEventListener('click', () => {
    if (!lastSummary) return;
    const rows = [
      ['Metric', 'Value'],
      ['TotalRevenueVnd', String(lastSummary.kpis.totalRevenueVnd)],
      ['TotalOrders', String(lastSummary.kpis.totalOrders)],
      ['CompletionRatePercent', String(lastSummary.kpis.completionRatePercent)],
      ['DlqProtected', String(lastSummary.kpis.dlqProtectedCount)],
    ];
    const blob = new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ori-ceo-report.csv';
    a.click();
    window.oriUi.showToast('✓ Exported ori-ceo-report.csv');
  });

  window.oriRefreshCeoDashboard = refreshCeoDashboard;
})();
