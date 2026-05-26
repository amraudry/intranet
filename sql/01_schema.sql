-- =============================================================
-- INTRANET CORPORATIVA — ARQUITECTURA & CONSTRUCCIÓN
-- Archivo: 01_schema.sql
-- Propósito: Esquema completo de base de datos
-- Versión: 1.0.0
-- =============================================================

-- Usar UTF-8 para soporte completo de caracteres en español
CREATE DATABASE IF NOT EXISTS intranet_arq
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE intranet_arq;

-- =============================================================
-- TABLA: departamentos
-- =============================================================
CREATE TABLE departamentos (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL,
  descripcion TEXT,
  activo      TINYINT(1) DEFAULT 1,
  creado_en   DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_dept_nombre (nombre)
) ENGINE=InnoDB;

-- =============================================================
-- TABLA: usuarios
-- =============================================================
CREATE TABLE usuarios (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre            VARCHAR(120) NOT NULL,
  apellido          VARCHAR(120) NOT NULL,
  email             VARCHAR(255) NOT NULL,
  password_hash     VARCHAR(255),           -- NULL si usa solo SSO
  rol               ENUM('admin','estandar') NOT NULL DEFAULT 'estandar',
  departamento_id   INT UNSIGNED,
  avatar_url        VARCHAR(500),
  sso_provider      VARCHAR(50),            -- 'microsoft', NULL si local
  sso_subject       VARCHAR(255),           -- ID único del proveedor SSO
  activo            TINYINT(1) DEFAULT 1,
  ultimo_login      DATETIME,
  creado_en         DATETIME DEFAULT CURRENT_TIMESTAMP,
  actualizado_en    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_email (email),
  INDEX idx_rol (rol),
  INDEX idx_activo (activo),
  FOREIGN KEY (departamento_id) REFERENCES departamentos(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- =============================================================
-- TABLA: categorias_documento
-- =============================================================
CREATE TABLE categorias_documento (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(150) NOT NULL,
  descripcion TEXT,
  icono       VARCHAR(50),                  -- Nombre del ícono Lucide
  color_hex   VARCHAR(7),
  orden       INT DEFAULT 0,
  activo      TINYINT(1) DEFAULT 1,
  creado_en   DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cat_nombre (nombre)
) ENGINE=InnoDB;

-- =============================================================
-- TABLA: documentos
-- =============================================================
CREATE TABLE documentos (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre            VARCHAR(255) NOT NULL,
  nombre_archivo    VARCHAR(255) NOT NULL,  -- Nombre sanitizado en disco
  ruta_almacenamiento VARCHAR(500) NOT NULL,-- Ruta relativa en el servidor
  tipo_mime         VARCHAR(100) NOT NULL,
  extension         VARCHAR(10) NOT NULL,
  tamano_bytes      BIGINT UNSIGNED,
  categoria_id      INT UNSIGNED NOT NULL,
  departamento_id   INT UNSIGNED,
  version           VARCHAR(20) DEFAULT '1.0',
  descripcion       TEXT,
  tags              VARCHAR(500),           -- CSV de etiquetas
  contenido_texto   LONGTEXT,              -- Texto extraído para búsqueda FTS
  subido_por        INT UNSIGNED NOT NULL,
  archivado         TINYINT(1) DEFAULT 0,
  archivado_en      DATETIME,
  archivado_por     INT UNSIGNED,
  creado_en         DATETIME DEFAULT CURRENT_TIMESTAMP,
  actualizado_en    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_categoria (categoria_id),
  INDEX idx_departamento (departamento_id),
  INDEX idx_archivado (archivado),
  INDEX idx_creado (creado_en),
  FOREIGN KEY (categoria_id) REFERENCES categorias_documento(id),
  FOREIGN KEY (departamento_id) REFERENCES departamentos(id) ON DELETE SET NULL,
  FOREIGN KEY (subido_por) REFERENCES usuarios(id),
  FOREIGN KEY (archivado_por) REFERENCES usuarios(id) ON DELETE SET NULL,
  FULLTEXT INDEX ft_busqueda (nombre, descripcion, contenido_texto, tags)
) ENGINE=InnoDB;

-- =============================================================
-- TABLA: versiones_documento
-- Historial de versiones de cada documento
-- =============================================================
CREATE TABLE versiones_documento (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  documento_id      INT UNSIGNED NOT NULL,
  version           VARCHAR(20) NOT NULL,
  nombre_archivo    VARCHAR(255) NOT NULL,
  ruta_almacenamiento VARCHAR(500) NOT NULL,
  tamano_bytes      BIGINT UNSIGNED,
  comentario        TEXT,
  subido_por        INT UNSIGNED NOT NULL,
  creado_en         DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_doc_version (documento_id, version),
  FOREIGN KEY (documento_id) REFERENCES documentos(id) ON DELETE CASCADE,
  FOREIGN KEY (subido_por) REFERENCES usuarios(id)
) ENGINE=InnoDB;

-- =============================================================
-- TABLA: sesiones
-- Tokens JWT activos (para invalidación server-side)
-- =============================================================
CREATE TABLE sesiones (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id    INT UNSIGNED NOT NULL,
  token_jti     VARCHAR(36) NOT NULL,       -- JWT ID único (UUID)
  ip_address    VARCHAR(45),                -- IPv4 o IPv6
  user_agent    VARCHAR(500),
  activa        TINYINT(1) DEFAULT 1,
  expira_en     DATETIME NOT NULL,
  creado_en     DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_jti (token_jti),
  INDEX idx_usuario_activa (usuario_id, activa),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =============================================================
-- TABLA: log_auditoria
-- Registro de todas las acciones sensibles
-- =============================================================
CREATE TABLE log_auditoria (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id    INT UNSIGNED,               -- NULL si es acción anónima
  accion        VARCHAR(100) NOT NULL,      -- 'LOGIN', 'LOGOUT', 'DOWNLOAD', etc.
  entidad       VARCHAR(50),                -- 'documento', 'usuario', etc.
  entidad_id    INT UNSIGNED,
  detalle       JSON,                       -- Datos adicionales flexibles
  ip_address    VARCHAR(45),
  user_agent    VARCHAR(500),
  resultado     ENUM('exito','fallo','advertencia') DEFAULT 'exito',
  creado_en     DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_usuario (usuario_id),
  INDEX idx_accion (accion),
  INDEX idx_fecha (creado_en),
  INDEX idx_entidad (entidad, entidad_id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- =============================================================
-- TABLA: log_visitas_pagina
-- Para el panel de analíticas
-- =============================================================
CREATE TABLE log_visitas_pagina (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id    INT UNSIGNED,
  pagina        VARCHAR(200) NOT NULL,
  duracion_seg  INT UNSIGNED,
  ip_address    VARCHAR(45),
  creado_en     DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pagina (pagina),
  INDEX idx_fecha (creado_en),
  INDEX idx_usuario (usuario_id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- =============================================================
-- TABLA: descargas_documento
-- Registro de cada descarga para analíticas
-- =============================================================
CREATE TABLE descargas_documento (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  documento_id  INT UNSIGNED NOT NULL,
  usuario_id    INT UNSIGNED,
  ip_address    VARCHAR(45),
  creado_en     DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_documento (documento_id),
  INDEX idx_fecha (creado_en),
  FOREIGN KEY (documento_id) REFERENCES documentos(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- =============================================================
-- TABLA: avisos
-- Comunicados internos para el dashboard
-- =============================================================
CREATE TABLE avisos (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  titulo        VARCHAR(255) NOT NULL,
  contenido     TEXT NOT NULL,
  tipo          ENUM('info','advertencia','urgente') DEFAULT 'info',
  activo        TINYINT(1) DEFAULT 1,
  creado_por    INT UNSIGNED NOT NULL,
  expira_en     DATETIME,
  creado_en     DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_activo_expira (activo, expira_en),
  FOREIGN KEY (creado_por) REFERENCES usuarios(id)
) ENGINE=InnoDB;

-- =============================================================
-- TABLA: configuracion_sitio
-- Parámetros configurables desde el panel admin
-- =============================================================
CREATE TABLE configuracion_sitio (
  clave         VARCHAR(100) PRIMARY KEY,
  valor         TEXT,
  descripcion   VARCHAR(255),
  actualizado_por INT UNSIGNED,
  actualizado_en  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (actualizado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;
