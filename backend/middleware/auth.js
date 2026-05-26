// =============================================================
// Archivo: backend/middleware/auth.js
// Propósito: Middleware de autenticación JWT y control de roles
// =============================================================
'use strict';

const jwt    = require('jsonwebtoken');
const { pool } = require('../config/database');

/**
 * Verifica el token JWT en el header Authorization.
 * Valida que el JTI exista en la tabla sesiones (revocación server-side).
 */
async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token de autenticación requerido' });
    }

    const token = authHeader.split(' ')[1];
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ error: 'Token inválido o expirado' });
    }

    // Verificar que la sesión esté activa en BD (permite revocación)
    const [rows] = await pool.execute(
      `SELECT s.id, s.activa, u.id AS uid, u.nombre, u.apellido,
              u.email, u.rol, u.activo AS usuario_activo
       FROM sesiones s
       JOIN usuarios u ON s.usuario_id = u.id
       WHERE s.token_jti = ? AND s.activa = 1 AND s.expira_en > NOW()`,
      [payload.jti]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Sesión inválida o expirada' });
    }

    const sesion = rows[0];
    if (!sesion.usuario_activo) {
      return res.status(403).json({ error: 'Usuario desactivado' });
    }

    // Inyectar usuario en el request
    req.usuario = {
      id:       sesion.uid,
      nombre:   sesion.nombre,
      apellido: sesion.apellido,
      email:    sesion.email,
      rol:      sesion.rol,
      jti:      payload.jti,
    };

    next();
  } catch (err) {
    console.error('[auth] Error:', err.message);
    res.status(500).json({ error: 'Error interno de autenticación' });
  }
}

/**
 * Middleware factory: verifica que el usuario tenga rol 'admin'.
 */
function requireAdmin(req, res, next) {
  if (!req.usuario || req.usuario.rol !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado — se requiere rol administrador' });
  }
  next();
}

/**
 * Registra un evento en el log de auditoría.
 */
async function logAudit(pool, { usuario_id, accion, entidad, entidad_id, detalle, ip, user_agent, resultado = 'exito' }) {
  try {
    await pool.execute(
      `INSERT INTO log_auditoria
         (usuario_id, accion, entidad, entidad_id, detalle, ip_address, user_agent, resultado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        usuario_id   || null,
        accion,
        entidad      || null,
        entidad_id   || null,
        detalle ? JSON.stringify(detalle) : null,
        ip           || null,
        user_agent   || null,
        resultado,
      ]
    );
  } catch (e) {
    // El fallo de auditoría nunca debe interrumpir el flujo principal
    console.error('[audit] Error al registrar:', e.message);
  }
}

module.exports = { requireAuth, requireAdmin, logAudit };
