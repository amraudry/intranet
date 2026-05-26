// =============================================================
// Archivo: frontend/js/home.js
// Propósito: Lógica del dashboard principal
// =============================================================
'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireSession()) return;
  initSidebar();
  initIdleTimer();
  trackPageVisit();

  const user = Session.getUser();

  // Saludo personalizado
  const welcomeEl = document.getElementById('welcome-title');
  if (welcomeEl) {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
    welcomeEl.textContent = `${greeting}, ${user?.nombre || ''}`;
  }

  // Fecha actual
  const dateEl = document.getElementById('hero-date');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('es-MX', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  }

  // Cargar todo en paralelo
  await Promise.all([
    loadKPIs(),
    loadCategories(),
    loadRecentDocs(),
    loadAvisos(),
  ]);
});

// ── KPIs ────────────────────────────────────────────────────
async function loadKPIs() {
  const grid = document.getElementById('kpi-grid');
  if (!grid) return;

  try {
    const stats = Session.isAdmin()
      ? await Api.get('/admin/stats')
      : await Api.get('/documents').then(d => ({ total_documentos: d.pagination?.total || 0 }));

    const kpis = Session.isAdmin()
      ? [
          { label: 'Documentos', value: stats.total_documentos || 0, sub: 'en el repositorio', icon: 'file' },
          { label: 'Usuarios activos', value: stats.total_usuarios || 0, sub: 'con acceso al portal', icon: 'users' },
          { label: 'Descargas este mes', value: stats.descargas_mes || 0, sub: 'archivos descargados', icon: 'download' },
          { label: 'Docs nuevos', value: stats.docs_nuevos_semana || 0, sub: 'en los últimos 7 días', icon: 'star' },
        ]
      : [
          { label: 'Documentos', value: stats.total_documentos || 0, sub: 'disponibles para ti', icon: 'file' },
        ];

    grid.innerHTML = kpis.map(k => `
      <div class="kpi-card anim-fade-up">
        <div class="kpi-label">${Security.escapeHTML(k.label)}</div>
        <div class="kpi-value">${k.value.toLocaleString('es-MX')}</div>
        <div class="kpi-sub">${Security.escapeHTML(k.sub)}</div>
        <div class="kpi-icon">${getKpiIcon(k.icon)}</div>
      </div>
    `).join('');
  } catch {
    grid.innerHTML = '';
  }
}

function getKpiIcon(name) {
  const icons = {
    file:     '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    users:    '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    download: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    star:     '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  };
  return icons[name] || '';
}

// ── Categorías ───────────────────────────────────────────────
async function loadCategories() {
  const grid = document.getElementById('categories-grid');
  if (!grid) return;

  try {
    const cats = await Api.get('/categories');
    grid.innerHTML = cats.map(c => `
      <a href="/documents.html?cat=${c.id}" class="cat-card anim-fade-up"
         style="--cat-color:${Security.escapeHTML(c.color_hex || '#C9A96E')}"
         aria-label="${Security.escapeHTML(c.nombre)} — ${c.total_docs} documentos">
        <div class="cat-icon">
          ${getCatIcon(c.icono)}
        </div>
        <div class="cat-name">${Security.escapeHTML(c.nombre)}</div>
        <div class="cat-count">${c.total_docs} documento${c.total_docs !== 1 ? 's' : ''}</div>
      </a>
    `).join('');
  } catch {
    grid.innerHTML = '<p class="caption" style="padding:var(--space-4)">No se pudieron cargar las categorías.</p>';
  }
}

function getCatIcon(name) {
  const map = {
    'drafting-compass': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="2"/><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>',
    'book-open':       '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
    'file-text':       '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
    'hard-hat':        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2z"/><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M4 15v-3a8 8 0 0 1 16 0v3"/></svg>',
    'users':           '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    'shield':          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    'layout-dashboard':'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
    'graduation-cap':  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>',
  };
  return map[name] || map['file-text'];
}

// ── Documentos recientes ─────────────────────────────────────
async function loadRecentDocs() {
  const container = document.getElementById('recent-docs');
  if (!container) return;

  try {
    const data = await Api.get('/documents?limit=5&orden=reciente');
    const docs = data?.data || [];

    if (docs.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No hay documentos aún.</p></div>';
      return;
    }

    container.innerHTML = docs.map(doc => `
      <div class="recent-doc-item" onclick="window.location='/documents.html?doc=${doc.id}'"
           role="button" tabindex="0" aria-label="${Security.escapeHTML(doc.nombre)}">
        <div class="recent-doc-ext ext-${doc.extension}">${Security.escapeHTML(doc.extension.toUpperCase())}</div>
        <div class="recent-doc-info">
          <div class="recent-doc-name">${Security.escapeHTML(doc.nombre)}</div>
          <div class="recent-doc-meta">${Security.escapeHTML(doc.categoria)} · v${Security.escapeHTML(doc.version)} · ${formatDate(doc.actualizado_en)}</div>
        </div>
        <svg class="recent-doc-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </div>
    `).join('');

    // Acceso teclado
    container.querySelectorAll('.recent-doc-item').forEach(el => {
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') el.click(); });
    });

  } catch {
    container.innerHTML = '<p class="caption" style="padding:var(--space-4)">No se pudieron cargar los documentos.</p>';
  }
}

// ── Avisos ───────────────────────────────────────────────────
async function loadAvisos() {
  const container = document.getElementById('avisos-list');
  if (!container) return;

  const colorMap = {
    info:        'var(--color-info)',
    advertencia: 'var(--color-warning)',
    urgente:     'var(--color-error)',
  };
  const labelMap = {
    info:        'Información',
    advertencia: 'Advertencia',
    urgente:     'Urgente',
  };

  try {
    const avisos = await Api.get('/avisos');
    if (!avisos?.length) {
      container.innerHTML = '<p class="caption" style="padding:var(--space-4)">Sin comunicados activos.</p>';
      return;
    }

    container.innerHTML = avisos.map(a => `
      <div class="aviso-card" style="--aviso-color:${colorMap[a.tipo] || 'var(--color-accent)'}">
        <div class="aviso-header">
          <span class="badge badge-${a.tipo === 'info' ? 'info' : a.tipo === 'urgente' ? 'danger' : 'warning'}"
                style="font-size:0.65rem">
            ${Security.escapeHTML(labelMap[a.tipo] || a.tipo)}
          </span>
          <div class="aviso-titulo">${Security.escapeHTML(a.titulo)}</div>
        </div>
        <div class="aviso-contenido">${Security.escapeHTML(a.contenido)}</div>
        <div class="aviso-fecha">${formatDate(a.creado_en)}</div>
      </div>
    `).join('');
  } catch {
    container.innerHTML = '<p class="caption" style="padding:var(--space-4)">No se pudieron cargar los avisos.</p>';
  }
}

// ── Utilidad fecha ───────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}
