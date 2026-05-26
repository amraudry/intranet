// =============================================================
// Archivo: backend/routes/auth.js
// Propósito: Rutas de autenticación local y SSO Microsoft
// =============================================================
'use strict';

const express  = require('express');
const bcrypt   = require('bcrypt');
const jwt      = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const axios    = require('axios');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

const { pool }                    = require('../config/database');
const { requireAuth, logAudit }   = require('../middleware/auth');

const router = express.Router();

// Rate limit estricto solo para login (5 intentos / 15 min)
const loginLimiter = rateLimit({
  windowMs:  15 * 60 * 1000,
  max:       parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 5,
  message:   { error: 'Demasiados intentos. Intenta en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator: (req) => req.ip + ':' + (req.body?.email || ''),
});

// =============================================================
// POST /api/auth/login — Autenticación local
// =============================================================
router.post('/login',
  loginLimiter,
  [
    body('email')
      .isEmail().withMessage('Email inválido')
      .normalizeEmail()
      .isLength({ max: 255 }),
    body('password')
      .notEmpty().withMessage('Contraseña requerida')
      .isLength({ min: 1, max: 128 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;
    const ip        = req.ip;
    const userAgent = req.headers['user-agent'] || '';

    try {
      // Buscar usuario activo
      const [rows] = await pool.execute(
        `SELECT id, nombre, apellido, email, password_hash, rol, departamento_id, avatar_url
         FROM usuarios
         WHERE email = ? AND activo = 1 AND sso_provider IS NULL`,
        [email]
      );

      if (rows.length === 0) {
        await logAudit(pool, { accion: 'LOGIN_FALLIDO', detalle: { email }, ip, user_agent: userAgent, resultado: 'fallo' });
        // Respuesta genérica: no revelar si el email existe
        return res.status(401).json({ error: 'Credenciales incorrectas' });
      }

      const usuario = rows[0];
      const passwordOk = await bcrypt.compare(password, usuario.password_hash);

      if (!passwordOk) {
        await logAudit(pool, { usuario_id: usuario.id, accion: 'LOGIN_FALLIDO', ip, user_agent: userAgent, resultado: 'fallo' });
        return res.status(401).json({ error: 'Credenciales incorrectas' });
      }

      // Generar JWT
      const jti   = uuidv4();
      const token = jwt.sign(
        { sub: usuario.id, email: usuario.email, rol: usuario.rol, jti },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
      );

      const expiraEn = new Date(Date.now() + 8 * 60 * 60 * 1000);

      // Guardar sesión en BD
      await pool.execute(
        `INSERT INTO sesiones (usuario_id, token_jti, ip_address, user_agent, expira_en)
         VALUES (?, ?, ?, ?, ?)`,
        [usuario.id, jti, ip, userAgent.substring(0, 499), expiraEn]
      );

      // Actualizar último login
      await pool.execute(`UPDATE usuarios SET ultimo_login = NOW() WHERE id = ?`, [usuario.id]);

      await logAudit(pool, { usuario_id: usuario.id, accion: 'LOGIN', ip, user_agent: userAgent });

      return res.json({
        token,
        usuario: {
          id:       usuario.id,
          nombre:   usuario.nombre,
          apellido: usuario.apellido,
          email:    usuario.email,
          rol:      usuario.rol,
          avatar_url: usuario.avatar_url,
        },
      });
    } catch (err) {
      console.error('[login]', err);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  }
);

// =============================================================
// GET /api/auth/sso/microsoft — Iniciar flujo OAuth2
// =============================================================
router.get('/sso/microsoft', (req, res) => {
  const params = new URLSearchParams({
    client_id:     process.env.MICROSOFT_CLIENT_ID,
    response_type: 'code',
    redirect_uri:  process.env.MICROSOFT_REDIRECT_URI,
    scope:         'openid profile email User.Read',
    response_mode: 'query',
    state:         uuidv4(), // Anti-CSRF state
  });

  const authUrl = `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}/oauth2/v2.0/authorize?${params}`;
  res.redirect(authUrl);
});

// =============================================================
// GET /api/auth/callback — Callback OAuth2 Microsoft
// =============================================================
router.get('/callback', async (req, res) => {
  const { code, error } = req.query;
  const ip        = req.ip;
  const userAgent = req.headers['user-agent'] || '';

  if (error) {
    return res.redirect(`${process.env.FRONTEND_URL}/index.html?sso_error=${encodeURIComponent(error)}`);
  }
  if (!code) {
    return res.redirect(`${process.env.FRONTEND_URL}/index.html?sso_error=no_code`);
  }

  try {
    // Intercambiar code por access_token
    const tokenRes = await axios.post(
      `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`,
      new URLSearchParams({
        client_id:     process.env.MICROSOFT_CLIENT_ID,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET,
        code,
        redirect_uri:  process.env.MICROSOFT_REDIRECT_URI,
        grant_type:    'authorization_code',
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token } = tokenRes.data;

    // Obtener perfil del usuario de Microsoft Graph
    const profileRes = await axios.get('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const profile = profileRes.data;
    const email   = profile.mail || profile.userPrincipalName;

    // Buscar o crear usuario en BD
    let [rows] = await pool.execute(
      `SELECT id, nombre, apellido, email, rol, avatar_url
       FROM usuarios WHERE email = ? AND activo = 1`,
      [email]
    );

    let usuario;
    if (rows.length > 0) {
      usuario = rows[0];
      // Actualizar datos SSO si es necesario
      await pool.execute(
        `UPDATE usuarios SET sso_provider='microsoft', sso_subject=?, ultimo_login=NOW() WHERE id=?`,
        [profile.id, usuario.id]
      );
    } else {
      // Crear usuario nuevo (rol estandar por defecto)
      const [result] = await pool.execute(
        `INSERT INTO usuarios (nombre, apellido, email, rol, sso_provider, sso_subject, ultimo_login)
         VALUES (?, ?, ?, 'estandar', 'microsoft', ?, NOW())`,
        [profile.givenName || '', profile.surname || '', email, profile.id]
      );
      const [newUser] = await pool.execute(
        `SELECT id, nombre, apellido, email, rol, avatar_url FROM usuarios WHERE id = ?`,
        [result.insertId]
      );
      usuario = newUser[0];
    }

    // Generar JWT
    const jti   = uuidv4();
    const token = jwt.sign(
      { sub: usuario.id, email: usuario.email, rol: usuario.rol, jti },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    const expiraEn = new Date(Date.now() + 8 * 60 * 60 * 1000);
    await pool.execute(
      `INSERT INTO sesiones (usuario_id, token_jti, ip_address, user_agent, expira_en) VALUES (?,?,?,?,?)`,
      [usuario.id, jti, ip, userAgent.substring(0, 499), expiraEn]
    );

    await logAudit(pool, { usuario_id: usuario.id, accion: 'LOGIN_SSO_MICROSOFT', ip, user_agent: userAgent });

    // Redirigir al frontend con el token (en query param — en producción usar cookie HttpOnly)
    const redirectUrl = usuario.rol === 'admin'
      ? `${process.env.FRONTEND_URL}/admin/panel.html`
      : `${process.env.FRONTEND_URL}/home.html`;

    res.redirect(`${redirectUrl}?token=${encodeURIComponent(token)}&uid=${usuario.id}`);
  } catch (err) {
    console.error('[sso-callback]', err.message);
    res.redirect(`${process.env.FRONTEND_URL}/index.html?sso_error=server_error`);
  }
});

// =============================================================
// POST /api/auth/logout — Invalidar sesión
// =============================================================
router.post('/logout', requireAuth, async (req, res) => {
  try {
    await pool.execute(
      `UPDATE sesiones SET activa = 0 WHERE token_jti = ?`,
      [req.usuario.jti]
    );
    await logAudit(pool, { usuario_id: req.usuario.id, accion: 'LOGOUT', ip: req.ip });
    res.json({ message: 'Sesión cerrada correctamente' });
  } catch (err) {
    res.status(500).json({ error: 'Error al cerrar sesión' });
  }
});

// =============================================================
// GET /api/auth/me — Datos del usuario autenticado
// =============================================================
router.get('/me', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT u.id, u.nombre, u.apellido, u.email, u.rol, u.avatar_url,
              u.ultimo_login, dep.nombre AS departamento
       FROM usuarios u
       LEFT JOIN departamentos dep ON u.departamento_id = dep.id
       WHERE u.id = ?`,
      [req.usuario.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
