// =============================================================
// Archivo: backend/routes/documents.js
// Propósito: API REST para gestión de documentos
// =============================================================
'use strict';

const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const { v4: uuidv4 } = require('uuid');
const { body, query, param, validationResult } = require('express-validator');

const { pool }                          = require('../config/database');
const { requireAuth, requireAdmin, logAudit } = require('../middleware/auth');

const router = express.Router();

// =============================================================
// CONFIGURACIÓN MULTER — Subida segura de archivos
// =============================================================
const EXTENSIONES_PERMITIDAS = ['pdf', 'docx', 'xlsx', 'dwg', 'jpg', 'jpeg', 'png'];
const MIME_PERMITIDOS = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg', 'image/png',
  'application/octet-stream', // DWG
];

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = process.env.UPLOAD_DIR || './uploads';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // Sanitizar nombre: slug + UUID para evitar colisiones y path traversal
    const ext      = path.extname(file.originalname).toLowerCase().replace('.', '');
    const safeName = file.originalname
      .replace(/\.[^/.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .substring(0, 80);
    const filename = `${safeName}_${uuidv4().split('-')[0]}.${ext}`;
    cb(null, filename);
  },
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
  if (!EXTENSIONES_PERMITIDAS.includes(ext)) {
    return cb(new Error(`Extensión .${ext} no permitida`), false);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB) || 50) * 1024 * 1024 },
});

// =============================================================
// GET /api/documents — Listar documentos con filtros y paginación
// =============================================================
router.get('/', requireAuth, async (req, res) => {
  const { categoria_id, departamento_id, extension, page = 1, limit = 12, orden = 'reciente' } = req.query;

  const offset   = (Math.max(parseInt(page), 1) - 1) * parseInt(limit);
  const pageSize = Math.min(parseInt(limit), 50); // Máximo 50 por página

  const params = [];
  let whereClause = 'WHERE d.archivado = 0';

  if (categoria_id)    { whereClause += ' AND d.categoria_id = ?';    params.push(parseInt(categoria_id)); }
  if (departamento_id) { whereClause += ' AND d.departamento_id = ?'; params.push(parseInt(departamento_id)); }
  if (extension)       { whereClause += ' AND d.extension = ?';       params.push(extension.toLowerCase()); }

  const ordenMap = {
    reciente: 'd.creado_en DESC',
    nombre:   'd.nombre ASC',
    categoria:'c.nombre ASC',
  };
  const orderBy = ordenMap[orden] || 'd.creado_en DESC';

  try {
    const [docs] = await pool.query(
      `SELECT d.id, d.nombre, d.extension, d.tamano_bytes,
              ROUND(d.tamano_bytes/1048576,2) AS tamano_mb,
              d.version, d.descripcion, d.tags,
              d.creado_en, d.actualizado_en,
              c.nombre AS categoria, c.icono AS categoria_icono, c.color_hex,
              dep.nombre AS departamento,
              CONCAT(u.nombre,' ',u.apellido) AS subido_por,
              (SELECT COUNT(*) FROM descargas_documento dd WHERE dd.documento_id=d.id) AS descargas
       FROM documentos d
       JOIN categorias_documento c   ON d.categoria_id=c.id
       LEFT JOIN departamentos dep   ON d.departamento_id=dep.id
       JOIN usuarios u               ON d.subido_por=u.id
       ${whereClause}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM documentos d ${whereClause}`,
      params
    );

    res.json({
      data: docs,
      pagination: {
        total,
        page:  parseInt(page),
        limit: pageSize,
        pages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    console.error('[docs-list]', err);
    res.status(500).json({ error: 'Error al obtener documentos' });
  }
});

// =============================================================
// GET /api/documents/search — Búsqueda full-text
// =============================================================
router.get('/search', requireAuth, [
  query('q').trim().isLength({ min: 2, max: 200 }).withMessage('Query entre 2 y 200 caracteres'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { q, categoria_id, extension } = req.query;

  try {
    await logAudit(pool, {
      usuario_id: req.usuario.id,
      accion:     'BUSQUEDA',
      detalle:    { query: q },
      ip:         req.ip,
    });

    const params = [q, q];
    let extraWhere = '';
    if (categoria_id) { extraWhere += ' AND d.categoria_id = ?'; params.push(parseInt(categoria_id)); }
    if (extension)    { extraWhere += ' AND d.extension = ?';    params.push(extension); }

    const [results] = await pool.execute(
      `SELECT
         d.id, d.nombre, d.extension, d.version, d.creado_en,
         ROUND(d.tamano_bytes/1048576,2) AS tamano_mb,
         c.nombre AS categoria, c.icono AS categoria_icono, c.color_hex,
         dep.nombre AS departamento,
         -- Snippet del contenido (300 chars alrededor del match)
         CASE
           WHEN d.contenido_texto IS NOT NULL
             THEN SUBSTRING(d.contenido_texto,
                    GREATEST(1, LOCATE(?, d.contenido_texto) - 80),
                    300)
           ELSE d.descripcion
         END AS snippet,
         MATCH(d.nombre, d.descripcion, d.contenido_texto, d.tags)
           AGAINST(? IN NATURAL LANGUAGE MODE) AS relevancia
       FROM documentos d
       JOIN categorias_documento c   ON d.categoria_id=c.id
       LEFT JOIN departamentos dep   ON d.departamento_id=dep.id
       WHERE d.archivado = 0
         AND MATCH(d.nombre, d.descripcion, d.contenido_texto, d.tags)
             AGAINST(? IN NATURAL LANGUAGE MODE)
         ${extraWhere}
       ORDER BY relevancia DESC
       LIMIT 30`,
      [q, q, q, ...params.slice(2)]
    );

    res.json({ query: q, total: results.length, results });
  } catch (err) {
    console.error('[docs-search]', err);
    res.status(500).json({ error: 'Error en búsqueda' });
  }
});

// =============================================================
// GET /api/documents/:id — Detalle de un documento
// =============================================================
router.get('/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });

  try {
    const [rows] = await pool.execute(
      `SELECT d.*, c.nombre AS categoria, c.icono AS categoria_icono,
              dep.nombre AS departamento,
              CONCAT(u.nombre,' ',u.apellido) AS subido_por_nombre
       FROM documentos d
       JOIN categorias_documento c   ON d.categoria_id=c.id
       LEFT JOIN departamentos dep   ON d.departamento_id=dep.id
       JOIN usuarios u               ON d.subido_por=u.id
       WHERE d.id = ? AND d.archivado = 0`,
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Documento no encontrado' });

    // Historial de versiones
    const [versiones] = await pool.execute(
      `SELECT v.version, v.comentario, v.creado_en,
              CONCAT(u.nombre,' ',u.apellido) AS subido_por
       FROM versiones_documento v
       JOIN usuarios u ON v.subido_por=u.id
       WHERE v.documento_id=?
       ORDER BY v.creado_en DESC`,
      [id]
    );

    const doc = rows[0];
    delete doc.contenido_texto; // No exponer el texto completo en el detalle
    res.json({ ...doc, versiones });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener documento' });
  }
});

// =============================================================
// GET /api/documents/:id/download — Descarga segura
// =============================================================
router.get('/:id/download', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });

  try {
    const [rows] = await pool.execute(
      `SELECT nombre, nombre_archivo, ruta_almacenamiento, tipo_mime
       FROM documentos WHERE id = ? AND archivado = 0`,
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Documento no encontrado' });

    const doc      = rows[0];
    const filePath = path.resolve(doc.ruta_almacenamiento);

    // Seguridad: verificar que el path no escapa del directorio de uploads
    const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
    if (!filePath.startsWith(uploadDir)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Archivo físico no encontrado' });
    }

    // Registrar descarga
    await pool.execute(
      `INSERT INTO descargas_documento (documento_id, usuario_id, ip_address)
       VALUES (?, ?, ?)`,
      [id, req.usuario.id, req.ip]
    );

    await logAudit(pool, {
      usuario_id: req.usuario.id,
      accion:     'DESCARGA',
      entidad:    'documento',
      entidad_id: id,
      ip:         req.ip,
    });

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.nombre_archivo)}"`);
    res.setHeader('Content-Type', doc.tipo_mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(filePath);
  } catch (err) {
    console.error('[download]', err);
    res.status(500).json({ error: 'Error al descargar' });
  }
});

// =============================================================
// POST /api/documents — Subir nuevo documento (solo admin)
// =============================================================
router.post('/', requireAuth, requireAdmin, upload.single('archivo'), [
  body('nombre').trim().isLength({ min: 3, max: 255 }),
  body('categoria_id').isInt({ min: 1 }),
  body('version').optional().trim().isLength({ max: 20 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    if (req.file) fs.unlinkSync(req.file.path); // Limpiar archivo si validación falla
    return res.status(400).json({ errors: errors.array() });
  }

  if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });

  const {
    nombre, categoria_id, departamento_id, version = '1.0',
    descripcion, tags,
  } = req.body;

  try {
    const [result] = await pool.execute(
      `INSERT INTO documentos
         (nombre, nombre_archivo, ruta_almacenamiento, tipo_mime, extension,
          tamano_bytes, categoria_id, departamento_id, version, descripcion, tags, subido_por)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        nombre,
        req.file.filename,
        req.file.path,
        req.file.mimetype,
        path.extname(req.file.originalname).replace('.', '').toLowerCase(),
        req.file.size,
        parseInt(categoria_id),
        departamento_id ? parseInt(departamento_id) : null,
        version,
        descripcion || null,
        tags || null,
        req.usuario.id,
      ]
    );

    await logAudit(pool, {
      usuario_id: req.usuario.id,
      accion:     'SUBIDA_DOCUMENTO',
      entidad:    'documento',
      entidad_id: result.insertId,
      detalle:    { nombre },
      ip:         req.ip,
    });

    res.status(201).json({ id: result.insertId, message: 'Documento subido correctamente' });
  } catch (err) {
    if (req.file) fs.unlinkSync(req.file.path);
    console.error('[upload]', err);
    res.status(500).json({ error: 'Error al guardar documento' });
  }
});

// =============================================================
// PUT /api/documents/:id — Actualizar metadatos (solo admin)
// =============================================================
router.put('/:id', requireAuth, requireAdmin, [
  body('nombre').optional().trim().isLength({ min: 3, max: 255 }),
  body('categoria_id').optional().isInt({ min: 1 }),
], async (req, res) => {
  const id = parseInt(req.params.id);
  const { nombre, categoria_id, departamento_id, version, descripcion, tags } = req.body;

  try {
    await pool.execute(
      `UPDATE documentos SET
         nombre          = COALESCE(?, nombre),
         categoria_id    = COALESCE(?, categoria_id),
         departamento_id = COALESCE(?, departamento_id),
         version         = COALESCE(?, version),
         descripcion     = COALESCE(?, descripcion),
         tags            = COALESCE(?, tags)
       WHERE id = ? AND archivado = 0`,
      [nombre||null, categoria_id||null, departamento_id||null, version||null, descripcion||null, tags||null, id]
    );

    await logAudit(pool, { usuario_id: req.usuario.id, accion: 'EDICION_DOCUMENTO', entidad: 'documento', entidad_id: id, ip: req.ip });
    res.json({ message: 'Documento actualizado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar' });
  }
});

// =============================================================
// DELETE /api/documents/:id — Archivar (soft delete) (solo admin)
// =============================================================
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    await pool.execute(
      `UPDATE documentos SET archivado=1, archivado_en=NOW(), archivado_por=? WHERE id=?`,
      [req.usuario.id, id]
    );
    await logAudit(pool, { usuario_id: req.usuario.id, accion: 'ARCHIVO_DOCUMENTO', entidad: 'documento', entidad_id: id, ip: req.ip });
    res.json({ message: 'Documento archivado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al archivar' });
  }
});

module.exports = router;
