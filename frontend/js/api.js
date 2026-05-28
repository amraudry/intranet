// =============================================================
// Archivo: frontend/js/api.js
// Propósito: Cliente API centralizado con manejo de auth y errores
// =============================================================
'use strict';

const API_BASE = 'https://intranet-8wfi.onrender.com/api';

// =============================================================
// SESIÓN — Manejo seguro en sessionStorage
// =============================================================
const Session = {
  TOKEN_KEY:   '__iarq_t',
  USER_KEY:    '__iarq_u',
  EXPIRY_KEY:  '__iarq_e',
  IDLE_KEY:    '__iarq_idle',

  save(token, usuario) {
    const expiry = Date.now() + (8 * 60 * 60 * 1000); // 8 horas
    sessionStorage.setItem(this.TOKEN_KEY,  token);
    sessionStorage.setItem(this.USER_KEY,   JSON.stringify(usuario));
    sessionStorage.setItem(this.EXPIRY_KEY, String(expiry));
    this.resetIdle();
  },

  getToken() { return sessionStorage.getItem(this.TOKEN_KEY); },

  getUser() {
    try {
      const raw = sessionStorage.getItem(this.USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },

  isValid() {
    const token  = this.getToken();
    const expiry = parseInt(sessionStorage.getItem(this.EXPIRY_KEY) || '0');
    return !!token && Date.now() < expiry;
  },

  isAdmin() {
    const user = this.getUser();
    return user?.rol === 'admin';
  },

  resetIdle() {
    sessionStorage.setItem(this.IDLE_KEY, String(Date.now()));
  },

  destroy() {
    [this.TOKEN_KEY, this.USER_KEY, this.EXPIRY_KEY, this.IDLE_KEY].forEach(k =>
      sessionStorage.removeItem(k)
    );
  },

  // Leer token del URL si viene del callback SSO
  loadFromURL() {
    const params = new URLSearchParams(window.location.search);
    const token  = params.get('token');
    if (token) {
      sessionStorage.setItem(this.TOKEN_KEY, decodeURIComponent(token));
      // Limpiar token del URL por seguridad
      const cleanURL = window.location.pathname;
      window.history.replaceState({}, '', cleanURL);
    }
  },
};

// =============================================================
// GUARD — Redirigir si no hay sesión válida
// =============================================================
function requireSession(adminOnly = false) {
  Session.loadFromURL();
  if (!Session.isValid()) {
    window.location.replace('/index.html');
    return false;
  }
  if (adminOnly && !Session.isAdmin()) {
    window.location.replace('/home.html');
    return false;
  }
  return true;
}

// =============================================================
// API — Cliente HTTP con JWT automático
// =============================================================
const Api = {
  async request(method, endpoint, body = null, isFormData = false) {
    const token = Session.getToken();
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (!isFormData) headers['Content-Type'] = 'application/json';

    const opts = { method, headers };
    if (body) opts.body = isFormData ? body : JSON.stringify(body);

    try {
      const res  = await fetch(`${API_BASE}${endpoint}`, opts);

      // Sesión expirada en el servidor
      if (res.status === 401) {
        Session.destroy();
        window.location.replace('/index.html?expired=1');
        return null;
      }

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data?.error || data?.errors?.[0]?.msg || `Error ${res.status}`;
        throw new ApiError(msg, res.status);
      }

      Session.resetIdle();
      return data;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError('Error de conexión con el servidor', 0);
    }
  },

  get:    (ep)           => Api.request('GET',    ep),
  post:   (ep, body)     => Api.request('POST',   ep, body),
  put:    (ep, body)     => Api.request('PUT',    ep, body),
  patch:  (ep, body)     => Api.request('PATCH',  ep, body),
  delete: (ep)           => Api.request('DELETE', ep),
  upload: (ep, formData) => Api.request('POST',   ep, formData, true),
};

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
    this.name   = 'ApiError';
  }
}

// =============================================================
// SEGURIDAD — Sanitización XSS
// =============================================================
const Security = {
  escapeHTML(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g,  '&amp;')
      .replace(/</g,  '&lt;')
      .replace(/>/g,  '&gt;')
      .replace(/"/g,  '&quot;')
      .replace(/'/g,  '&#x27;')
      .replace(/`/g,  '&#x60;');
  },

  // Solo permite <mark class="highlight">...</mark>
  safeHighlight(html) {
    const div = document.createElement('div');
    div.textContent = html;
    let safe = div.innerHTML;
    // Reemplazar los tags mark escapados de vuelta (son seguros)
    safe = safe.replace(/&lt;mark class=&quot;highlight&quot;&gt;(.*?)&lt;\/mark&gt;/g,
      '<mark class="highlight">$1</mark>');
    return safe;
  },

  sanitizeURLParam(param) {
    if (typeof param !== 'string') return '';
    return decodeURIComponent(param).replace(/[<>"'`]/g, '').substring(0, 200);
  },
};

// =============================================================
// TOASTS — Notificaciones
// =============================================================
const Toast = {
  container: null,
  init() {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    }
  },
  show(message, type = 'info', duration = 4000) {
    this.init();
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        ${type === 'success' ? '<polyline points="20 6 9 17 4 12"/>'
          : type === 'error' ? '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'
          : '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'}
      </svg>
      <span>${Security.escapeHTML(message)}</span>
    `;
    this.container.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'toastIn 0.25s ease reverse';
      setTimeout(() => toast.remove(), 250);
    }, duration);
  },
  success: (msg) => Toast.show(msg, 'success'),
  error:   (msg) => Toast.show(msg, 'error'),
  warning: (msg) => Toast.show(msg, 'warning'),
};

// =============================================================
// IDLE TIMER — Logout por inactividad (15 min)
// =============================================================
function initIdleTimer() {
  const IDLE_MS       = 15 * 60 * 1000; // 15 min
  const WARNING_MS    = 60 * 1000;       // 60 seg de advertencia
  let idleTimeout, warnTimeout;
  let warningShown    = false;

  function resetTimer() {
    Session.resetIdle();
    clearTimeout(idleTimeout);
    clearTimeout(warnTimeout);
    if (warningShown) {
      const overlay = document.getElementById('idle-overlay');
      if (overlay) overlay.classList.remove('open');
      warningShown = false;
    }
    idleTimeout = setTimeout(showWarning, IDLE_MS - WARNING_MS);
  }

  function showWarning() {
    warningShown = true;
    let count = 60;
    const overlay = document.getElementById('idle-overlay');
    const countEl = document.getElementById('idle-count');
    if (overlay) overlay.classList.add('open');
    if (countEl) countEl.textContent = count;

    warnTimeout = setInterval(() => {
      count--;
      if (countEl) countEl.textContent = count;
      if (count <= 0) {
        clearInterval(warnTimeout);
        doLogout();
      }
    }, 1000);
  }

  async function doLogout() {
    try { await Api.post('/auth/logout', {}); } catch {}
    Session.destroy();
    window.location.replace('/index.html?timeout=1');
  }

  ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(ev =>
    document.addEventListener(ev, resetTimer, { passive: true })
  );
  resetTimer();

  // Botón "Continuar" en el modal
  const continueBtn = document.getElementById('idle-continue');
  if (continueBtn) continueBtn.addEventListener('click', resetTimer);
}

// =============================================================
// TRACK PAGE VISIT
// =============================================================
function trackPageVisit() {
  const page = window.location.pathname;
  Api.post('/track', { pagina: page }).catch(() => {});
}

// =============================================================
// INIT SIDEBAR — Renderizar nombre/avatar, marcar activo, logout
// =============================================================
function initSidebar() {
  const user = Session.getUser();
  if (!user) return;

  // Avatar con iniciales
  const avatarEl = document.querySelector('.user-avatar');
  if (avatarEl) {
    const initials = `${(user.nombre || '')[0]}${(user.apellido || '')[0]}`.toUpperCase();
    avatarEl.textContent = initials;
  }
  const nameEl = document.querySelector('.user-name');
  if (nameEl) nameEl.textContent = `${user.nombre} ${user.apellido}`;
  const roleEl = document.querySelector('.user-role');
  if (roleEl) roleEl.textContent = user.rol === 'admin' ? 'Administrador' : 'Usuario';

  // Mostrar sección admin solo si es admin
  document.querySelectorAll('.admin-only').forEach(el => {
    if (user.rol !== 'admin') el.style.display = 'none';
  });

  // Marcar item activo
  const current = window.location.pathname;
  document.querySelectorAll('.nav-item[href]').forEach(a => {
    if (a.getAttribute('href') === current || current.includes(a.getAttribute('href').replace('/','').replace('.html',''))) {
      a.classList.add('active');
    }
  });

  // Logout
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try { await Api.post('/auth/logout', {}); } catch {}
      Session.destroy();
      window.location.replace('/index.html');
    });
  }

  // Hamburger móvil
  const hamburger = document.querySelector('.hamburger-btn');
  const sidebar   = document.querySelector('.sidebar');
  if (hamburger && sidebar) {
    hamburger.addEventListener('click', () => sidebar.classList.toggle('open'));
    document.addEventListener('click', (e) => {
      if (!sidebar.contains(e.target) && !hamburger.contains(e.target)) {
        sidebar.classList.remove('open');
      }
    });
  }
}
