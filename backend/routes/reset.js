'use strict';
const express = require('express');
const bcrypt  = require('bcrypt');
const router  = express.Router();
const { pool } = require('../config/database');

router.get('/reset-passwords', async (req, res) => {
  try {
    const hash = await bcrypt.hash('Admin2024!', 10);
    await pool.execute(
      `UPDATE usuarios SET password_hash = ? WHERE email = 'admin@empresa.com'`,
      [hash]
    );
    res.json({ ok: true, mensaje: 'Contraseña actualizada correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
