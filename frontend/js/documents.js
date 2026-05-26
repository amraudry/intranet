// =============================================================
// Archivo: frontend/js/documents.js
// Propósito: Repositorio de documentos — filtros, paginación, vista
// =============================================================
'use strict';

let currentPage  = 1;
let currentView  = 'grid';
let currentSort  = 'reciente';
let activeFilters = { categoria_id: null, extension: null };

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireSession()) return;
  initSidebar();
  initIdleTimer();
  trackPageVisit();

  // Leer params del URL
  const params = new URLSearchParams(window.location.search);
  if (params.get('cat')) activeFilters.categoria_id = params.get('cat');

  await loadCategories();
  await loadDocuments();
  bindEvents();
});

// ── Bind de eventos ──────────────────────────────────────────
function bindEvents() {
  // Ordenamiento
  document.getElementById('sort-select').addEventListener('change', (e) => {
    currentSort = e.target.value;
    currentPage = 1;
    loadDocuments();
  });

  // Vista grid/lista
  document.getElementById('view-grid').addEventListener('click', () => setView('grid'));
  document.getElementById('view-list').addEventListener('click', () => setView('list'));

  // Limpiar filtros
  document.getElementById('clear-filters').addEventListener('click', () => {
    activeFilters = { categoria_id: null, extension: null };
    document.querySelectorAll('.filters-panel input[type="checkbox"]').forEach(cb => cb.checked = false);
    document.querySelectorAll('.filter-option.active').forEach(el => el.classList.remove('active'));
    currentPage = 1;
    loadDocuments();
  });

  // Filtros de tipo de archivo
  document.querySelectorAll('.filters-panel input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const checked = [...document.querySelectorAll('.filters-panel input[type="checkbox"]:checked')]
        .map(el => el.value);
      activeFilters.extension = checked.length === 1 ? checked[0] : null;
      currentPage = 1;
      loadDocuments();
    });
  });

  // Cerrar modal
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('doc-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

// ── Vista ────────────────────────────────────────────────────
function setView(view) {
  currentView = view;
  document.getElementById('view-grid').classList.toggle('active', view === 'grid');
  document.getElementById('view-list').classList.toggle('active', view === 'list');
  document.getElementById('view-grid').setAttribute('aria-pressed', String(view === 'grid'));
  document.getElementById('view-list').setAttribute('aria-pressed', String(view === 'list'));
  loadDocuments();
}

// ── Cargar categorías para filtros ───────────────────────────
async function loadCategories() {
  try {
    const cats = await Api.get('/categories');
    const container = document.getElementById('filter-categories');
    container.innerHTML = cats.map(c => `
      <div class="filter-option">
        <input type="radio" name="cat-filter" id="cat-${c.id}" value="${c.id}"
          ${activeFilters.categoria_id == c.id ? 'checked' : ''}>
        <label for="cat-${c.id}">${Security.escapeHTML(c.nombre)}</label>
        <span class="filter-count">${c.total_docs}</span>
      </div>
    `).join('');

    container.querySelectorAll('input[type="radio"]').forEach(radio => {
      radio.addEventListener('change', () => {
        activeFilters.categoria_id = radio.value;
        currentPage = 1;
        loadDocuments();
      });
    });
  } catch {
    document.getElementById('filter-categories').innerHTML = '<p class="caption">—</p>';
  }
}

// ── Cargar documentos ────────────────────────────────────────
async function loadDocuments() {
  const container = document.getElementById('docs-container');
  showSkeletons(container);

  const qp = new URLSearchParams({ page: currentPage, limit: 12, orden: currentSort });
  if (activeFilters.categoria_id) qp.set('categoria_id', activeFilters.categoria_id);
  if (activeFilters.extension)    qp.set('extension', activeFilters.extension);

  try {
    const data = await Api.get(`/documents?${qp}`);
    const { data: docs, pagination } = data;

    // Resultado count
    document.getElementById('results-count').textContent =
      `Mostrando ${docs.length} de ${pagination.total} documento${pagination.total !== 1 ? 's' : ''}`;

    if (docs.length === 0) {
      container.className = '';
      container.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <h3>Sin resultados</h3>
          <p>No hay documentos con los filtros aplicados.</p>
        </div>
      `;
      document.getElementById('pagination').innerHTML = '';
      return;
    }

    container.className = currentView === 'grid' ? 'doc-grid' : 'doc-list';
    container.innerHTML = docs.map(doc =>
      currentView === 'grid' ? renderDocCard(doc) : renderDocRow(doc)
    ).join('');

    // Click en cada doc
    container.querySelectorAll('[data-doc-id]').forEach(el => {
      el.addEventListener('click', () => openDocModal(el.dataset.docId));
      el.addEventListener('keydown', e => { if (e.key === 'Enter') openDocModal(el.dataset.docId); });
    });

    renderPagination(pagination);
  } catch (err) {
    container.innerHTML = `<p class="caption" style="padding:var(--space-4)">Error al cargar: ${Security.escapeHTML(err.message)}</p>`;
  }
}

// ── Render card ──────────────────────────────────────────────
function renderDocCard(doc) {
  return `
    <div class="doc-card" data-doc-id="${doc.id}" tabindex="0" role="button"
         aria-label="${Security.escapeHTML(doc.nombre)}">
      <div style="display:flex;align-items:center;gap:var(--space-3)">
        <div class="doc-card-icon ext-${doc.extension}">
          ${Security.escapeHTML(doc.extension.toUpperCase())}
        </div>
        <span class="badge" style="background:${doc.color_hex}22;color:${doc.color_hex};font-size:0.65rem">
          ${Security.escapeHTML(doc.categoria)}
        </span>
      </div>
      <div class="doc-card-name">${Security.escapeHTML(doc.nombre)}</div>
      <div class="doc-card-meta">
        <span>v${Security.escapeHTML(doc.version)}</span>
        <span>·</span>
        <span>${formatFileSize(doc.tamano_bytes)}</span>
        <span>·</span>
        <span>${formatDate(doc.actualizado_en)}</span>
      </div>
      <div class="doc-card-actions">
        <button class="btn btn-primary btn-sm" onclick="event.stopPropagation();downloadDoc(${doc.id},'${Security.escapeHTML(doc.nombre)}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Descargar
        </button>
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openDocModal(${doc.id})">Ver</button>
      </div>
    </div>
  `;
}

// ── Render row ───────────────────────────────────────────────
function renderDocRow(doc) {
  return `
    <div class="doc-row" data-doc-id="${doc.id}" tabindex="0" role="button"
         aria-label="${Security.escapeHTML(doc.nombre)}">
      <div class="doc-card-icon ext-${doc.extension}" style="width:36px;height:36px;font-size:0.62rem">
        ${Security.escapeHTML(doc.extension.toUpperCase())}
      </div>
      <div class="doc-row-name">${Security.escapeHTML(doc.nombre)}</div>
      <div class="doc-row-meta">${Security.escapeHTML(doc.categoria)}</div>
      <div class="doc-row-meta">${formatDate(doc.actualizado_en)}</div>
      <div class="doc-row-meta">${formatFileSize(doc.tamano_bytes)}</div>
      <div class="doc-row-actions">
        <button class="btn btn-primary btn-sm" onclick="event.stopPropagation();downloadDoc(${doc.id},'${Security.escapeHTML(doc.nombre)}')">Descargar</button>
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openDocModal(${doc.id})">Ver</button>
      </div>
    </div>
  `;
}

// ── Paginación ───────────────────────────────────────────────
function renderPagination({ pages, page }) {
  const container = document.getElementById('pagination');
  if (pages <= 1) { container.innerHTML = ''; return; }

  let html = `<button class="page-btn" onclick="goPage(${page-1})" ${page===1?'disabled':''} aria-label="Anterior">‹</button>`;
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) {
      html += `<button class="page-btn ${i===page?'active':''}" onclick="goPage(${i})" aria-label="Página ${i}" aria-current="${i===page?'page':'false'}">${i}</button>`;
    } else if (Math.abs(i - page) === 2) {
      html += `<span class="page-btn" style="pointer-events:none">…</span>`;
    }
  }
  html += `<button class="page-btn" onclick="goPage(${page+1})" ${page===pages?'disabled':''} aria-label="Siguiente">›</button>`;
  container.innerHTML = html;
}

function goPage(p) {
  currentPage = p;
  loadDocuments();
  document.querySelector('.main-content').scrollTo(0, 0);
}

// ── Modal detalle ────────────────────────────────────────────
async function openDocModal(id) {
  const overlay = document.getElementById('doc-modal');
  const body    = document.getElementById('modal-body');
  const footer  = document.getElementById('modal-footer');
  body.innerHTML = '<div class="skeleton" style="height:200px;border-radius:8px"></div>';
  overlay.classList.add('open');

  try {
    const doc = await Api.get(`/documents/${id}`);
    document.getElementById('modal-doc-title').textContent = doc.nombre;
    body.innerHTML = `
      <div style="display:flex;gap:var(--space-3);flex-wrap:wrap;margin-bottom:var(--space-5)">
        <span class="badge badge-mono">${Security.escapeHTML(doc.extension.toUpperCase())}</span>
        <span class="badge" style="background:${doc.color_hex}22;color:${doc.color_hex}">${Security.escapeHTML(doc.categoria)}</span>
        <span class="badge badge-mono">v${Security.escapeHTML(doc.version)}</span>
        ${doc.departamento ? `<span class="badge badge-mono">${Security.escapeHTML(doc.departamento)}</span>` : ''}
      </div>
      ${doc.descripcion ? `<p style="color:var(--color-text-secondary);margin-bottom:var(--space-4);font-size:0.9rem">${Security.escapeHTML(doc.descripcion)}</p>` : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);margin-bottom:var(--space-5)">
        <div><div class="caption">Subido por</div><div style="font-size:0.875rem">${Security.escapeHTML(doc.subido_por_nombre)}</div></div>
        <div><div class="caption">Tamaño</div><div style="font-size:0.875rem">${formatFileSize(doc.tamano_bytes)}</div></div>
        <div><div class="caption">Creado</div><div style="font-size:0.875rem">${formatDate(doc.creado_en)}</div></div>
        <div><div class="caption">Actualizado</div><div style="font-size:0.875rem">${formatDate(doc.actualizado_en)}</div></div>
      </div>
      ${doc.tags ? `<div style="margin-bottom:var(--space-4)"><div class="caption" style="margin-bottom:6px">Etiquetas</div><div style="display:flex;gap:6px;flex-wrap:wrap">${doc.tags.split(',').map(t=>`<span class="badge badge-mono">${Security.escapeHTML(t.trim())}</span>`).join('')}</div></div>` : ''}
      ${doc.versiones?.length > 1 ? `
        <div><div class="caption" style="margin-bottom:var(--space-3)">Historial de versiones</div>
        ${doc.versiones.slice(0,3).map(v=>`<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--color-border-light);font-size:0.8rem"><span class="mono">v${Security.escapeHTML(v.version)}</span><span style="color:var(--color-text-muted)">${Security.escapeHTML(v.subido_por)} · ${formatDate(v.creado_en)}</span></div>`).join('')}
        </div>` : ''}
    `;
    footer.innerHTML = `
      <button class="btn btn-ghost btn-sm" onclick="closeModal()">Cerrar</button>
      <button class="btn btn-primary btn-sm" onclick="downloadDoc(${doc.id},'${Security.escapeHTML(doc.nombre)}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Descargar
      </button>
    `;
  } catch (err) {
    body.innerHTML = `<p style="color:var(--color-error)">Error al cargar el documento.</p>`;
  }
}

function closeModal() {
  document.getElementById('doc-modal').classList.remove('open');
}

// ── Descarga ─────────────────────────────────────────────────
async function downloadDoc(id, nombre) {
  try {
    const token = Session.getToken();
    const link  = document.createElement('a');
    link.href   = `http://localhost:3000/api/documents/${id}/download`;
    link.setAttribute('download', nombre);
    // Necesita header auth — usar fetch + blob
    const res  = await fetch(link.href, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error('No se pudo descargar');
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    link.href  = url;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    Toast.success('Descarga iniciada');
  } catch {
    Toast.error('Error al descargar el documento.');
  }
}

// ── Utilidades ───────────────────────────────────────────────
function showSkeletons(container) {
  container.className = 'doc-grid';
  container.innerHTML = Array(6).fill('<div class="skeleton skeleton-card"></div>').join('');
}
function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' });
}
function formatFileSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes/1024).toFixed(1) + ' KB';
  return (bytes/1048576).toFixed(1) + ' MB';
}
