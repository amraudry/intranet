-- =============================================================
-- INTRANET CORPORATIVA — ARQUITECTURA & CONSTRUCCIÓN
-- Archivo: 03_procedures_views.sql
-- Propósito: Vistas, procedimientos y funciones SQL
-- Versión: 1.0.0
-- =============================================================

USE intranet_arq;

-- =============================================================
-- VISTA: v_documentos_completo
-- Documentos con toda su información relacionada
-- =============================================================
CREATE OR REPLACE VIEW v_documentos_completo AS
SELECT
  d.id,
  d.nombre,
  d.nombre_archivo,
  d.ruta_almacenamiento,
  d.extension,
  d.tipo_mime,
  d.tamano_bytes,
  ROUND(d.tamano_bytes / 1048576, 2)          AS tamano_mb,
  d.version,
  d.descripcion,
  d.tags,
  d.archivado,
  d.creado_en,
  d.actualizado_en,
  c.nombre                                    AS categoria,
  c.icono                                     AS categoria_icono,
  c.color_hex                                 AS categoria_color,
  dep.nombre                                  AS departamento,
  CONCAT(u.nombre, ' ', u.apellido)           AS subido_por_nombre,
  u.email                                     AS subido_por_email,
  (
    SELECT COUNT(*)
    FROM descargas_documento dd
    WHERE dd.documento_id = d.id
  )                                           AS total_descargas
FROM documentos d
JOIN categorias_documento c   ON d.categoria_id    = c.id
LEFT JOIN departamentos dep   ON d.departamento_id = dep.id
JOIN usuarios u               ON d.subido_por      = u.id
WHERE d.archivado = 0;

-- =============================================================
-- VISTA: v_analytics_visitas_diarias
-- Visitas agrupadas por día (últimos 30 días)
-- =============================================================
CREATE OR REPLACE VIEW v_analytics_visitas_diarias AS
SELECT
  DATE(creado_en)     AS fecha,
  COUNT(*)            AS total_visitas,
  COUNT(DISTINCT usuario_id) AS usuarios_unicos
FROM log_visitas_pagina
WHERE creado_en >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
GROUP BY DATE(creado_en)
ORDER BY fecha ASC;

-- =============================================================
-- VISTA: v_analytics_docs_mas_descargados
-- Top documentos más descargados
-- =============================================================
CREATE OR REPLACE VIEW v_analytics_docs_mas_descargados AS
SELECT
  d.id,
  d.nombre,
  c.nombre                AS categoria,
  COUNT(dd.id)            AS total_descargas,
  MAX(dd.creado_en)       AS ultima_descarga
FROM descargas_documento dd
JOIN documentos d           ON dd.documento_id = d.id
JOIN categorias_documento c ON d.categoria_id  = c.id
GROUP BY d.id, d.nombre, c.nombre
ORDER BY total_descargas DESC
LIMIT 10;

-- =============================================================
-- VISTA: v_usuarios_activos
-- Información pública de usuarios activos
-- =============================================================
CREATE OR REPLACE VIEW v_usuarios_activos AS
SELECT
  u.id,
  u.nombre,
  u.apellido,
  CONCAT(u.nombre, ' ', u.apellido)   AS nombre_completo,
  u.email,
  u.rol,
  u.avatar_url,
  u.ultimo_login,
  dep.nombre                          AS departamento,
  u.creado_en
FROM usuarios u
LEFT JOIN departamentos dep ON u.departamento_id = dep.id
WHERE u.activo = 1;

-- =============================================================
-- PROCEDIMIENTO: sp_buscar_documentos
-- Búsqueda full-text con relevancia
-- =============================================================
DELIMITER $$

CREATE PROCEDURE sp_buscar_documentos(
  IN p_query          VARCHAR(200),
  IN p_categoria_id   INT,
  IN p_extension      VARCHAR(10),
  IN p_limit          INT,
  IN p_offset         INT
)
BEGIN
  DECLARE v_query_clean VARCHAR(200);
  
  -- Limpiar y preparar el query para MATCH AGAINST
  SET v_query_clean = TRIM(p_query);
  
  SELECT
    d.id,
    d.nombre,
    d.extension,
    d.tamano_bytes,
    ROUND(d.tamano_bytes / 1048576, 2)    AS tamano_mb,
    d.version,
    d.creado_en,
    d.actualizado_en,
    c.nombre                              AS categoria,
    c.icono                               AS categoria_icono,
    c.color_hex                           AS categoria_color,
    dep.nombre                            AS departamento,
    -- Snippet: primeros 200 chars del contenido donde está el match
    CASE
      WHEN d.contenido_texto IS NOT NULL AND d.contenido_texto != ''
        THEN SUBSTRING(d.contenido_texto, 1, 300)
      ELSE d.descripcion
    END                                   AS snippet,
    -- Score de relevancia
    MATCH(d.nombre, d.descripcion, d.contenido_texto, d.tags)
      AGAINST(v_query_clean IN NATURAL LANGUAGE MODE) AS relevancia
  FROM documentos d
  JOIN categorias_documento c   ON d.categoria_id    = c.id
  LEFT JOIN departamentos dep   ON d.departamento_id = dep.id
  WHERE
    d.archivado = 0
    AND MATCH(d.nombre, d.descripcion, d.contenido_texto, d.tags)
        AGAINST(v_query_clean IN NATURAL LANGUAGE MODE)
    AND (p_categoria_id IS NULL OR d.categoria_id = p_categoria_id)
    AND (p_extension IS NULL OR d.extension = p_extension)
  ORDER BY relevancia DESC
  LIMIT p_limit OFFSET p_offset;
END$$

-- =============================================================
-- PROCEDIMIENTO: sp_registrar_auditoria
-- Inserta un evento en el log de auditoría
-- =============================================================
CREATE PROCEDURE sp_registrar_auditoria(
  IN p_usuario_id   INT,
  IN p_accion       VARCHAR(100),
  IN p_entidad      VARCHAR(50),
  IN p_entidad_id   INT,
  IN p_detalle      JSON,
  IN p_ip           VARCHAR(45),
  IN p_user_agent   VARCHAR(500),
  IN p_resultado    VARCHAR(20)
)
BEGIN
  INSERT INTO log_auditoria
    (usuario_id, accion, entidad, entidad_id, detalle, ip_address, user_agent, resultado)
  VALUES
    (p_usuario_id, p_accion, p_entidad, p_entidad_id, p_detalle, p_ip, p_user_agent, p_resultado);
END$$

-- =============================================================
-- PROCEDIMIENTO: sp_dashboard_stats
-- Estadísticas para el panel de administrador
-- =============================================================
CREATE PROCEDURE sp_dashboard_stats()
BEGIN
  SELECT
    (SELECT COUNT(*) FROM documentos WHERE archivado = 0)          AS total_documentos,
    (SELECT COUNT(*) FROM usuarios WHERE activo = 1)               AS total_usuarios,
    (SELECT COUNT(*) FROM descargas_documento
       WHERE creado_en >= DATE_FORMAT(NOW(), '%Y-%m-01'))          AS descargas_mes,
    (SELECT COUNT(*) FROM documentos
       WHERE archivado = 0
       AND creado_en >= DATE_SUB(NOW(), INTERVAL 7 DAY))           AS docs_nuevos_semana,
    (SELECT COUNT(*) FROM log_visitas_pagina
       WHERE creado_en >= DATE_FORMAT(NOW(), '%Y-%m-01'))          AS visitas_mes,
    (SELECT COUNT(DISTINCT usuario_id) FROM sesiones
       WHERE activa = 1 AND expira_en > NOW())                     AS sesiones_activas;
END$$

DELIMITER ;

-- =============================================================
-- ÍNDICES ADICIONALES PARA PERFORMANCE
-- =============================================================
-- Índice compuesto para búsquedas filtradas frecuentes
CREATE INDEX idx_doc_cat_arch ON documentos(categoria_id, archivado, creado_en DESC);
CREATE INDEX idx_audit_fecha_accion ON log_auditoria(creado_en DESC, accion);
CREATE INDEX idx_descargas_mes ON descargas_documento(documento_id, creado_en);
