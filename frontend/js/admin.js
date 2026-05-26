// =============================================================
// Archivo: frontend/js/admin.js
// Propósito: Utilidades compartidas para el panel de administración
//            Cargado en todas las páginas del directorio /admin/
// =============================================================
'use strict';

// ── Constantes de configuración ───────────────────────────────
const ADMIN_CONFIG = {
  AUDIT_PAGE_SIZE: 15,
  DOCS_PAGE_SIZE:  10,
  CHART_COLORS: {
    primary:  'var(--color-primary)',
    accent:   'var(--color-accent)',
    success:  'var(--color-success)',
    error:    'var(--color-error)',
    warning:  'var(--color-warning)',
    info:     'var(--color-info)',
  },
  ACTION_BADGE: {
    'LOGIN':              'badge-success',
    'LOGOUT':             'badge-mono',
    'DESCARGA':           'badge-info',
    'BUSQUEDA':           'badge-warning',
    'SUBIDA_DOCUMENTO':   'badge-primary',
    'LOGIN_FALLIDO':      'badge-danger',
    'CREAR_USUARIO':      'badge-primary',
    'MODIFICAR_USUARIO':  'badge-warning',
    'ARCHIVO_DOCUMENTO':  'badge-danger',
    'EDICION_DOCUMENTO':  'badge-info',
    'LOGIN_SSO_MICROSOFT':'badge-success',
  },
};

// ── Utilidades de formato ──────────────────────────────────────

/**
 * Formatea una fecha con hora completa en español.
 */
function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Formatea solo la fecha en español.
 */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

/**
 * Formatea tamaño de archivo en unidades legibles.
 */
function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '—';
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1_048_576)   return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
}

/**
 * Genera un badge HTML para una acción de auditoría.
 */
function actionBadge(accion) {
  const cls = ADMIN_CONFIG.ACTION_BADGE[accion] || 'badge-mono';
  return `<span class="badge ${cls}" style="font-size:0.65rem;white-space:nowrap">${Security.escapeHTML(accion)}</span>`;
}

/**
 * Genera un badge HTML para resultado de auditoría.
 */
function resultBadge(resultado) {
  const map = {
    exito:       'badge-success',
    fallo:       'badge-danger',
    advertencia: 'badge-warning',
  };
  return `<span class="badge ${map[resultado] || 'badge-mono'}" style="font-size:0.65rem">${Security.escapeHTML(resultado)}</span>`;
}

// ── Paginación genérica ────────────────────────────────────────

/**
 * Renderiza controles de paginación dentro de un elemento.
 * @param {string}   containerId  - ID del elemento contenedor
 * @param {number}   currentPage  - Página actual
 * @param {number}   totalPages   - Total de páginas
 * @param {Function} onPageChange - Callback(pageNumber)
 */
function renderPaginationInto(containerId, currentPage, totalPages, onPageChange) {
  const container = document.getElementById(containerId);
  if (!container || totalPages <= 1) {
    if (container) container.innerHTML = '';
    return;
  }

  let html = `
    <button class="page-btn" ${currentPage === 1 ? 'disabled' : ''}
      onclick="(${onPageChange.toString()})(${currentPage - 1})" aria-label="Anterior">‹</button>
  `;

  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - currentPage) <= 1) {
      html += `
        <button class="page-btn ${i === currentPage ? 'active' : ''}"
          onclick="(${onPageChange.toString()})(${i})"
          aria-label="Página ${i}"
          aria-current="${i === currentPage ? 'page' : 'false'}">
          ${i}
        </button>
      `;
    } else if (Math.abs(i - currentPage) === 2) {
      html += `<span class="page-btn" style="pointer-events:none;opacity:0.5">…</span>`;
    }
  }

  html += `
    <button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''}
      onclick="(${onPageChange.toString()})(${currentPage + 1})" aria-label="Siguiente">›</button>
  `;

  container.innerHTML = html;
}

// ── Gráficas SVG reutilizables ─────────────────────────────────

/**
 * Genera una mini gráfica de barras verticales SVG.
 * @param {Array}  data    - [{label, value}]
 * @param {Object} options - {width, height, color}
 */
function buildMiniBarChart(data, options = {}) {
  const W      = options.width  || 400;
  const H      = options.height || 160;
  const PAD    = options.padding || 20;
  const color  = options.color  || 'var(--color-primary)';

  if (!data.length) return `<p class="caption" style="text-align:center;padding:${H/2}px 0">Sin datos</p>`;

  const maxVal = Math.max(...data.map(d => d.value), 1);
  const n      = data.length;
  const barW   = (W - PAD * 2) / n - 4;
  const chartH = H - PAD * 2;

  const bars = data.map((d, i) => {
    const barH = Math.max(4, (d.value / maxVal) * chartH);
    const x    = PAD + i * ((W - PAD * 2) / n) + 2;
    const y    = H - PAD - barH;
    const lbl  = d.label.length > 8 ? d.label.substring(0, 7) + '…' : d.label;
    return `
      <rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="3" fill="${color}">
        <title>${Security.escapeHTML(d.label)}: ${d.value}</title>
      </rect>
      <text x="${x + barW / 2}" y="${H - 6}" text-anchor="middle" class="chart-label" style="font-size:9px">
        ${Security.escapeHTML(lbl)}
      </text>
      <text x="${x + barW / 2}" y="${y - 4}" text-anchor="middle" class="chart-label" style="font-size:10px">
        ${d.value}
      </text>
    `;
  }).join('');

  return `
    <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"
      role="img" aria-label="Gráfica de barras" style="width:100%;height:auto">
      ${bars}
    </svg>
  `;
}

/**
 * Genera una gráfica de dona SVG para distribución porcentual.
 * @param {Array}  segments - [{label, value, color}]
 * @param {number} size     - Tamaño del SVG
 */
function buildDonutChart(segments, size = 200) {
  const cx = size / 2, cy = size / 2;
  const R  = size * 0.38;
  const r  = size * 0.22;

  const total = segments.reduce((s, d) => s + d.value, 0);
  if (total === 0) return `<p class="caption" style="text-align:center;padding:${size/4}px 0">Sin datos</p>`;

  let currentAngle = -Math.PI / 2;
  const paths = segments.map((seg) => {
    const slice    = (seg.value / total) * 2 * Math.PI;
    const startA   = currentAngle;
    const endA     = currentAngle + slice;
    currentAngle   = endA;

    const x1 = cx + R * Math.cos(startA), y1 = cy + R * Math.sin(startA);
    const x2 = cx + R * Math.cos(endA),   y2 = cy + R * Math.sin(endA);
    const x3 = cx + r * Math.cos(endA),   y3 = cy + r * Math.sin(endA);
    const x4 = cx + r * Math.cos(startA), y4 = cy + r * Math.sin(startA);
    const largeArc = slice > Math.PI ? 1 : 0;
    const pct = Math.round((seg.value / total) * 100);

    return `
      <path d="M${x1} ${y1} A${R} ${R} 0 ${largeArc} 1 ${x2} ${y2}
               L${x3} ${y3} A${r} ${r} 0 ${largeArc} 0 ${x4} ${y4} Z"
        fill="${seg.color || 'var(--color-primary)'}" opacity="0.85">
        <title>${Security.escapeHTML(seg.label)}: ${seg.value} (${pct}%)</title>
      </path>
    `;
  }).join('');

  // Leyenda
  const legend = segments.map(seg => `
    <div style="display:flex;align-items:center;gap:6px;font-size:0.78rem;margin-bottom:4px">
      <div style="width:10px;height:10px;border-radius:50%;background:${seg.color};flex-shrink:0"></div>
      <span style="color:var(--color-text-secondary)">${Security.escapeHTML(seg.label)}</span>
      <span class="mono" style="margin-left:auto;color:var(--color-text-muted)">${seg.value}</span>
    </div>
  `).join('');

  return `
    <div style="display:flex;gap:var(--space-6);align-items:center;flex-wrap:wrap">
      <svg viewBox="0 0 ${size} ${size}" style="width:${size}px;height:${size}px;flex-shrink:0"
        xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Gráfica de dona">
        ${paths}
        <text x="${cx}" y="${cy + 5}" text-anchor="middle"
          style="font-family:var(--font-display);font-size:24px;fill:var(--color-primary);font-weight:600">
          ${total}
        </text>
      </svg>
      <div style="flex:1;min-width:120px">${legend}</div>
    </div>
  `;
}

// ── Modal de confirmación genérico ────────────────────────────

/**
 * Muestra un modal de confirmación y devuelve una promesa.
 * @param {string} title   - Título del modal
 * @param {string} message - Mensaje descriptivo
 * @param {string} confirmLabel - Texto del botón confirmar
 * @param {string} type    - 'danger' | 'warning' | 'primary'
 * @returns {Promise<boolean>}
 */
function confirmDialog(title, message, confirmLabel = 'Confirmar', type = 'danger') {
  return new Promise((resolve) => {
    // Reutilizar modal si ya existe
    let overlay = document.getElementById('__confirm-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id        = '__confirm-overlay';
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal" style="max-width:440px" role="dialog" aria-modal="true">
          <div class="modal-header">
            <h3 id="__confirm-title"></h3>
          </div>
          <div class="modal-body">
            <p id="__confirm-msg" style="color:var(--color-text-secondary)"></p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" id="__confirm-cancel">Cancelar</button>
            <button class="btn" id="__confirm-ok"></button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
    }

    document.getElementById('__confirm-title').textContent  = title;
    document.getElementById('__confirm-msg').textContent    = message;
    const okBtn = document.getElementById('__confirm-ok');
    okBtn.textContent = confirmLabel;
    okBtn.className   = `btn btn-${type}`;
    overlay.classList.add('open');

    const cleanup = (result) => {
      overlay.classList.remove('open');
      okBtn.replaceWith(okBtn.cloneNode(true));
      document.getElementById('__confirm-cancel').replaceWith(
        document.getElementById('__confirm-cancel').cloneNode(true)
      );
      resolve(result);
    };

    document.getElementById('__confirm-ok').addEventListener('click',     () => cleanup(true),  { once: true });
    document.getElementById('__confirm-cancel').addEventListener('click', () => cleanup(false), { once: true });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(false); }, { once: true });
  });
}

// ── Exportación CSV genérica ───────────────────────────────────

/**
 * Genera y descarga un archivo CSV desde un array de objetos.
 * @param {Array}  rows     - Array de objetos (cada uno es una fila)
 * @param {Array}  columns  - [{key, label}]
 * @param {string} filename - Nombre del archivo sin extensión
 */
function downloadCSV(rows, columns, filename) {
  const header = columns.map(c => `"${c.label}"`).join(',');
  const body   = rows.map(row =>
    columns.map(c => {
      const val = row[c.key] ?? '';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    }).join(',')
  ).join('\n');

  const csv  = '\ufeff' + header + '\n' + body; // BOM para Excel
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href     = url;
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ── Validación de contraseña robusta ──────────────────────────

/**
 * Valida que la contraseña cumpla la política corporativa.
 * Retorna { valid: bool, message: string }
 */
function validatePassword(password) {
  if (!password || password.length < 8) {
    return { valid: false, message: 'Mínimo 8 caracteres.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Debe incluir al menos una mayúscula.' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Debe incluir al menos una minúscula.' };
  }
  if (!/\d/.test(password)) {
    return { valid: false, message: 'Debe incluir al menos un número.' };
  }
  if (!/[@$!%*?&#^()_+\-=]/.test(password)) {
    return { valid: false, message: 'Debe incluir al menos un carácter especial (@$!%*?&#...).' };
  }
  return { valid: true, message: '' };
}

// ── Highlight de términos en texto ────────────────────────────

/**
 * Resalta un término de búsqueda en un texto HTML seguro.
 */
function highlightTerm(text, term) {
  if (!text || !term) return Security.escapeHTML(text || '');
  const safe   = Security.escapeHTML(text);
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return safe.replace(new RegExp(`(${escaped})`, 'gi'), '<mark class="highlight">$1</mark>');
}

// ── Debounce ──────────────────────────────────────────────────

/**
 * Limita la frecuencia de ejecución de una función.
 */
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// ── Verificar que el módulo cargó correctamente ───────────────
console.debug('[admin.js] Módulo de administración cargado ✓');
