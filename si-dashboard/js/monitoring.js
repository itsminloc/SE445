(function () {
  'use strict';

  const tabRealtime = document.getElementById('tabRealtime');
  const tabScenario = document.getElementById('tabScenario');
  const tabSimulator = document.getElementById('tabSimulator');
  const tabCeo = document.getElementById('tabCeo');
  const sectionRealtime = document.getElementById('sectionRealtime');
  const sectionScenario = document.getElementById('sectionScenario');
  const sectionSimulator = document.getElementById('sectionSimulator');
  const sectionCeo = document.getElementById('sectionCeo');

  const containerGrid = document.getElementById('containerGrid');
  const brokerTotal = document.getElementById('brokerTotal');
  const brokerProcessed = document.getElementById('brokerProcessed');
  const brokerRetries = document.getElementById('brokerRetries');
  const brokerModeTag = document.getElementById('brokerModeTag');
  const dlqCountBadge = document.getElementById('dlqCountBadge');
  const dlqTableBody = document.getElementById('dlqTableBody');
  const scenarioGrid = document.getElementById('scenarioGrid');
  const terminalLogs = document.getElementById('terminalLogs');
  const logFilterSelect = document.getElementById('logFilterSelect');
  const sseIndicator = document.getElementById('sseIndicator');

  let currentFilter = 'ALL';
  let logsStore = [];

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function switchTab(name) {
    const map = [
      [tabRealtime, sectionRealtime, 'realtime'],
      [tabScenario, sectionScenario, 'scenario'],
      [tabSimulator, sectionSimulator, 'simulator'],
      [tabCeo, sectionCeo, 'ceo'],
    ];
    for (const [btn, sec, key] of map) {
      btn.classList.toggle('is-active', key === name);
      sec.classList.toggle('is-visible', key === name);
    }
    if (name === 'simulator') refreshSimState();
    if (name === 'ceo' && typeof window.oriRefreshCeoDashboard === 'function') window.oriRefreshCeoDashboard();
  }

  tabRealtime.addEventListener('click', () => switchTab('realtime'));
  tabScenario.addEventListener('click', () => switchTab('scenario'));
  tabSimulator.addEventListener('click', () => switchTab('simulator'));
  tabCeo.addEventListener('click', () => switchTab('ceo'));
  document.getElementById('btnRefreshAll').addEventListener('click', () => {
    refreshSnapshot();
    refreshSimState();
    if (typeof window.oriRefreshCeoDashboard === 'function') window.oriRefreshCeoDashboard();
  });

  function renderTelemetry(data) {
    if (!data) return;
    brokerTotal.textContent = String(data.broker?.metrics?.published ?? 0);
    brokerProcessed.textContent = String(data.broker?.metrics?.processed ?? 0);
    brokerRetries.textContent = String(data.broker?.metrics?.retries ?? 0);
    brokerModeTag.textContent = `${data.broker?.mode || 'IN_MEMORY'} (${data.broker?.online ? 'ONLINE' : 'OFFLINE'})`;
    dlqCountBadge.textContent = `${data.dlq?.total ?? 0} msgs [${data.dlq?.pending ?? 0} pending]`;

    containerGrid.innerHTML = (data.containers || [])
      .map((c) => {
        const cls = c.status === 'HEALTHY' ? 'is-healthy' : c.status === 'DEGRADED' ? 'is-degraded' : 'is-unhealthy';
        return `
          <div class="cnt-card">
            <div class="cnt-top">
              <div>
                <div class="cnt-name">${escapeHtml(c.name)}</div>
                <div class="cnt-role">${escapeHtml(c.role)}</div>
              </div>
              <span class="cnt-status-badge ${cls}">${escapeHtml(c.status)}</span>
            </div>
            <div class="cnt-metrics-table">
              <div class="cnt-metric-row"><span>PORT</span><span>:${c.port}</span></div>
              <div class="cnt-metric-row"><span>LATENCY</span><span>${c.latencyMs}ms</span></div>
              <div class="cnt-metric-row"><span>UPTIME</span><span>${c.uptimeSeconds}s</span></div>
            </div>
          </div>`;
      })
      .join('');

    const dlqMsgs = data.dlq?.messages || [];
    if (dlqMsgs.length === 0) {
      dlqTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-dim);">[ DEAD LETTER QUEUE RỖNG — KHÔNG CÓ MESSAGE LỖI ]</td></tr>';
    } else {
      dlqTableBody.innerHTML = dlqMsgs
        .map((m) => `
          <tr>
            <td>${escapeHtml(m.event?.eventId || m.id)}</td>
            <td>${escapeHtml(m.queueName)}</td>
            <td style="color:var(--color-amber);">${escapeHtml(m.errorReason)}</td>
            <td>${m.retryCount}/${m.maxRetries}</td>
            <td><span class="dlq-status-badge ${m.status === 'PENDING_INSPECTION' ? 'is-pending' : 'is-replayed'}">${escapeHtml(m.status)}</span></td>
            <td style="text-align:right;">
              ${m.status === 'PENDING_INSPECTION' ? `<button class="btn-replay" data-dlq="${escapeHtml(m.id)}">Replay</button>` : 'RESOLVED'}
            </td>
          </tr>`)
        .join('');

      dlqTableBody.querySelectorAll('.btn-replay').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-dlq');
          await fetch(`/api/v1/monitoring/dlq/${id}/replay`, { method: 'POST' });
          refreshSnapshot();
        });
      });
    }
  }

  function renderLogs() {
    terminalLogs.innerHTML = '';
    const list = currentFilter === 'ALL' ? logsStore : logsStore.filter((l) => l.channel === currentFilter);
    for (const log of list.slice().reverse()) {
      const div = document.createElement('div');
      div.className = `log-entry level-${escapeHtml(log.level)}`;
      div.innerHTML = `<span class="log-time">[${escapeHtml(log.timestamp.slice(11, 23))}]</span><span class="log-channel">[${escapeHtml(log.channel)}]</span><span class="log-source">&lt;${escapeHtml(log.source)}&gt;</span><span class="log-msg">${escapeHtml(log.message)}</span>`;
      terminalLogs.appendChild(div);
    }
    terminalLogs.scrollTop = terminalLogs.scrollHeight;
  }

  logFilterSelect.addEventListener('change', (e) => {
    currentFilter = e.target.value;
    renderLogs();
  });

  document.getElementById('btnClearLogs').addEventListener('click', () => {
    logsStore = [];
    renderLogs();
  });

  document.getElementById('btnClearDlq').addEventListener('click', async () => {
    await fetch('/api/v1/monitoring/dlq/clear', { method: 'POST' });
    refreshSnapshot();
  });

  async function refreshSnapshot() {
    const res = await fetch('/api/v1/monitoring/telemetry');
    const json = await res.json();
    if (json.success) {
      renderTelemetry(json.data);
      if (logsStore.length === 0 && json.data.recentLogs) {
        logsStore = json.data.recentLogs;
        renderLogs();
      }
    }
  }

  async function loadScenarios() {
    const res = await fetch('/api/v1/monitoring/scenarios');
    const json = await res.json();
    if (!json.success) return;
    scenarioGrid.innerHTML = json.data
      .map((s) => `
        <div class="scenario-card">
          <span class="scenario-card-badge">${escapeHtml(s.category)} • ${escapeHtml(s.tcRef)}</span>
          <div class="scenario-name">${escapeHtml(s.name)}</div>
          <div class="scenario-desc">${escapeHtml(s.description)}</div>
          <div class="scenario-outcome">KẾT QUẢ MONG ĐỢI: ${escapeHtml(s.expectedOutcome)}</div>
          <button class="btn-run-scenario" data-sid="${escapeHtml(s.id)}">KÍCH HOẠT KỊCH BẢN</button>
          <div class="scenario-trace-box" id="trace-${escapeHtml(s.id)}"></div>
        </div>`)
      .join('');

    scenarioGrid.querySelectorAll('.btn-run-scenario').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const sid = btn.getAttribute('data-sid');
        const box = document.getElementById(`trace-${sid}`);
        btn.disabled = true;
        btn.textContent = 'ĐANG CHẠY...';
        box.classList.add('is-open');
        try {
          const r = await fetch(`/api/v1/monitoring/scenarios/${sid}/run`, { method: 'POST' });
          const j = await r.json();
          const d = j.data;
          box.innerHTML = `<div style="color:var(--color-green);font-weight:700;margin-bottom:6px;">STATUS: ${escapeHtml(d.status)} (${d.executionTimeMs}ms)</div>` +
            d.steps.map((st) => `<div>• Bước ${st.stepNumber} [${escapeHtml(st.status)}]: ${escapeHtml(st.stepName)} — ${escapeHtml(st.details)}</div>`).join('') +
            `<pre style="margin-top:8px;color:var(--color-cyan);max-height:130px;overflow:auto;">${escapeHtml(JSON.stringify(d.outputPayload, null, 2))}</pre>`;
          btn.textContent = `✓ PASS (${d.executionTimeMs}ms)`;
        } catch (err) {
          box.innerHTML = `<div style="color:var(--color-red);">ERROR: ${escapeHtml(err.message)}</div>`;
          btn.textContent = '✕ THẤT BẠI';
        } finally {
          setTimeout(() => { btn.disabled = false; btn.textContent = 'KÍCH HOẠT KỊCH BẢN'; }, 2500);
          refreshSnapshot();
        }
      });
    });
  }

  async function refreshSimState() {
    try {
      const [wms, crm, tms] = await Promise.all([
        fetch('/api/v1/wms/inventory').then((r) => r.json()),
        fetch('/api/v1/crm/customers').then((r) => r.json()),
        fetch('/api/v1/tms/shipments').then((r) => r.json()),
      ]);
      document.getElementById('wmsStateBox').textContent = JSON.stringify(wms.items, null, 2);
      document.getElementById('crmTmsStateBox').textContent = JSON.stringify({ customers: crm.customers, shipments: tms.shipments }, null, 2);
    } catch {}
  }

  document.getElementById('btnSubmitOrder').addEventListener('click', async () => {
    const out = document.getElementById('orderSimOutput');
    const body = {
      channel: document.getElementById('simChannel').value,
      customerId: document.getElementById('simCustomer').value,
      items: [{ sku: document.getElementById('simSku').value, quantity: Number(document.getElementById('simQty').value), unitPrice: 150000 }],
      simulateTmsFailure: document.getElementById('simTmsFail').checked,
    };
    const res = await fetch('/api/v1/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json();
    if (res.status === 202 && json.orderId) {
      await new Promise((r) => setTimeout(r, 120));
      const detail = await fetch(`/api/v1/orders/${json.orderId}`).then((r) => r.json());
      out.textContent = `HTTP ${res.status} Accepted\n` + JSON.stringify({ accepted: json, orderRecordAfterAsync: detail }, null, 2);
    } else {
      out.textContent = `HTTP ${res.status}\n` + JSON.stringify(json, null, 2);
    }
    refreshSimState();
    refreshSnapshot();
  });

  document.getElementById('btnIngestPos').addEventListener('click', async () => {
    const out = document.getElementById('posSimOutput');
    const res = await fetch('/api/v1/pos/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeId: document.getElementById('posStoreId').value,
        rawPayload: document.getElementById('posRawInput').value,
        autoSubmitOrder: true,
      }),
    });
    const json = await res.json();
    out.textContent = `HTTP ${res.status}\n` + JSON.stringify(json, null, 2);
    refreshSimState();
    refreshSnapshot();
  });

  function connectSse() {
    const src = new EventSource('/api/v1/monitoring/stream');
    src.addEventListener('telemetry:init', (e) => renderTelemetry(JSON.parse(e.data)));
    src.addEventListener('telemetry:tick', (e) => renderTelemetry(JSON.parse(e.data)));
    src.addEventListener('log:new', (e) => {
      logsStore.unshift(JSON.parse(e.data));
      if (logsStore.length > 200) logsStore.pop();
      renderLogs();
    });
    src.onerror = () => {
      sseIndicator.style.color = 'var(--color-amber)';
    };
  }

  refreshSnapshot();
  loadScenarios();
  connectSse();
})();
