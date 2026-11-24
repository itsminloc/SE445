(function () {
  'use strict';

  let toastTimer = null;

  function showToast(text, btnLabel, onAction) {
    const toast = document.getElementById('floatingToast');
    const txt = document.getElementById('toastText');
    const btn = document.getElementById('toastBtn');
    if (!toast || !txt || !btn) return;
    txt.textContent = text;
    btn.textContent = btnLabel || 'OK';
    btn.onclick = () => {
      toast.classList.remove('is-visible');
      if (typeof onAction === 'function') onAction();
    };
    toast.classList.add('is-visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 4200);
  }

  function toggleTheme(event) {
    const root = document.documentElement;
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    const x = event ? event.clientX : window.innerWidth - 90;
    const y = event ? event.clientY : 32;
    const maxRadius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

    if (!document.startViewTransition) {
      root.setAttribute('data-theme', next);
      return;
    }

    const transition = document.startViewTransition(() => {
      root.setAttribute('data-theme', next);
    });
    transition.ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${maxRadius}px at ${x}px ${y}px)`,
          ],
        },
        { duration: 480, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', pseudoElement: '::view-transition-new(root)' }
      );
    }).catch(() => {});
  }

  function animateCountUp(el, targetNum, formatter) {
    if (!el) return;
    const end = Number(targetNum || 0);
    const start = Number(el.dataset.lastVal || 0);
    el.dataset.lastVal = String(end);
    if (start === end) {
      el.textContent = formatter ? formatter(end) : String(end);
      return;
    }
    const duration = 420;
    const t0 = performance.now();
    function frame(now) {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const val = Math.round(start + (end - start) * eased);
      el.textContent = formatter ? formatter(val) : String(val);
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function renderSparkline(svgId, values) {
    const svg = document.getElementById(svgId);
    if (!svg || !values || values.length < 2) return;
    const max = Math.max(...values, 1);
    const pts = values.map((v, i) => {
      const x = (i / (values.length - 1)) * 74 + 2;
      const y = 24 - (v / max) * 20;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    svg.innerHTML = `<polyline fill="none" stroke="rgba(255,255,255,0.75)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" points="${pts.join(' ')}" />`;
  }

  function renderAreaChart(svgId, series) {
    const svg = document.getElementById(svgId);
    if (!svg || !series.length) return;
    const W = 620;
    const H = 180;
    const padL = 36;
    const padT = 20;
    const max = Math.max(...series.map((s) => s.val), 10);

    const coords = series.map((s, i) => {
      const x = padL + (i / Math.max(1, series.length - 1)) * (W - padL - 14);
      const y = padT + (1 - s.val / max) * (H - padT - 18);
      return { x, y, label: s.label, val: s.val };
    });

    let lineD = `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;
    for (let i = 1; i < coords.length; i++) {
      const prev = coords[i - 1];
      const curr = coords[i];
      const cx = ((prev.x + curr.x) / 2).toFixed(1);
      lineD += ` C ${cx} ${prev.y.toFixed(1)}, ${cx} ${curr.y.toFixed(1)}, ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
    }
    const areaD = `${lineD} L ${coords[coords.length - 1].x.toFixed(1)} ${H - 18} L ${coords[0].x.toFixed(1)} ${H - 18} Z`;
    const grid = [0, 0.5, 1]
      .map((f) => {
        const y = (padT + f * (H - padT - 18)).toFixed(1);
        const lbl = Math.round(max * (1 - f));
        return `<line x1="${padL}" y1="${y}" x2="${W - 10}" y2="${y}" stroke="var(--border-hairline)" stroke-dasharray="3 3" /><text x="4" y="${Number(y) + 3}" fill="var(--ink-muted)" font-size="10">${lbl}</text>`;
      })
      .join('');
    const xTicks = coords
      .filter((_, idx) => idx % 2 === 0 || idx === coords.length - 1)
      .map((c) => `<text x="${c.x.toFixed(1)}" y="${H + 8}" text-anchor="middle" fill="var(--ink-muted)" font-size="10">${c.label}</text>`)
      .join('');

    svg.innerHTML = `
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--chart-fill-start)" />
          <stop offset="100%" stop-color="var(--chart-fill-end)" />
        </linearGradient>
      </defs>
      ${grid}
      <path d="${areaD}" fill="url(#areaGrad)" />
      <path d="${lineD}" fill="none" stroke="var(--chart-stroke)" stroke-width="2" stroke-linecap="round" />
      ${xTicks}`;
  }

  function renderBarChart(containerId, hintId, series) {
    const wrap = document.getElementById(containerId);
    const hint = document.getElementById(hintId);
    if (!wrap || !series.length) return;
    const max = Math.max(...series.map((s) => s.val), 1);
    wrap.innerHTML = series
      .map((s, idx) => {
        const hPct = Math.max(12, Math.round((s.val / max) * 86));
        const active = idx === series.length - 1 ? 'is-active' : '';
        return `<div class="bar-col ${active}" data-label="${s.label}" data-val="${s.display || s.val}">
          <div class="bar-rect" style="height:${hPct}%;"></div>
          <span class="bar-lbl">${s.label}</span>
        </div>`;
      })
      .join('');
    wrap.querySelectorAll('.bar-col').forEach((col) => {
      col.addEventListener('mouseenter', () => {
        if (hint) hint.textContent = `${col.dataset.label}: ${col.dataset.val}`;
      });
    });
  }

  window.oriUi = { toggleTheme, showToast, animateCountUp, renderSparkline, renderAreaChart, renderBarChart };
})();
