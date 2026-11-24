(function () {
  'use strict';

  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatVnd(amount) {
    return Number(amount || 0).toLocaleString('vi-VN') + ' d';
  }

  async function refreshCeoDashboard() {
    const root = document.getElementById('ceoDashboardContent');
    if (!root) return;
    try {
      const res = await fetch('/api/v1/monitoring/ceo-summary');
      const json = await res.json();
      if (!json.success || !json.data) return;
      const d = json.data;

      document.getElementById('ceoTotalRevenue').textContent = formatVnd(d.kpis.totalRevenueVnd);
      document.getElementById('ceoTotalOrders').textContent = String(d.kpis.totalOrders);
      document.getElementById('ceoCompletionRate').textContent = `${d.kpis.completionRatePercent}%`;
      document.getElementById('ceoDlqSaved').textContent = `${d.kpis.dlqProtectedCount} guarded`;

      const channelBody = document.getElementById('ceoChannelBody');
      channelBody.innerHTML = (d.channelBreakdown || [])
        .map(
          (ch) => `
          <tr>
            <td>${esc(ch.channelGroup)}</td>
            <td>${ch.orders}</td>
            <td>${esc(formatVnd(ch.revenueVnd))}</td>
            <td>
              <div style="display:flex;align-items:center;gap:8px;">
                <div class="ceo-bar-track"><div class="ceo-bar-fill" style="width:${ch.sharePercent}%"></div></div>
                <span>${ch.sharePercent}%</span>
              </div>
            </td>
          </tr>`
        )
        .join('');

      const lowStockBox = document.getElementById('ceoLowStockBody');
      const alerts = d.lowStockAlerts || [];
      lowStockBox.innerHTML =
        alerts.length === 0
          ? '<tr><td colspan="3" style="color:var(--color-green);">Tat ca SKU deu du ton kho an toan</td></tr>'
          : alerts
              .map(
                (a) => `
              <tr>
                <td>${esc(a.sku)} — ${esc(a.productName)}</td>
                <td>${a.availableQty}</td>
                <td><span class="dlq-status-badge ${a.severity === 'OUT_OF_STOCK' ? 'is-pending' : 'is-replayed'}">${esc(a.severity)}</span></td>
              </tr>`
              )
              .join('');

      const execOpsBox = document.getElementById('ceoOpsSummaryBox');
      execOpsBox.textContent = JSON.stringify(
        {
          businessScope: d.businessScope,
          slaBenchmark: d.slaBenchmark,
          aiPosStats: d.aiPosStats,
          topLoyaltyCustomers: d.topCustomers,
          logisticsSummary: d.logisticsSummary,
        },
        null,
        2
      );
    } catch {}
  }

  window.oriRefreshCeoDashboard = refreshCeoDashboard;
})();
