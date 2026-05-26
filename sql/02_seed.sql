-- =============================================================
-- INTRANET CORPORATIVA — ARQUITECTURA & CONSTRUCCIÓN
-- Archivo: 02_seed.sql
-- Propósito: Datos iniciales y de prueba
-- Versión: 1.0.0
-- =============================================================

USE intranet_arq;

-- =============================================================
-- DEPARTAMENTOS
-- =============================================================
INSERT INTO departamentos (nombre, descripcion) VALUES
('Dirección General',     'Alta dirección y gerencia corporativa'),
('Arquitectura',          'Diseño arquitectónico y conceptual'),
('Ingeniería Estructural','Cálculo y diseño estructural'),
('Proyectos',             'Gestión y coordinación de proyectos'),
('Administración',        'Finanzas, contabilidad y administración'),
('Recursos Humanos',      'Gestión del talento humano'),
('Legal',                 'Asesoría jurídica y contratos'),
('Seguridad e Higiene',   'SST y normativas de seguridad en obra'),
('Tecnología',            'Infraestructura tecnológica y sistemas');

-- =============================================================
-- USUARIOS (contraseñas hasheadas con bcrypt, rounds=12)
-- admin@empresa.com     → password: Admin2024!
-- usuario@empresa.com   → password: User2024!
-- =============================================================
INSERT INTO usuarios (nombre, apellido, email, password_hash, rol, departamento_id) VALUES
(
  'Alfredo', 'Martínez',
  'admin@empresa.com',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/lewdBP07cPnA3eNXi',
  'admin', 1
),
(
  'Ana', 'García',
  'usuario@empresa.com',
  '$2b$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uHR2dE6',
  'estandar', 2
),
(
  'Carlos', 'Mendoza',
  'c.mendoza@empresa.com',
  '$2b$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uHR2dE6',
  'estandar', 3
),
(
  'Laura', 'Vázquez',
  'l.vazquez@empresa.com',
  '$2b$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uHR2dE6',
  'estandar', 4
);

-- =============================================================
-- CATEGORÍAS DE DOCUMENTOS
-- =============================================================
INSERT INTO categorias_documento (nombre, descripcion, icono, color_hex, orden) VALUES
('Planos y Especificaciones Técnicas', 'Planos arquitectónicos, estructurales y de instalaciones', 'drafting-compass', '#1B2A6B', 1),
('Políticas y Procedimientos',        'Políticas corporativas y manuales de procedimiento',       'book-open',        '#2D7D46', 2),
('Contratos y Marco Legal',           'Contratos, convenios y documentos jurídicos',               'file-text',        '#7D2D2D', 3),
('Normativas de Construcción',        'Normas, reglamentos y estándares de construcción',          'hard-hat',         '#B45309', 4),
('Recursos Humanos',                  'Políticas de RH, organigramas y perfiles de puesto',        'users',            '#6D2D7D', 5),
('Seguridad e Higiene',               'Protocolos de seguridad, PETS y planes de emergencia',      'shield',           '#C0392B', 6),
('Gestión de Proyectos',              'Metodologías, plantillas y reportes de avance',             'layout-dashboard', '#1B6B6B', 7),
('Capacitación y Conocimiento',       'Manuales, guías de usuario y material formativo',           'graduation-cap',   '#6B5B1B', 8);

-- =============================================================
-- DOCUMENTOS DE EJEMPLO
-- =============================================================
INSERT INTO documentos (nombre, nombre_archivo, ruta_almacenamiento, tipo_mime, extension, tamano_bytes, categoria_id, departamento_id, version, descripcion, tags, contenido_texto, subido_por) VALUES
(
  'Manual de Especificaciones Técnicas v2.1',
  'manual_esp_tecnicas_v2_1.pdf',
  'uploads/documentos/manual_esp_tecnicas_v2_1.pdf',
  'application/pdf', 'pdf', 4300000, 1, 3, '2.1',
  'Especificaciones técnicas para todos los proyectos de construcción',
  'cimentación,concreto,estructuras,instalaciones',
  'Este manual establece las especificaciones técnicas para todos los proyectos de construcción. Incluye normativas de cimentación, estructuras de concreto reforzado, instalaciones hidráulicas y eléctricas. La resistencia mínima del concreto será f´c=250 kg/cm2 para elementos estructurales. Las varillas de acero cumplirán con la norma NMX-B-294.',
  1
),
(
  'Reglamento Interno de Trabajo 2024',
  'reglamento_interno_2024.pdf',
  'uploads/documentos/reglamento_interno_2024.pdf',
  'application/pdf', 'pdf', 1200000, 2, 6, '1.0',
  'Reglamento que rige las relaciones laborales dentro de la empresa',
  'RRHH,políticas,laboral,reglamento',
  'El presente Reglamento Interno de Trabajo establece las condiciones de trabajo. La jornada laboral ordinaria es de 8 horas diarias y 40 semanales. Todo trabajador tiene derecho a 15 días de vacaciones al año. El incumplimiento de las normas de seguridad será motivo de sanción.',
  1
),
(
  'Contrato Tipo para Subcontratistas',
  'contrato_tipo_subcontratistas.docx',
  'uploads/documentos/contrato_tipo_subcontratistas.docx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx', 320000, 3, 7, '3.2',
  'Modelo de contrato para contratación de subcontratistas de obra',
  'contratos,subcontratistas,legal,obra',
  'CONTRATO DE PRESTACIÓN DE SERVICIOS DE CONSTRUCCIÓN. El contratante se obliga a pagar el precio acordado en los términos establecidos. El contratista deberá contar con seguro de responsabilidad civil por monto mínimo de $2,000,000 MXN. El plazo de ejecución no podrá excederse sin autorización escrita.',
  1
),
(
  'NOM-031-STPS-2011 Construcción',
  'nom_031_stps_2011.pdf',
  'uploads/documentos/nom_031_stps_2011.pdf',
  'application/pdf', 'pdf', 2100000, 4, 8, '1.0',
  'Norma Oficial Mexicana para construcción — condiciones de seguridad',
  'NOM,STPS,seguridad,normativa,construcción',
  'Esta Norma establece las condiciones de seguridad y salud en los centros de trabajo dedicados a actividades de construcción. Los trabajadores que laboren a alturas superiores a 1.80 metros deberán usar arnés de seguridad. Las excavaciones mayores a 1.50m requieren entibado. El empleador deberá proporcionar EPP certificado.',
  1
),
(
  'Manual de Gestión de Proyectos BIM',
  'manual_gestion_bim.pdf',
  'uploads/documentos/manual_gestion_bim.pdf',
  'application/pdf', 'pdf', 8700000, 7, 2, '1.3',
  'Guía de implementación y uso de BIM en proyectos de la empresa',
  'BIM,Revit,proyectos,digitalización,metodología',
  'El Building Information Modeling (BIM) es la metodología oficial para todos los proyectos mayores a $5M MXN. Se utilizará Autodesk Revit como plataforma principal. Los modelos LOD 300 son requeridos para ingeniería de detalle. La coordinación de especialidades se realizará mediante Navisworks. El archivo maestro deberá actualizarse cada semana.',
  1
),
(
  'Plan de Seguridad e Higiene en Obra',
  'plan_seg_higiene_obra.pdf',
  'uploads/documentos/plan_seg_higiene_obra.pdf',
  'application/pdf', 'pdf', 3400000, 6, 8, '2.0',
  'Plan integral de seguridad para obras en ejecución',
  'seguridad,higiene,obra,emergencias,EPP',
  'El Plan de Seguridad e Higiene es obligatorio para toda obra con más de 10 trabajadores. Se realizarán pláticas de seguridad cada lunes antes del inicio de actividades. El botiquín de primeros auxilios estará ubicado en la caseta de obra. Todo incidente deberá reportarse en las primeras 24 horas. El responsable de seguridad tendrá capacitación IMSS.',
  1
),
(
  'Organigrama Corporativo 2024',
  'organigrama_2024.pdf',
  'uploads/documentos/organigrama_2024.pdf',
  'application/pdf', 'pdf', 450000, 5, 6, '1.0',
  'Estructura organizacional vigente de la empresa',
  'organigrama,estructura,RRHH,puestos',
  'La empresa cuenta con una estructura matricial que favorece la colaboración entre departamentos. La Dirección General supervisa directamente las áreas de Arquitectura, Ingeniería, Proyectos y Administración. El departamento de Recursos Humanos reporta directamente a la Dirección. Cada gerencia de proyecto tiene autonomía operativa dentro de los parámetros corporativos.',
  1
),
(
  'Guía de Uso — Software Corporativo',
  'guia_software_corporativo.pdf',
  'uploads/documentos/guia_software_corporativo.pdf',
  'application/pdf', 'pdf', 5600000, 8, 9, '1.1',
  'Manual de usuario para herramientas de software autorizadas',
  'software,capacitación,Revit,AutoCAD,herramientas',
  'Esta guía cubre el uso de las herramientas digitales corporativas. AutoCAD Architecture se usa para planos 2D y presentaciones. Revit Architecture es obligatorio para proyectos BIM. Microsoft Project para cronogramas. Todos los archivos deben guardarse en el servidor NAS con la nomenclatura establecida: PROYECTO_DISCIPLINA_NIVEL_FECHA.',
  1
);

-- =============================================================
-- AVISOS INICIALES
-- =============================================================
INSERT INTO avisos (titulo, contenido, tipo, creado_por) VALUES
(
  'Bienvenida al nuevo portal de conocimiento',
  'Con gusto les damos la bienvenida a nuestra nueva Intranet Corporativa. Aquí encontrarán todos los documentos, políticas y recursos institucionales actualizados. Para soporte técnico contactar a tecnologia@empresa.com.',
  'info', 1
),
(
  'Actualización de políticas de seguridad en obra',
  'Se han actualizado los protocolos de seguridad conforme a la revisión 2024 de la NOM-031-STPS. Todos los supervisores de obra deberán revisar el nuevo Plan de Seguridad disponible en la categoría "Seguridad e Higiene".',
  'advertencia', 1
),
(
  'Capacitación BIM — Registro obligatorio',
  'Se realizará capacitación intensiva de BIM Level 2 el próximo mes. Inscripción obligatoria para todo el personal técnico. Ver detalles en la sección de Capacitación.',
  'urgente', 1
);

-- =============================================================
-- CONFIGURACIÓN INICIAL DEL SITIO
-- =============================================================
INSERT INTO configuracion_sitio (clave, valor, descripcion) VALUES
('nombre_empresa',        'ARQ Studio Corporativo',           'Nombre de la empresa'),
('nombre_intranet',       'Gestión del Conocimiento',         'Nombre de la intranet'),
('logo_url',              '/assets/logo.svg',                 'Ruta del logotipo'),
('max_tamano_archivo_mb', '50',                               'Tamaño máximo de archivo en MB'),
('extensiones_permitidas','pdf,docx,xlsx,dwg,jpg,png',        'Extensiones de archivo permitidas'),
('session_timeout_min',   '480',                              'Tiempo de sesión en minutos'),
('sso_tenant_id',         'YOUR_TENANT_ID',                   'ID del tenant de Microsoft Azure AD'),
('sso_client_id',         'YOUR_CLIENT_ID',                   'Client ID de la app Azure AD'),
('sso_redirect_uri',      'http://localhost:3000/auth/callback','URI de redirección OAuth2'),
('items_por_pagina',      '12',                               'Documentos por página en el repositorio');
