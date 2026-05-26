// =============================================================
// Archivo: backend/routes/admin.js
// Propósito: Rutas de administración — usuarios, analíticas, avisos
// =============================================================
'use strict';

const express = require('express');
const bcrypt  = require('bcrypt');
const { body, validationResult } = require('express-validator');
const { pool }                          = require('../config/database');
const { requireAuth, requireAdmin, logAudit } = require('../middleware/auth');

const router = express.Router();

// Todos los endpoints requieren admin
router.use(requireAuth, requireAdmin);

// =============================================================
// GET /api/admin/stats — Dashboard KPIs
// =============================================================
router.get('/stats', async (req, res) => {
  try {
    const [[stats]] = await pool.execute(`CALL sp_dashboard_stats()`);
    res.json(stats[0]);
  } catch (err) {
    // Fallback sin stored procedure
    const [[docs]]    = await pool.execute(`SELECT COUNT(*) AS c FROM documentos WHERE archivado=0`);
    const [[users]]   = await pool.execute(`SELECT COUNT(*) AS c FROM usuarios WHERE activo=1`);
    const [[dls]]     = await pool.execute(`SELECT COUNT(*) AS c FROM descargas_documento WHERE creado_en >= DATE_FORMAT(NOW(),'%Y-%m-01')`);
    const [[nuevos]]  = await pool.execute(`SELECT COUNT(*) AS c FROM documentos WHERE archivado=0 AND creado_en >= DATE_SUB(NOW(),INTERVAL 7 DAY)`);
    const [[visitas]] = await pool.execute(`SELECT COUNT(*) AS c FROM log_visitas_pagina WHERE creado_en >= DATE_FORMAT(NOW(),'%Y-%m-01')`);
    res.json({
      total_documentos:   docs[0].c,
      total_usuarios:     users[0].c,
      descargas_mes:      dls[0].c,
      docs_nuevos_semana: nuevos[0].c,
      visitas_mes:        visitas[0].c,
    });
  }
});

// =============================================================
// GET /api/admin/analytics/visitas — Visitas diarias 30 días
// =============================================================
router.get('/analytics/visitas', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT DATE(creado_en) AS fecha,
              COUNT(*) AS total_visitas,
              COUNT(DISTINCT usuario_id) AS usuarios_unicos
       FROM log_visitas_pagina
       WHERE creado_en >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
       GROUP BY DATE(creado_en)
       ORDER BY fecha ASC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener visitas' });
  }
});

// =============================================================
// GET /api/admin/analytics/descargas — Top docs más descargados
// =============================================================
router.get('/analytics/descargas', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT d.id, d.nombre, c.nombre AS categoria,
              COUNT(dd.id) AS total_descargas
       FROM descargas_documento dd
       JOIN documentos d           ON dd.documento_id=d.id
       JOIN categorias_documento c ON d.categoria_id=c.id
       GROUP BY d.id, d.nombre, c.nombre
       ORDER BY total_descargas DESC
       LIMIT 10`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error analíticas descargas' });
  }
});

// =============================================================
// GET /api/admin/analytics/heatmap — Mapa de calor uso semanal
// =============================================================
router.get('/analytics/heatmap', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT
         DAYOFWEEK(creado_en) - 1 AS dia_semana,
         HOUR(creado_en)          AS hora,
         COUNT(*)                 AS total
       FROM log_visitas_pagina
       WHERE creado_en >= DATE_SUB(NOW(), INTERVAL 90 DAY)
       GROUP BY dia_semana, hora
       ORDER BY dia_semana, hora`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error analíticas heatmap' });
  }
});

// =============================================================
// GET /api/admin/audit — Log de auditoría reciente
// =============================================================
router.get('/audit', async (req, res) => {
  const { limit = 50, page = 1 } = req.query;
  const pageSize = Math.min(parseInt(limit), 200);
  const offset   = (Math.max(parseInt(page), 1) - 1) * pageSize;
  try {
    const [rows] = await pool.execute(
      `SELECT la.id, la.accion, la.entidad, la.entidad_id,
              la.detalle, la.ip_address, la.resultado, la.creado_en,
              CONCAT(u.nombre,' ',u.apellido) AS usuario_nombre,
              u.email AS usuario_email
       FROM log_auditoria la
       LEFT JOIN usuarios u ON la.usuario_id=u.id
       ORDER BY la.creado_en DESC
       LIMIT ? OFFSET ?`,
      [pageSize, offset]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener auditoría' });
  }
});

// =============================================================
// GET /api/admin/users — Listar todos los usuarios
// =============================================================
router.get('/users', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT u.id, u.nombre, u.apellido, u.email, u.rol,
              u.activo, u.sso_provider, u.ultimo_login, u.creado_en,
              dep.nombre AS departamento
       FROM usuarios u
       LEFT JOIN departamentos dep ON u.departamento_id=dep.id
       ORDER BY u.creado_en DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al listar usuarios' });
  }
});

// =============================================================
// POST /api/admin/users — Crear usuario
// =============================================================
router.post('/users', [
  body('email').isEmail().normalizeEmail(),
  body('nombre').trim().isLength({ min: 2, max: 120 }),
  body('apellido').trim().isLength({ min: 2, max: 120 }),
  body('password').isLength({ min: 8, max: 128 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
    .withMessage('Mínimo 8 chars, mayúscula, número y caracter especial'),
  body('rol').isIn(['admin', 'estandar']),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, nombre, apellido, password, rol, departamento_id } = req.body;
  try {
    const hash = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS) || 12);
    const [result] = await pool.execute(
      `INSERT INTO usuarios (nombre, apellido, email, password_hash, rol, departamento_id)
       VALUES (?,?,?,?,?,?)`,
      [nombre, apellido, email, hash, rol, departamento_id || null]
    );
    await logAudit(pool, { usuario_id: req.usuario.id, accion: 'CREAR_USUARIO', entidad: 'usuario', entidad_id: result.insertId, ip: req.ip });
    res.status(201).json({ id: result.insertId, message: 'Usuario creado' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Email ya registrado' });
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

// =============================================================
// PATCH /api/admin/users/:id — Actualizar rol o estado
// =============================================================
router.patch('/users/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { rol, activo } = req.body;

  // No puede auto-modificarse
  if (id === req.usuario.id) {
    return res.status(403).json({ error: 'No puedes modificar tu propio usuario' });
  }

  try {
    const updates = [];
    const params  = [];
    if (rol !== undefined)    { updates.push('rol=?');    params.push(rol); }
    if (activo !== undefined) { updates.push('activo=?'); params.push(activo ? 1 : 0); }
    if (updates.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });

    params.push(id);
    await pool.execute(`UPDATE usuarios SET ${updates.join(',')} WHERE id=?`, params);
    await logAudit(pool, { usuario_id: req.usuario.id, accion: 'MODIFICAR_USUARIO', entidad: 'usuario', entidad_id: id, detalle: { rol, activo }, ip: req.ip });
    res.json({ message: 'Usuario actualizado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
});

// =============================================================
// GET /api/admin/avisos — Listar avisos
// =============================================================
router.get('/avisos', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT a.*, CONCAT(u.nombre,' ',u.apellido) AS creado_por_nombre
       FROM avisos a JOIN usuarios u ON a.creado_por=u.id
       ORDER BY a.creado_en DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener avisos' });
  }
});

// =============================================================
// POST /api/admin/avisos — Crear aviso
// =============================================================
router.post('/avisos', [
  body('titulo').trim().isLength({ min: 5, max: 255 }),
  body('contenido').trim().isLength({ min: 10 }),
  body('tipo').isIn(['info', 'advertencia', 'urgente']),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { titulo, contenido, tipo, expira_en } = req.body;
  try {
    const [result] = await pool.execute(
      `INSERT INTO avisos (titulo, contenido, tipo, expira_en, creado_por) VALUES (?,?,?,?,?)`,
      [titulo, contenido, tipo, expira_en || null, req.usuario.id]
    );
    res.status(201).json({ id: result.insertId, message: 'Aviso creado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al crear aviso' });
  }
});

// =============================================================
// GET /api/admin/config — Leer configuración del sitio
// =============================================================
router.get('/config', async (req, res) => {
  try {
    const [rows] = await pool.execute(`SELECT clave, valor, descripcion FROM configuracion_sitio`);
    const config = {};
    rows.forEach(r => { config[r.clave] = { valor: r.valor, descripcion: r.descripcion }; });
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: 'Error al leer configuración' });
  }
});

// =============================================================
// PUT /api/admin/config — Actualizar valor de configuración
// =============================================================
router.put('/config/:clave', async (req, res) => {
  const { clave } = req.params;
  const { valor }  = req.body;
  // Sanitizar clave para evitar inyección
  if (!/^[a-z_]+$/.test(clave)) return res.status(400).json({ error: 'Clave inválida' });
  try {
    await pool.execute(
      `UPDATE configuracion_sitio SET valor=?, actualizado_por=? WHERE clave=?`,
      [valor, req.usuario.id, clave]
    );
    res.json({ message: 'Configuración actualizada' });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar configuración' });
  }
});

module.exports = router;
