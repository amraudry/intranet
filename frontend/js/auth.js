// =============================================================
// Archivo: frontend/js/auth.js
// Propósito: Lógica de autenticación local + SSO Microsoft
// =============================================================
'use strict';

document.addEventListener('DOMContentLoaded', () => {

  // Si ya hay sesión válida, redirigir
  Session.loadFromURL();
  if (Session.isValid()) {
    window.location.replace(Session.isAdmin() ? '/admin/panel.html' : '/home.html');
    return;
  }

  // Mostrar mensajes del URL (expiración, error SSO)
  const params = new URLSearchParams(window.location.search);
  if (params.get('expired') === '1')   showAlert('Tu sesión expiró. Por favor vuelve a ingresar.', 'warning');
  if (params.get('timeout') === '1')   showAlert('Sesión cerrada por inactividad.', 'warning');
  if (params.get('sso_error'))         showAlert(`Error en inicio de sesión Microsoft: ${Security.escapeHTML(params.get('sso_error'))}`, 'error');

  // Generar CSRF token
  const csrf = generateCSRF();
  document.getElementById('csrf-token').value = csrf;

  // Referencias DOM
  const form        = document.getElementById('login-form');
  const emailInput  = document.getElementById('email');
  const passInput   = document.getElementById('password');
  const submitBtn   = document.getElementById('submit-btn');
  const btnText     = document.getElementById('btn-text');
  const btnSpinner  = document.getElementById('btn-spinner');
  const rateLimitEl = document.getElementById('rate-limit-msg');
  const countdownEl = document.getElementById('countdown');
  const togglePass  = document.getElementById('toggle-password');

  // Toggle contraseña visible
  togglePass.addEventListener('click', () => {
    const isText = passInput.type === 'text';
    passInput.type = isText ? 'password' : 'text';
    togglePass.setAttribute('aria-label', isText ? 'Mostrar contraseña' : 'Ocultar contraseña');
  });

  // ── SUBMIT DEL FORMULARIO ─────────────────────────────────
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();

    // Verificar rate limit local
    if (isRateLimited()) return;

    const email    = emailInput.value.trim();
    const password = passInput.value;

    // Validación cliente
    let valid = true;
    if (!validateEmail(email)) {
      showFieldError('email-error', 'Ingresa un correo electrónico válido.');
      emailInput.classList.add('error');
      valid = false;
    }
    if (!password || password.length < 1) {
      showFieldError('password-error', 'La contraseña es requerida.');
      passInput.classList.add('error');
      valid = false;
    }
    if (!valid) return;

    // Verificar CSRF
    const csrfVal = document.getElementById('csrf-token').value;
    if (!csrfVal || csrfVal !== csrf) {
      showAlert('Error de seguridad. Recarga la página.', 'error');
      return;
    }

    setLoading(true);

    try {
      const data = await Api.post('/auth/login', { email, password });
      if (!data) return; // redirigido por expiración

      // Guardar sesión
      Session.save(data.token, data.usuario);

      // Redirigir según rol
      const dest = data.usuario.rol === 'admin' ? '/admin/panel.html' : '/home.html';
      window.location.replace(dest);

    } catch (err) {
      recordFailedAttempt();
      showAlert(err.message || 'Credenciales incorrectas. Verifica tus datos.', 'error');
      passInput.value = '';
      passInput.focus();
    } finally {
      setLoading(false);
    }
  });

  // ── HELPERS ───────────────────────────────────────────────

  function setLoading(on) {
    submitBtn.disabled = on;
    btnText.hidden     = on;
    btnSpinner.hidden  = !on;
  }

  function showAlert(msg, type = 'error') {
    const el = document.getElementById('auth-alert');
    el.className = `auth-alert ${type}`;
    el.textContent = msg;
    el.hidden = false;
  }

  function clearErrors() {
    document.getElementById('auth-alert').hidden = true;
    ['email-error', 'password-error'].forEach(id => {
      document.getElementById(id).hidden = true;
    });
    [emailInput, passInput].forEach(el => el.classList.remove('error'));
  }

  function showFieldError(id, msg) {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.hidden = false;
  }

  function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    return re.test(email) && email.length <= 255;
  }

  function generateCSRF() {
    const arr = new Uint8Array(24);
    crypto.getRandomValues(arr);
    return btoa(String.fromCharCode(...arr));
  }

  // ── RATE LIMITING CLIENTE (5 intentos / 30 seg) ───────────
  const RL_KEY        = '__iarq_rl';
  const RL_MAX        = 5;
  const RL_WINDOW_MS  = 30 * 1000;
  let countdownTimer  = null;

  function getAttempts() {
    try {
      const raw = sessionStorage.getItem(RL_KEY);
      return raw ? JSON.parse(raw) : { count: 0, since: Date.now() };
    } catch { return { count: 0, since: Date.now() }; }
  }

  function recordFailedAttempt() {
    const data = getAttempts();
    if (Date.now() - data.since > RL_WINDOW_MS) {
      sessionStorage.setItem(RL_KEY, JSON.stringify({ count: 1, since: Date.now() }));
    } else {
      data.count++;
      sessionStorage.setItem(RL_KEY, JSON.stringify(data));
      if (data.count >= RL_MAX) startRateLimitCountdown();
    }
  }

  function isRateLimited() {
    const data = getAttempts();
    if (Date.now() - data.since > RL_WINDOW_MS) {
      sessionStorage.removeItem(RL_KEY);
      return false;
    }
    if (data.count >= RL_MAX) {
      const remaining = Math.ceil((RL_WINDOW_MS - (Date.now() - data.since)) / 1000);
      if (remaining > 0) {
        startRateLimitCountdown(remaining);
        return true;
      }
      sessionStorage.removeItem(RL_KEY);
    }
    return false;
  }

  function startRateLimitCountdown(seconds = 30) {
    let count = seconds;
    rateLimitEl.hidden = false;
    submitBtn.disabled = true;
    if (countdownEl) countdownEl.textContent = count;

    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
      count--;
      if (countdownEl) countdownEl.textContent = count;
      if (count <= 0) {
        clearInterval(countdownTimer);
        rateLimitEl.hidden = true;
        submitBtn.disabled = false;
        sessionStorage.removeItem(RL_KEY);
      }
    }, 1000);
  }

  // Verificar al cargar si ya estamos bloqueados
  if (isRateLimited()) {
    const data     = getAttempts();
    const remaining = Math.ceil((RL_WINDOW_MS - (Date.now() - data.since)) / 1000);
    if (remaining > 0) startRateLimitCountdown(remaining);
  }

});
