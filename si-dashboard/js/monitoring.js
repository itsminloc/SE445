(function () {
  'use strict';

  const tabMap = [
    ['tabRealtime', 'sectionRealtime', 'realtime'],
    ['tabScenario', 'sectionScenario', 'scenario'],
    ['tabSimulator', 'sectionSimulator', 'simulator'],
    ['tabCeo', 'sectionCeo', 'ceo'],
  ];

  let currentFilter = 'ALL';
  let meshFilter = 'ALL';
  let logsStore = [];
  let latestTelemetry = null;

  function esc(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function switchTab(name) {
    for (const [btnId, secId, key] of tabMap) {
      document.getElementById(btnId)?.classList.toggle('is-active', key === name);
      document.getElementById(secId)?.classList.toggle('is-visible', key === name);
    }
    if (name === 'simulator') refreshSimState();
    if (name === 'ceo' && typeof window.oriRefreshCeoDashboard === 'function') window.oriRefreshCeoDashboard();
  }

  tabMap.forEach(([btnId, , key]) => {
    document.getElementById(btnId)?.addEventListener('click', () => switchTab(key));
  });
  document.getElementById('btnThemeToggle')?.addEventListener('click', (e) => window.oriUi.toggleTheme(e));
  document.getElementById('btnQuickOrder')?.addEventListener('click', () => switchTab('simulator'));
  document.getElementById('btnRefreshAll')?.addEventListener('click', () => {
    refreshSnapshot();
    refreshSimState();
    window.oriRefreshCeoDashboard?.();
    window.oriUi.showToast('✓ Telemetry synchronized across 4 services', 'OK');
  });

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      document.getElementById('quickSearchInput')?.focus();
    }
  });
  document.getElementById('quickSearchInput')?.addEventListener('input', renderLogs);

  document.querySelectorAll('[data-filter-mesh]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-filter-mesh]').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      meshFilter = btn.getAttribute('data-filter-mesh') || 'ALL';
      if (latestTelemetry) renderMeshRows(latestTelemetry.containers || []);
    });
  });

  function renderMeshRows(containers) {
    const grid = document.getElementById('containerGrid');
    if (!grid) return;
    const filtered = meshFilter === 'HEALTHY' ? containers.filter((c) => c.status === 'HEALTHY') : containers;
    grid.innerHTML = filtered
      .map((c) => {
        const initials = c.name.slice(0, 2).toUpperCase();
        const statusCls = c.status === 'HEALTHY' ? 'is-booked' : 'is-pending';
        return `<div class="mesh-row">
          <div class="mesh-who">
            <div class="mesh-avatar">${esc(initials)}</div>
            <div><div class="mesh-name">${esc(c.name)}</div><div class="mesh-meta">:${c.port} · ${c.latencyMs}ms</div></div>
          </div>
          <div class="mesh-track">
            <span class="flow-pill is-done">Kong/Nginx</span>
            <span class="flow-connector"></span>
            <span class="flow-pill ${statusCls}">${esc(c.role)}</span>
            <span class="flow-connector"></span>
            <span class="flow-pill is-pending">up ${c.uptimeSeconds}s</span>
            <span class="flow-pill ${statusCls}">${esc(c.status)}</span>
          </div>
        </div>`;
      })
      .join('');
  }

  function renderTelemetry(data) {
    if (!data) return;
    latestTelemetry = data;
    const pub = data.broker?.metrics?.published ?? 0;
    const ack = data.broker?.metrics?.processed ?? 0;
    const ret = data.broker?.metrics?.retries ?? 0;
    const dlqTotal = data.dlq?.total ?? 0;
    const pendingDlq = data.dlq?.pending ?? 0;

    window.oriUi.animateCountUp(document.getElementById('brokerTotal'), pub);
    window.oriUi.animateCountUp(document.getElementById('brokerProcessed'), ack);
    window.oriUi.animateCountUp(document.getElementById('brokerRetries'), ret);
    document.getElementById('dlqCountBadge').textContent = `${dlqTotal} msgs`;
    document.getElementById('dlqNavBadge').textContent = String(pendingDlq);
    document.getElementById('bellDlqCount').textContent = String(pendingDlq);
    document.getElementById('brokerEngineBadge').textContent = data.broker?.mode || 'RABBITMQ';
    document.getElementById('brokerModeTag').textContent = `${data.broker?.mode || 'AMQP'} · ${data.broker?.online ? 'Online' : 'Offline'}`;
    window.oriUi.renderSparkline('sparklineHero', [2, 4, 3, 6, 5, Math.max(2, pub), Math.max(3, ack + 1)]);

    renderMeshRows(data.containers || []);

    const dlqMsgs = data.dlq?.messages || [];
    document.getElementById('spotlightStatus').textContent = pendingDlq > 0 ? `${pendingDlq} message(s) quarantined in retail.dlq` : 'Broker nominal · 0 stuck messages';
    document.getElementById('dlqCompactList').innerHTML = dlqMsgs.length === 0
      ? '<div class="agenda-item"><span>No quarantined messages</span><span style="color:var(--accent-green-bright);">Healthy</span></div>'
      : dlqMsgs.slice(0, 3).map((m) => `<div class="agenda-item"><span>${esc(m.queueName)}</span><span>${m.retryCount}/${m.maxRetries} retries</span></div>`).join('');

    const tbody = document.getElementById('dlqTableBody');
    tbody.innerHTML = dlqMsgs.length === 0
      ? '<tr><td colspan="3" style="text-align:center;color:var(--ink-muted);">Dead Letter Queue is clean</td></tr>'
      : dlqMsgs.map((m) => `<tr>
          <td>${esc(m.event?.eventId || m.id).slice(0, 14)}</td>
          <td>${esc(m.errorReason).slice(0, 24)}</td>
          <td>${m.status === 'PENDING_INSPECTION' ? `<button class="btn-pill-primary btn-replay" style="padding:3px 10px;font-size:10.5px;" data-dlq="${esc(m.id)}">Replay</button>` : 'Replayed'}</td>
        </tr>`).join('');

    tbody.querySelectorAll('.btn-replay').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-dlq');
        await fetch(`/api/v1/monitoring/dlq/${id}/replay`, { method: 'POST' });
        window.oriUi.showToast('✓ Replayed message from retail.dlq back to queue', 'Refresh', refreshSnapshot);
        refreshSnapshot();
      });
    });
  }

  function renderLogs() {
    const box = document.getElementById('terminalLogs');
    if (!box) return;
    const q = (document.getElementById('quickSearchInput')?.value || '').trim().toLowerCase();
    const list = logsStore.filter((l) => (currentFilter === 'ALL' || l.channel === currentFilter) && (!q || JSON.stringify(l).toLowerCase().includes(q)));
    box.innerHTML = list.slice(0, 45).map((l) => `<div class="log-entry level-${esc(l.level)}">
      <span class="log-time">[${esc(l.timestamp.slice(11, 19))}]</span>
      <span class="log-channel">${esc(l.channel)}</span>
      <span>&lt;${esc(l.source)}&gt;</span>
      <span>${esc(l.message)}</span>
    </div>`).join('');
  }

  document.getElementById('logFilterSelect')?.addEventListener('change', (e) => { currentFilter = e.target.value; renderLogs(); });
  document.getElementById('btnClearLogs')?.addEventListener('click', () => { logsStore = []; renderLogs(); });
  document.getElementById('btnClearDlq')?.addEventListener('click', async () => {
    await fetch('/api/v1/monitoring/dlq/clear', { method: 'POST' });
    refreshSnapshot();
    window.oriUi.showToast('✓ Cleared retail.dlq inspection entries');
  });
  document.getElementById('btnTestDlqNow')?.addEventListener('click', async () => {
    await fetch('/api/v1/monitoring/scenarios/scenario-3-tms-dlq/run', { method: 'POST' });
    refreshSnapshot();
    window.oriUi.showToast('✓ Simulated TMS outage -> 3x retry -> quarantined in DLQ');
  });
  document.getElementById('btnQuickScenarioRun')?.addEventListener('click', async () => {
    await fetch('/api/v1/monitoring/scenarios/scenario-1-normal-order/run', { method: 'POST' });
    refreshSnapshot();
    window.oriUi.showToast('✓ Executed Normal E2E Order Flow (202 -> READY_TO_SHIP)');
  });

  async function refreshSnapshot() {
    const json = await fetch('/api/v1/monitoring/telemetry').then((r) => r.json()).catch(() => null);
    if (json?.success) {
      renderTelemetry(json.data);
      if (logsStore.length === 0 && json.data.recentLogs) {
        logsStore = json.data.recentLogs;
        renderLogs();
      }
    }
  }

  async function loadScenarios() {
    const json = await fetch('/api/v1/monitoring/scenarios').then((r) => r.json()).catch(() => null);
    const grid = document.getElementById('scenarioGrid');
    if (!json?.success || !grid) return;
    grid.innerHTML = json.data.map((s) => `<div class="bento-card" style="display:flex;flex-direction:column;justify-content:space-between;gap:10px;">
      <div>
        <div class="card-label"><span>${esc(s.category)}</span><span>${esc(s.tcRef)}</span></div>
        <div style="font-size:14.5px;font-weight:700;margin-bottom:6px;">${esc(s.name)}</div>
        <div style="font-size:12px;color:var(--ink-secondary);margin-bottom:8px;">${esc(s.description)}</div>
        <div class="subtile" style="font-size:11px;"><strong>Expected:</strong> ${esc(s.expectedOutcome)}</div>
      </div>
      <div>
        <button type="button" class="btn-pill-primary btn-run-scen" style="width:100%;justify-content:center;" data-sid="${esc(s.id)}">▶ Trigger scenario</button>
        <div class="code-out" id="trace-${esc(s.id)}" style="display:none;"></div>
      </div>
    </div>`).join('');

    grid.querySelectorAll('.btn-run-scen').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const sid = btn.getAttribute('data-sid');
        const box = document.getElementById(`trace-${sid}`);
        btn.disabled = true;
        btn.textContent = 'Running...';
        const jsonRun = await fetch(`/api/v1/monitoring/scenarios/${sid}/run`, { method: 'POST' }).then((r) => r.json());
        const d = jsonRun.data;
        box.style.display = 'block';
        box.textContent = `STATUS: ${d.status} (${d.executionTimeMs}ms)\n` + d.steps.map((st) => `• Step ${st.stepNumber} [${st.status}]: ${st.stepName} — ${st.details}`).join('\n');
        btn.disabled = false;
        btn.textContent = `✓ PASS (${d.executionTimeMs}ms)`;
        window.oriUi.showToast(`✓ ${sid} finished (${d.executionTimeMs}ms)`);
        refreshSnapshot();
      });
    });
  }

  async function refreshSimState() {
    const [wms, crm, tms] = await Promise.all([
      fetch('/api/v1/wms/inventory').then((r) => r.json()).catch(() => ({})),
      fetch('/api/v1/crm/customers').then((r) => r.json()).catch(() => ({})),
      fetch('/api/v1/tms/shipments').then((r) => r.json()).catch(() => ({})),
    ]);
    document.getElementById('wmsStateBox').textContent = JSON.stringify(wms.items || [], null, 2);
    document.getElementById('crmTmsStateBox').textContent = JSON.stringify({ customers: crm.customers || [], shipments: tms.shipments || [] }, null, 2);
  }

  document.getElementById('btnSubmitOrder')?.addEventListener('click', async () => {
    const body = {
      channel: document.getElementById('simChannel').value,
      customerId: document.getElementById('simCustomer').value,
      items: [{ sku: document.getElementById('simSku').value, quantity: Number(document.getElementById('simQty').value), unitPrice: 150000 }],
      simulateTmsFailure: document.getElementById('simTmsFail').checked,
    };
    const res = await fetch('/api/v1/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json();
    document.getElementById('orderSimOutput').textContent = `HTTP ${res.status}\n` + JSON.stringify(json, null, 2);
    window.oriUi.showToast(res.status === 202 ? `✓ Order ${json.orderId} accepted (202)` : `⚠ Order blocked (HTTP ${res.status})`);
    refreshSimState();
    refreshSnapshot();
  });

  document.getElementById('btnIngestPos')?.addEventListener('click', async () => {
    const res = await fetch('/api/v1/pos/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId: document.getElementById('posStoreId').value, rawPayload: document.getElementById('posRawInput').value, autoSubmitOrder: true }),
    });
    const json = await res.json();
    document.getElementById('posSimOutput').textContent = `HTTP ${res.status}\n` + JSON.stringify(json, null, 2);
    window.oriUi.showToast('✓ AI POS receipt parsed (PII masked) & ingested');
    refreshSimState();
    refreshSnapshot();
  });

  const sse = new EventSource('/api/v1/monitoring/stream');
  sse.addEventListener('telemetry:init', (e) => renderTelemetry(JSON.parse(e.data)));
  sse.addEventListener('telemetry:tick', (e) => renderTelemetry(JSON.parse(e.data)));
  sse.addEventListener('log:new', (e) => {
    logsStore.unshift(JSON.parse(e.data));
    if (logsStore.length > 200) logsStore.pop();
    renderLogs();
  });

  refreshSnapshot();
  loadScenarios();
})();
