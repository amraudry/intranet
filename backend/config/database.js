// =============================================================
// Archivo: backend/config/database.js
// Propósito: Conexión a MySQL con pool de conexiones
// =============================================================
'use strict';

const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  port:               parseInt(process.env.DB_PORT) || 3306,
  user:               process.env.DB_USER,
  password:           process.env.DB_PASSWORD,
  database:           process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  charset:            'utf8mb4',
  timezone:           'local',
  // Seguridad: no exponer credenciales en errores
  debug:              false,
  multipleStatements: false, // Prevenir inyección SQL multi-statement
  ssl: { rejectUnauthorized: false }
});

// Verificar conexión al iniciar
async function testConnection() {
  try {
    const conn = await pool.getConnection();
    console.log('✅  Conexión a MySQL establecida correctamente');
    conn.release();
  } catch (err) {
    console.error('❌  Error al conectar con MySQL:', err.message);
    process.exit(1);
  }
}

module.exports = { pool, testConnection };
