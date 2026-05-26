# 🏗️ Intranet Corporativa — ARQ Studio
## Gestión del Conocimiento Institucional

Sistema de intranet para gestión documental, políticas y conocimiento institucional,
diseñado para empresas de arquitectura y construcción.

---

## 📋 Tabla de contenidos

1. [Arquitectura del proyecto](#arquitectura)
2. [Requisitos](#requisitos)
3. [Instalación](#instalación)
4. [Configuración de base de datos](#base-de-datos)
5. [Configuración SSO Microsoft](#sso-microsoft)
6. [Credenciales de prueba](#credenciales-de-prueba)
7. [Estructura de archivos](#estructura-de-archivos)
8. [API — Endpoints](#api-endpoints)
9. [Seguridad](#seguridad)
10. [Notas para producción](#producción)

---

## 🏛️ Arquitectura

```
┌─────────────────────────────────────────────────┐
│                  FRONTEND                        │
│   HTML5 + CSS3 + Vanilla JavaScript              │
│   Sin frameworks — máximo control y seguridad    │
└────────────────────┬────────────────────────────┘
                     │ REST API (JSON)
                     │ JWT Bearer Token
┌────────────────────▼────────────────────────────┐
│                  BACKEND                         │
│   Node.js 18+ + Express 4                        │
│   Helmet · CORS · Rate Limiting · bcrypt · JWT   │
└────────────────────┬────────────────────────────┘
                     │ mysql2 (connection pool)
┌────────────────────▼────────────────────────────┐
│               BASE DE DATOS                      │
│   MySQL 8.0+ / MariaDB 10.6+                     │
│   Full-text search · Stored procedures · Views   │
└─────────────────────────────────────────────────┘
```

---

## ⚙️ Requisitos

| Componente   | Versión mínima  |
|--------------|-----------------|
| Node.js      | 18.0.0          |
| npm          | 9.0.0           |
| MySQL        | 8.0             |
| MariaDB      | 10.6 (alternativa) |

---

## 🚀 Instalación

### 1. Clonar / descomprimir el proyecto

```bash
cd intranet-arq
```

### 2. Instalar dependencias del backend

```bash
cd backend
npm install
```

### 3. Configurar variables de entorno

```bash
cp .env.example .env
# Editar .env con tus valores reales
nano .env
```

Variables obligatorias a configurar:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=intranet_user
DB_PASSWORD=tu_password_segura
DB_NAME=intranet_arq
JWT_SECRET=cadena_aleatoria_minimo_64_caracteres
```

### 4. Crear la base de datos y usuario MySQL

```sql
-- Conectado como root en MySQL:
CREATE DATABASE intranet_arq CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'intranet_user'@'localhost' IDENTIFIED BY 'tu_password_segura';
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON intranet_arq.* TO 'intranet_user'@'localhost';
FLUSH PRIVILEGES;
```

### 5. Ejecutar los scripts SQL en orden

```bash
mysql -u root -p intranet_arq < sql/01_schema.sql
mysql -u root -p intranet_arq < sql/02_seed.sql
mysql -u root -p intranet_arq < sql/03_procedures_views.sql
```

### 6. Crear directorio de uploads

```bash
mkdir -p backend/uploads
chmod 750 backend/uploads
```

### 7. Iniciar el servidor

```bash
# Desarrollo (con auto-recarga)
cd backend
npm run dev

# Producción
npm start
```

El servidor corre en: `http://localhost:3000`

### 8. Abrir el frontend

Con Live Server (VS Code) o cualquier servidor estático apuntando a `/frontend`.

**VS Code:** clic derecho en `frontend/index.html` → Open with Live Server

---

## 🗄️ Base de datos

### Tablas principales

| Tabla                  | Descripción                              |
|------------------------|------------------------------------------|
| `usuarios`             | Cuentas de usuario (local + SSO)         |
| `departamentos`        | Departamentos de la empresa              |
| `categorias_documento` | Categorías del repositorio               |
| `documentos`           | Metadatos y rutas de archivos            |
| `versiones_documento`  | Historial de versiones                   |
| `sesiones`             | Tokens JWT activos (revocación)          |
| `log_auditoria`        | Registro de todas las acciones           |
| `log_visitas_pagina`   | Telemetría de navegación                 |
| `descargas_documento`  | Registro de descargas                    |
| `avisos`               | Comunicados internos                     |
| `configuracion_sitio`  | Parámetros del sistema                   |

### Búsqueda full-text

La búsqueda usa el índice `FULLTEXT` de MySQL sobre los campos:
- `documentos.nombre`
- `documentos.descripcion`
- `documentos.contenido_texto`
- `documentos.tags`

Para que la búsqueda funcione con el motor InnoDB, asegúrate de tener en `my.cnf`:

```ini
[mysqld]
innodb_ft_min_token_size=2
ft_min_word_len=2
```

Luego reconstruir el índice si ya hay datos:
```sql
REPAIR TABLE documentos QUICK;
```

---

## 🔐 SSO Microsoft

### Configuración en Azure AD

1. Ingresa al [Portal de Azure](https://portal.azure.com)
2. Navega a **Azure Active Directory** → **Registros de aplicaciones** → **Nueva registro**
3. Configura:
   - **Nombre:** Intranet ARQ Studio
   - **Tipos de cuenta:** Solo cuentas de este directorio organizacional
   - **URI de redirección:** `http://localhost:3000/api/auth/callback`
4. Anota el **ID de aplicación (cliente)** y el **ID de directorio (inquilino)**
5. En **Certificados y secretos** → crear nuevo secreto de cliente
6. En **Permisos de API** → agregar: `openid`, `profile`, `email`, `User.Read`

### Variables en `.env`

```env
MICROSOFT_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
MICROSOFT_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
MICROSOFT_CLIENT_SECRET=tu_client_secret_de_azure
MICROSOFT_REDIRECT_URI=http://localhost:3000/api/auth/callback
```

> **En producción:** cambiar el `REDIRECT_URI` por la URL real del servidor con HTTPS.

### Flujo SSO

```
Usuario → clic "Continuar con Microsoft"
    → GET /api/auth/sso/microsoft
    → Redirige a login.microsoftonline.com
    → Usuario autentica con cuenta corporativa
    → Callback a /api/auth/callback?code=XXX
    → Backend intercambia code por access_token
    → Obtiene perfil de Microsoft Graph API
    → Crea/actualiza usuario en BD
    → Genera JWT y redirige al frontend
```

---

## 🔑 Credenciales de prueba

> ⚠️ **Cambiar estas credenciales antes de ir a producción**

### Administrador

| Campo      | Valor                   |
|------------|-------------------------|
| Email      | `admin@empresa.com`     |
| Contraseña | `Admin2024!`            |
| Rol        | Administrador           |

### Usuario estándar

| Campo      | Valor                    |
|------------|--------------------------|
| Email      | `usuario@empresa.com`    |
| Contraseña | `User2024!`              |
| Rol        | Estándar                 |

---

## 📁 Estructura de archivos

```
intranet-arq/
│
├── sql/
│   ├── 01_schema.sql           ← Esquema completo de BD
│   ├── 02_seed.sql             ← Datos iniciales y de prueba
│   └── 03_procedures_views.sql ← Vistas y procedimientos almacenados
│
├── backend/
│   ├── .env.example            ← Plantilla de variables de entorno
│   ├── server.js               ← Entrada principal del servidor Express
│   ├── package.json
│   ├── config/
│   │   └── database.js         ← Pool de conexiones MySQL
│   ├── middleware/
│   │   └── auth.js             ← JWT guard + log de auditoría
│   ├── routes/
│   │   ├── auth.js             ← Login local + SSO Microsoft
│   │   ├── documents.js        ← CRUD + búsqueda + descarga
│   │   └── admin.js            ← Usuarios + analíticas + configuración
│   └── uploads/                ← Archivos subidos (auto-creado)
│
└── frontend/
    ├── index.html              ← Login (blueprint estético)
    ├── home.html               ← Dashboard principal
    ├── documents.html          ← Repositorio de documentos
    ├── search.html             ← Buscador full-text
    ├── admin/
    │   ├── panel.html          ← Panel de control admin
    │   ├── upload.html         ← Gestión y subida de documentos
    │   └── analytics.html      ← Analíticas y reportes
    ├── css/
    │   ├── main.css            ← Sistema de diseño completo
    │   ├── auth.css            ← Estilos login
    │   ├── dashboard.css       ← Estilos home
    │   ├── documents.css       ← Estilos repositorio y buscador
    │   └── admin.css           ← Estilos panel admin
    └── js/
        ├── api.js              ← Cliente HTTP + Session + Security + Toast
        ├── auth.js             ← Lógica de login + rate limit
        ├── home.js             ← Dashboard dinámico
        ├── documents.js        ← Repositorio + filtros + paginación
        └── admin.js            ← Utilidades compartidas del admin
```

---

## 🌐 API Endpoints

### Autenticación

| Método | Endpoint                      | Descripción                  | Auth |
|--------|-------------------------------|------------------------------|------|
| POST   | `/api/auth/login`             | Login con email y contraseña | No   |
| GET    | `/api/auth/sso/microsoft`     | Iniciar flujo OAuth2         | No   |
| GET    | `/api/auth/callback`          | Callback SSO Microsoft       | No   |
| POST   | `/api/auth/logout`            | Cerrar sesión                | Sí   |
| GET    | `/api/auth/me`                | Datos del usuario actual     | Sí   |

### Documentos

| Método | Endpoint                         | Descripción               | Rol      |
|--------|----------------------------------|---------------------------|----------|
| GET    | `/api/documents`                 | Listar con filtros/páginas | Usuario  |
| GET    | `/api/documents/search?q=texto`  | Búsqueda full-text         | Usuario  |
| GET    | `/api/documents/:id`             | Detalle y versiones        | Usuario  |
| GET    | `/api/documents/:id/download`    | Descarga segura            | Usuario  |
| POST   | `/api/documents`                 | Subir nuevo documento      | Admin    |
| PUT    | `/api/documents/:id`             | Actualizar metadatos       | Admin    |
| DELETE | `/api/documents/:id`             | Archivar (soft delete)     | Admin    |

### Administración

| Método | Endpoint                         | Descripción                | Rol   |
|--------|----------------------------------|----------------------------|-------|
| GET    | `/api/admin/stats`               | KPIs del dashboard         | Admin |
| GET    | `/api/admin/analytics/visitas`   | Visitas diarias            | Admin |
| GET    | `/api/admin/analytics/descargas` | Top descargas              | Admin |
| GET    | `/api/admin/analytics/heatmap`   | Mapa de calor semanal      | Admin |
| GET    | `/api/admin/audit`               | Log de auditoría           | Admin |
| GET    | `/api/admin/users`               | Listar usuarios            | Admin |
| POST   | `/api/admin/users`               | Crear usuario              | Admin |
| PATCH  | `/api/admin/users/:id`           | Cambiar rol / estado       | Admin |
| GET    | `/api/admin/avisos`              | Avisos del portal          | Admin |
| POST   | `/api/admin/avisos`              | Crear aviso                | Admin |
| GET    | `/api/admin/config`              | Configuración del sitio    | Admin |
| PUT    | `/api/admin/config/:clave`       | Actualizar configuración   | Admin |

### Públicos (requieren auth)

| Método | Endpoint      | Descripción               |
|--------|---------------|---------------------------|
| GET    | `/api/categories` | Categorías con conteo |
| GET    | `/api/avisos`     | Avisos activos        |
| POST   | `/api/track`      | Registrar visita      |

---

## 🔒 Seguridad

### Implementaciones actuales

| Capa         | Mecanismo                                                |
|--------------|----------------------------------------------------------|
| Transporte   | HTTPS obligatorio en producción (ver notas)              |
| Autenticación| JWT firmado con HS256 · Expiración en 8 horas           |
| Sesiones     | Revocación server-side via tabla `sesiones`              |
| Contraseñas  | bcrypt con cost factor 12                                |
| Autorización | RBAC: roles `admin` y `estandar` verificados en cada ruta|
| Rate Limiting| 5 intentos de login / 15 min · 100 req/15 min global    |
| Headers HTTP | Helmet: HSTS · CSP · X-Frame-Options · Referrer-Policy  |
| Inputs       | express-validator en todos los endpoints                 |
| Uploads      | Validación de extensión + MIME type + tamaño máximo      |
| Rutas        | Path traversal prevention en descargas                   |
| Auditoría    | Log de todas las acciones sensibles con IP y user-agent  |
| XSS Frontend | Sanitización en todas las interpolaciones DOM            |
| CSRF         | Token nonce en el formulario de login                    |
| Inactividad  | Auto-logout tras 15 minutos sin actividad                |

### Política de contraseñas

- Mínimo 8 caracteres
- Al menos una mayúscula
- Al menos una minúscula
- Al menos un número
- Al menos un carácter especial (`@$!%*?&#`)

---

## 🏭 Producción

Antes de ir a producción, asegúrate de:

### 1. HTTPS obligatorio

```nginx
# Nginx — redirigir HTTP a HTTPS
server {
    listen 80;
    server_name tu-dominio.com;
    return 301 https://$host$request_uri;
}
```

### 2. Cambiar secretos

```env
# .env producción
JWT_SECRET=genera_minimo_64_chars_aleatorios_aqui
DB_PASSWORD=password_muy_fuerte_diferente_al_dev
BCRYPT_ROUNDS=14
NODE_ENV=production
```

Generar un JWT_SECRET seguro:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. Cookies HttpOnly (recomendado)

Actualmente el JWT se pasa via `Authorization: Bearer`. En producción se recomienda
migrar a cookies `HttpOnly; Secure; SameSite=Strict` para mayor protección contra XSS.

### 4. Variables de entorno en producción

Usar un gestor de secretos (AWS Secrets Manager, HashiCorp Vault, o al menos variables
de entorno del sistema operativo — nunca el archivo `.env` en el servidor).

### 5. Backup de la base de datos

```bash
# Backup diario automatizado
mysqldump -u intranet_user -p intranet_arq > backup_$(date +%Y%m%d).sql
```

### 6. Directorio de uploads

```bash
# En producción usar almacenamiento externo (S3, Azure Blob, etc.)
# El directorio ./uploads NO debe ser accesible públicamente por el web server
```

### 7. Limpieza de sesiones expiradas

Agregar un cron job para limpiar sesiones viejas de la BD:

```sql
-- Ejecutar diariamente
DELETE FROM sesiones WHERE expira_en < DATE_SUB(NOW(), INTERVAL 1 DAY);
DELETE FROM log_auditoria WHERE creado_en < DATE_SUB(NOW(), INTERVAL 365 DAY);
DELETE FROM log_visitas_pagina WHERE creado_en < DATE_SUB(NOW(), INTERVAL 180 DAY);
```

### 8. Límites del servidor

```nginx
# Nginx — límite de subida de archivos
client_max_body_size 55M;
```

---

## 📞 Soporte

Para soporte técnico o reportar un bug, contactar al equipo de Tecnología:
**tecnologia@empresa.com**

---

*Versión 1.0.0 — ARQ Studio Corporativo*
