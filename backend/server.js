// =============================================================
// Archivo: backend/server.js
// Propósito: Servidor Express principal con todas las capas de seguridad
// Versión: 1.0.0
// =============================================================
'use strict';

require('dotenv').config();

const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');
const path       = require('path');

const { testConnection }  = require('./config/database');
const authRoutes          = require('./routes/auth');
const documentsRoutes     = require('./routes/documents');
const adminRoutes         = require('./routes/admin');
const { pool }            = require('./config/database');
const { requireAuth }     = require('./middleware/auth');

const app  = express();
const PORT = process.env.PORT || 3000;

// =============================================================
// SEGURIDAD: Helmet — Headers HTTP de seguridad
// =============================================================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'"],
      styleSrc:    ["'self'", 'https://fonts.googleapis.com'],
      fontSrc:     ['https://fonts.gstatic.com'],
      imgSrc:      ["'self'", 'data:'],
      connectSrc:  ["'self'", 'https://login.microsoftonline.com', 'https://intranet-8wfi.onrender.com', 'https://intranet-drab-gamma.vercel.app/'],
      frameSrc:    ["'none'"],
      objectSrc:   ["'none'"],
    },
  },
  hsts: {
    maxAge:            31536000, // 1 año
    includeSubDomains: true,
    preload:           true,
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// =============================================================
// CORS — Solo permitir el frontend autorizado
// =============================================================
app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      process.env.FRONTEND_URL,
      'http://localhost:5500',
      'http://localhost:3000'
    ];
    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('No permitido por CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// =============================================================
// Rate Limiting global — 100 requests / 15 min por IP
// =============================================================
app.use(rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { error: 'Demasiadas solicitudes. Intenta más tarde.' },
}));

// =============================================================
// PARSERS
// =============================================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// =============================================================
// LOGGING
// =============================================================
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// =============================================================
// RUTAS DE API
// =============================================================
app.use('/api/auth',      authRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/admin',     adminRoutes);
app.use('/api', require('./routes/reset'));

// Categorías (público tras autenticación)
app.get('/api/categories', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, nombre, descripcion, icono, color_hex,
              (SELECT COUNT(*) FROM documentos d WHERE d.categoria_id=c.id AND d.archivado=0) AS total_docs
       FROM categorias_documento c
       WHERE activo=1 ORDER BY orden ASC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener categorías' });
  }
});

// Avisos públicos (para el dashboard)
app.get('/api/avisos', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, titulo, contenido, tipo, creado_en
       FROM avisos
       WHERE activo=1 AND (expira_en IS NULL OR expira_en > NOW())
       ORDER BY creado_en DESC LIMIT 5`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener avisos' });
  }
});

// Registrar visita de página
app.post('/api/track', requireAuth, async (req, res) => {
  const { pagina, duracion_seg } = req.body;
  if (!pagina || typeof pagina !== 'string') return res.status(400).json({ error: 'Página requerida' });
  try {
    await pool.execute(
      `INSERT INTO log_visitas_pagina (usuario_id, pagina, duracion_seg, ip_address)
       VALUES (?,?,?,?)`,
      [req.usuario.id, pagina.substring(0, 199), duracion_seg || null, req.ip]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al registrar visita' });
  }
});

// Servir archivos del frontend (en producción)
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
  });
}

// =============================================================
// MANEJADOR DE ERRORES GLOBAL
// =============================================================
app.use((err, req, res, next) => {
  // Error de Multer (archivo)
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `Archivo muy grande. Máximo ${process.env.MAX_FILE_SIZE_MB || 50}MB` });
  }
  if (err.message && err.message.includes('no permitida')) {
    return res.status(400).json({ error: err.message });
  }
  console.error('[global-error]', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// =============================================================
// INICIO DEL SERVIDOR
// =============================================================
async function startServer() {
  await testConnection();
  app.listen(PORT, () => {
    console.log(`\n🏗️  Intranet ARQ — Backend corriendo en http://localhost:${PORT}`);
    console.log(`📦  Entorno: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📂  Directorio uploads: ${process.env.UPLOAD_DIR || './uploads'}\n`);
  });
}

startServer().catch(err => {
  console.error('Error al iniciar servidor:', err);
  process.exit(1);
});

module.exports = app;
