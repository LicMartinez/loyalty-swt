# Plan de Acción Consolidado: Plataforma SaaS Multi-Tenant

## Resumen Ejecutivo

Este documento consolida todo lo necesario para llevar el MVP actual (single-tenant PANEM)
a una plataforma SaaS lista para producción con múltiples marcas, seguridad robusta,
autenticación real y branding personalizable por marca.

**Estado actual:** MVP funcional para PANEM con 1 usuario de prueba, corriendo en local.
**Objetivo:** Plataforma en producción con 10 usuarios piloto, preparada para agregar marcas.

---

## Arquitectura Final

```
┌─ Vercel (gratis) ──────────────────────────────────────┐
│  loyalty-admin.vercel.app   → Admin Panel (React)      │
│  loyalty-staff.vercel.app   → Staff Portal (React)     │
│  loyalty-client.vercel.app  → Portal Beneficios (React)│
│  loyalty-api.vercel.app     → Backend API (Serverless) │
└────────────────────────────────────────────────────────┘
              │
              ▼
┌─ Supabase (gratis) ───────────────────────────────────┐
│  PostgreSQL + RLS + Storage (logos)                     │
└────────────────────────────────────────────────────────┘
              │
              ▼
┌─ Google Wallet API ───────────────────────────────────┐
│  1 Issuer Account → N Loyalty Classes (1 por marca)   │
└────────────────────────────────────────────────────────┘
```

---

## Roles del Sistema

| Rol | Quién | Acceso |
|-----|-------|--------|
| super_admin | Tú (dueño de la plataforma) | Crear/eliminar marcas, usuarios, ver todo |
| owner | Dueño del negocio (ej: dueño de PANEM) | Config completa de SU marca |
| admin | Gerente/encargado de la marca | Gestión de clientes, perks, reportes |
| staff | Barista/cajero | Solo scanner, check-in, canjear |

---

## Sprint 1: Seguridad Básica (BLOQUEANTE para deploy)

### 1.1 Rate Limiting

**Paquete:** `express-rate-limit`

**Configuración:**
- Login: 5 intentos / 15 minutos por IP
- API general: 100 requests / minuto por IP
- Portal beneficios: 10 requests / minuto por IP

**Implementación:**
```javascript
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5 });
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 100 });
const publicLimiter = rateLimit({ windowMs: 60 * 1000, max: 10 });

app.use('/api/auth/login', loginLimiter);
app.use('/api/admin', apiLimiter);
app.use('/api/customers', publicLimiter);
```

### 1.2 Headers de Seguridad

**Paquete:** `helmet`

```javascript
const helmet = require('helmet');
app.use(helmet());
```

### 1.3 CORS Restrictivo

```javascript
app.use(cors({
    origin: [
        'https://loyalty-admin.vercel.app',
        'https://loyalty-staff.vercel.app',
        'https://loyalty-client.vercel.app',
        // URLs de desarrollo (remover en producción real)
        'https://localhost:5173',
        'https://localhost:5174',
    ],
    credentials: true
}));
```

### 1.4 Validación de Inputs

- Validar formato UUID en todos los endpoints con `:id`
- Sanitizar strings (trim, max length)
- No exponer errores internos en respuestas

**Tiempo estimado:** 2 horas

---

## Sprint 2: Base de Datos — Tablas de Plataforma

### 2.1 Tabla `tenants`

```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  is_active BOOLEAN DEFAULT true,

  -- Branding (lo personaliza el admin de la marca)
  logo_url TEXT,
  primary_color VARCHAR(10) DEFAULT '#6366f1',
  secondary_color VARCHAR(10) DEFAULT '#1e1b4b',
  accent_color VARCHAR(10) DEFAULT '#818cf8',
  text_color VARCHAR(10) DEFAULT '#ffffff',
  background_color VARCHAR(10) DEFAULT '#0f0b2a',

  -- Google Wallet
  wallet_class_id VARCHAR(200),
  wallet_issuer_name VARCHAR(100),
  wallet_program_name VARCHAR(100),
  wallet_bg_color VARCHAR(10) DEFAULT '#1a1a2e',
  wallet_logo_url TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed PANEM
INSERT INTO tenants (slug, name, wallet_class_id, wallet_issuer_name,
  wallet_program_name, wallet_bg_color)
VALUES ('panem', 'PANEM', '3388000000023147315.Loyalty_PANEM',
  'PANEM', 'Loyalty PANEM', '#1a1a2e');
```

### 2.2 Tabla `admin_users`

```sql
CREATE TABLE admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),  -- NULL = super_admin
  username VARCHAR(100) NOT NULL,
  email VARCHAR(200),
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('super_admin','owner','admin','staff')),
  is_active BOOLEAN DEFAULT true,
  failed_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, username)
);
```

### 2.3 Agregar `tenant_id` a tablas existentes

Tablas que necesitan `tenant_id`:
- customers
- checkins
- perks
- redemptions
- direct_gifts
- promotions
- admin_sessions
- printers

Proceso por tabla:
1. `ALTER TABLE X ADD COLUMN tenant_id UUID REFERENCES tenants(id);`
2. `UPDATE X SET tenant_id = (SELECT id FROM tenants WHERE slug = 'panem');`
3. `ALTER TABLE X ALTER COLUMN tenant_id SET NOT NULL;`
4. `CREATE INDEX idx_X_tenant ON X(tenant_id);`

### 2.4 Modificar `loyalty_config` para multi-tenant

```sql
-- Cambiar PK de id=1 a tenant_id
ALTER TABLE loyalty_config ADD COLUMN tenant_id UUID REFERENCES tenants(id);
UPDATE loyalty_config SET tenant_id = (SELECT id FROM tenants WHERE slug='panem');
ALTER TABLE loyalty_config ALTER COLUMN tenant_id SET NOT NULL;
-- Agregar unique en tenant_id (una config por tenant)
ALTER TABLE loyalty_config ADD CONSTRAINT uq_loyalty_config_tenant UNIQUE(tenant_id);
```

### 2.5 Actualizar `loyalty_tiers` tenant_id

```sql
UPDATE loyalty_tiers SET tenant_id = (SELECT id FROM tenants WHERE slug='panem')
WHERE tenant_id = '00000000-0000-0000-0000-000000000000';
```

**Tiempo estimado:** 3 horas

---

## Sprint 3: Autenticación (JWT + Multi-Tenant)

### 3.1 Flujo de Login

```
POST /api/auth/login
Body: { slug: "panem", username: "admin_panem", password: "****" }

Backend:
  1. Buscar tenant por slug → obtener tenant_id
  2. Buscar admin_user por (tenant_id, username)
  3. Verificar lockout (failed_attempts >= 5 && locked_until > now)
  4. bcrypt.compare(password, password_hash)
  5. Si falla → incrementar failed_attempts, lockout si >= 5
  6. Si ok → generar JWT, resetear attempts, actualizar last_login
  7. Retornar: { token, user: { name, role }, tenant: { name, slug, branding } }
```

### 3.2 JWT Payload

```json
{
  "sub": "user-uuid",
  "tenant_id": "tenant-uuid",
  "tenant_slug": "panem",
  "role": "admin",
  "iat": 1700000000,
  "exp": 1700086400
}
```

### 3.3 Auth Middleware (reemplaza el actual)

```javascript
const jwt = require('jsonwebtoken');

function authMiddleware(requiredRoles = []) {
    return (req, res, next) => {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ error: 'No autorizado' });

        try {
            const payload = jwt.verify(token, process.env.JWT_SECRET);
            req.user = payload;
            req.tenantId = payload.tenant_id;

            if (requiredRoles.length > 0 && !requiredRoles.includes(payload.role)) {
                return res.status(403).json({ error: 'Sin permisos' });
            }
            next();
        } catch (err) {
            return res.status(401).json({ error: 'Sesión expirada' });
        }
    };
}
```

### 3.4 Super Admin Middleware

```javascript
function superAdminOnly(req, res, next) {
    if (req.user.role !== 'super_admin') {
        return res.status(403).json({ error: 'Acceso restringido' });
    }
    next();
}
```

### 3.5 Endpoints de Auth

```
POST   /api/auth/login          — Login (retorna JWT + branding)
POST   /api/auth/logout         — Invalida token (opcional con blacklist)
GET    /api/auth/me             — Info del usuario actual
PUT    /api/auth/password       — Cambiar contraseña propia
```

### 3.6 Login en cada portal

**Admin Panel:**
```
Campo 1: Negocio  → [panem]        (slug del tenant)
Campo 2: Usuario  → [admin_panem]
Campo 3: Password → [****]
```

**Staff Portal (iPad):**
```
Campo 1: Negocio  → [panem]
Campo 2: Usuario  → [barista1]
Campo 3: Password → [****]
```

El frontend guarda el JWT en localStorage y lo envía como Bearer token.

**Tiempo estimado:** 5 horas

---

## Sprint 4: Super Admin Panel

### 4.1 Endpoints del Super Admin

```
GET    /api/super/tenants              — Listar todas las marcas
POST   /api/super/tenants              — Crear marca nueva
PUT    /api/super/tenants/:id          — Editar marca
DELETE /api/super/tenants/:id          — Desactivar marca

GET    /api/super/tenants/:id/users    — Listar usuarios de una marca
POST   /api/super/tenants/:id/users    — Crear usuario para una marca
PUT    /api/super/users/:id            — Editar usuario
DELETE /api/super/users/:id            — Desactivar usuario
```

### 4.2 Crear Marca (lo que hace internamente)

```javascript
// POST /api/super/tenants
// Body: { slug, name }

async function createTenant(supabase, { slug, name }) {
    // 1. Insertar tenant
    const { data: tenant } = await supabase.from('tenants')
        .insert({ slug, name, wallet_class_id: `${ISSUER_ID}.Loyalty_${slug}` })
        .select().single();

    // 2. Crear loyalty_config default
    await supabase.from('loyalty_config')
        .insert({ tenant_id: tenant.id, points_per_visit: 10,
                  program_name: `Loyalty ${name}`, cycle_visits_required: 10 });

    // 3. Crear tiers predeterminados
    const defaultTiers = getDefaultTiers().map(t => ({ ...t, tenant_id: tenant.id }));
    await supabase.from('loyalty_tiers').insert(defaultTiers);

    // 4. Crear Loyalty Class en Google Wallet (automático)
    // Se crea la primera vez que se genere un pase para esta marca

    return tenant;
}
```

### 4.3 Crear Usuario para Marca

```javascript
// POST /api/super/tenants/:tenantId/users
// Body: { username, password, role, email }

const bcrypt = require('bcrypt');
const hash = await bcrypt.hash(password, 12);
await supabase.from('admin_users').insert({
    tenant_id: tenantId, username, password_hash: hash, role, email
});
```

### 4.4 UI del Super Admin

Ruta: `loyalty-admin.vercel.app/super` (solo accesible con role=super_admin)

Páginas:
- Lista de marcas con estado, # usuarios, # clientes
- Detalle de marca con usuarios y acciones
- Formulario de crear marca
- Formulario de crear usuario (con generador de contraseña)

**Tiempo estimado:** 4 horas

---

## Sprint 5: Branding Self-Service

### 5.1 Endpoint de Branding

```
GET  /api/admin/branding         — Obtener branding actual del tenant
PUT  /api/admin/branding         — Actualizar branding (colores, logo, nombre)
POST /api/admin/branding/logo    — Subir logo (multipart/form-data)
```

### 5.2 Campos editables por el admin de la marca

| Campo | Tipo | Descripción |
|-------|------|-------------|
| logo_url | Imagen | Logo de la marca (se sube a Supabase Storage) |
| program_name | Texto | Nombre del programa (ej: "Loyalty GOGUINARA") |
| primary_color | Color picker | Botones, links, badges |
| secondary_color | Color picker | Header, sidebar |
| accent_color | Color picker | Hover, highlights |
| text_color | Color picker | Texto sobre fondo oscuro |
| background_color | Color picker | Fondo general del portal |
| wallet_bg_color | Color picker | Fondo del pase en Google Wallet |

### 5.3 Cómo se aplican los colores en el frontend

```javascript
// Después del login exitoso, el frontend recibe el branding:
const { tenant } = loginResponse;

// Inyectar como CSS variables
const root = document.documentElement;
root.style.setProperty('--primary', tenant.primary_color);
root.style.setProperty('--secondary', tenant.secondary_color);
root.style.setProperty('--accent', tenant.accent_color);
root.style.setProperty('--text-main', tenant.text_color);
root.style.setProperty('--bg-color', tenant.background_color);

// Logo
setLogoUrl(tenant.logo_url);
```

### 5.4 Almacenamiento del logo

```javascript
// Supabase Storage: bucket "tenant-logos"
// Path: tenant-logos/{tenant_id}/logo.png

const { data } = await supabase.storage
    .from('tenant-logos')
    .upload(`${tenantId}/logo.png`, file, { upsert: true });

const logoUrl = supabase.storage
    .from('tenant-logos')
    .getPublicUrl(`${tenantId}/logo.png`).data.publicUrl;

// Actualizar tenant
await supabase.from('tenants')
    .update({ logo_url: logoUrl })
    .eq('id', tenantId);
```

### 5.5 UI — Sección "Marca" en Config del Admin

Nueva sección en la página de Configuración del admin panel:

```
┌─ Personalización ──────────────────────────────────────┐
│                                                         │
│  Logo: [📷 Cambiar]  ⬤ GOGUINARA                      │
│                                                         │
│  Nombre del programa: [Loyalty GOGUINARA            ]  │
│                                                         │
│  Colores del portal:                                   │
│  Primario    [■ #2e7d32]    Secundario [■ #1b5e20]    │
│  Acento      [■ #66bb6a]    Texto      [■ #ffffff]    │
│  Fondo       [■ #0f0b2a]                              │
│                                                         │
│  Color del pase Wallet: [■ #2e7d32]                    │
│                                                         │
│  [Guardar]                                             │
└─────────────────────────────────────────────────────────┘
```

**Tiempo estimado:** 3 horas

---

## Sprint 6: Tenant Routing en Backend

### 6.1 Todas las queries filtran por tenant_id

```javascript
// ANTES (single-tenant):
const { data } = await supabase.from('customers').select('*');

// DESPUÉS (multi-tenant):
const { data } = await supabase.from('customers')
    .select('*')
    .eq('tenant_id', req.tenantId);
```

### 6.2 El tenant_id viene del JWT

```javascript
// El middleware ya extrae tenantId del JWT:
// req.tenantId = payload.tenant_id

// Cada insert incluye tenant_id:
await supabase.from('customers').insert({
    ...customerData,
    tenant_id: req.tenantId
});
```

### 6.3 Endpoints públicos (sin JWT) — resolver tenant desde el customer

```javascript
// GET /api/customers/:id/progress (público, acceso por UUID)
// El customer ya pertenece a un tenant — no se necesita JWT
// Solo retornar datos del customer, sin exponer tenant info
```

### 6.4 Google Wallet — usar config del tenant

```javascript
// Antes: CLASS_ID global desde .env
// Después: CLASS_ID del tenant desde la BD

async function getWalletConfig(supabase, tenantId) {
    const { data: tenant } = await supabase
        .from('tenants')
        .select('wallet_class_id, wallet_issuer_name, wallet_program_name,
                 wallet_bg_color, wallet_logo_url')
        .eq('id', tenantId)
        .single();
    return tenant;
}
```

**Tiempo estimado:** 4 horas

---

## Sprint 7: Adaptar Backend para Vercel Serverless

### 7.1 Estructura para Vercel

```
backend/
├── api/
│   └── index.js          ← Entry point para Vercel
├── index.js              ← Express app (se exporta, no hace listen)
├── vercel.json           ← Config de Vercel
├── tier-engine.js
├── cycle-engine.js
├── wallet.js
├── print-service.js
└── admin-routes.js
```

### 7.2 vercel.json

```json
{
  "version": 2,
  "builds": [
    { "src": "api/index.js", "use": "@vercel/node" }
  ],
  "routes": [
    { "src": "/api/(.*)", "dest": "/api/index.js" }
  ]
}
```

### 7.3 api/index.js (wrapper)

```javascript
const app = require('../index.js');
module.exports = app;
```

### 7.4 Modificar index.js

```javascript
// Cambiar el final de index.js:
// ANTES:
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// DESPUÉS:
if (process.env.VERCEL) {
    module.exports = app;
} else {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}
```

### 7.5 Google Wallet credentials en Vercel

En local usas `gcp-service-account.json`. En Vercel no hay archivos — se usa variable de entorno:

```javascript
// wallet.js — cambio para soportar ambos
let credentials;
if (process.env.GCP_SERVICE_ACCOUNT_JSON) {
    credentials = JSON.parse(process.env.GCP_SERVICE_ACCOUNT_JSON);
} else {
    credentials = require('./gcp-service-account.json');
}
```

En Vercel dashboard: crear variable `GCP_SERVICE_ACCOUNT_JSON` con el contenido del JSON.

### 7.6 Limitación: Impresión TCP

Vercel serverless NO puede conectar TCP a impresoras locales.
La impresión se maneja 100% desde el frontend (Staff Portal iPad).
El endpoint `POST /api/print` sigue existiendo pero solo funciona en desarrollo local.

**Tiempo estimado:** 2 horas

---

## Sprint 8: Deploy a Vercel

### 8.1 Preparar repositorio

```bash
# Desde c:\desarrollo\loyalty
git add .
git commit -m "feat: MVP loyalty platform ready for production"
git remote add origin https://github.com/tu-usuario/loyalty.git
git push -u origin main
```

### 8.2 Crear proyectos en Vercel (dashboard)

| Proyecto | Root Directory | Framework | Build Command |
|----------|---------------|-----------|---------------|
| loyalty-api | `backend` | Other | — |
| loyalty-admin | `admin` | Vite | `npm run build` |
| loyalty-staff | `frontend` | Vite | `npm run build` |
| loyalty-client | (nuevo portal o misma dir que frontend) | Vite | `npm run build` |

### 8.3 Variables de Entorno (en Vercel Dashboard por proyecto)

**loyalty-api:**
```
SUPABASE_URL=https://angmhxtwcfbcpsozkuka.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
JWT_SECRET=<generar-string-aleatorio-64-chars>
GOOGLE_ISSUER_ID=3388000000023147315
GCP_SERVICE_ACCOUNT_JSON={"client_email":"...","private_key":"..."}
CLIENT_PORTAL_URL=https://loyalty-client.vercel.app
```

**loyalty-admin:**
```
VITE_API_URL=https://loyalty-api.vercel.app
```

**loyalty-staff:**
```
VITE_API_URL=https://loyalty-api.vercel.app
```

### 8.4 Actualizar frontends para usar API URL dinámica

```javascript
// admin/src/api.js y frontend equivalente
const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || '/api/admin'
});
```

### 8.5 Post-deploy

1. Verificar que todos los endpoints respondan
2. Actualizar `CLIENT_PORTAL_URL` en .env de Vercel
3. Re-generar los pases de Google Wallet del usuario de prueba
4. Verificar login admin, staff, y portal de beneficios
5. Hacer un check-in de prueba completo

**Tiempo estimado:** 3 horas

---

## Sprint 9: Agregar GOGUINARA (primera marca adicional)

### Checklist — lo que haces como Super Admin:

1. **Login como super_admin** en loyalty-admin.vercel.app/super
2. **Crear marca:**
   - Nombre: GOGUINARA
   - Slug: goguinara
3. **Crear usuario admin:**
   - Username: admin_goguinara
   - Password: (se genera automáticamente, la copias)
   - Role: owner
4. **Enviar al dueño de GOGUINARA:**
   - URL Admin: loyalty-admin.vercel.app
   - URL Staff: loyalty-staff.vercel.app
   - Credenciales: slug=goguinara, user=admin_goguinara, pass=xxx

### Lo que hace el dueño de GOGUINARA (primer login):

1. Entra a loyalty-admin.vercel.app
2. Login con "goguinara" / "admin_goguinara" / "pass"
3. Va a Configuración → Marca
4. Sube su logo, elige sus colores
5. Va a Premios → configura sus perks
6. Va a Niveles → ajusta si quiere puntos diferentes
7. Va a Configuración → ajusta visitas por ciclo
8. Crea usuarios staff para sus baristas

### No requiere:
- Deploy nuevo
- Cambios de código
- Intervención del super admin
- Nuevas URLs

---

## Cronograma Total

| Sprint | Contenido | Horas | Bloquea deploy |
|--------|-----------|-------|----------------|
| 1 | Seguridad (rate limit, helmet, cors) | 2h | ✅ SÍ |
| 2 | BD: tenants, admin_users, tenant_id migration | 3h | ✅ SÍ |
| 3 | Auth JWT + multi-tenant login | 5h | ✅ SÍ |
| 4 | Super Admin panel | 4h | ✅ SÍ |
| 5 | Branding self-service | 3h | NO (puede ir después) |
| 6 | Tenant routing en todas las queries | 4h | ✅ SÍ |
| 7 | Adaptar backend para Vercel | 2h | ✅ SÍ |
| 8 | Deploy a Vercel + verificación | 3h | ✅ SÍ |
| 9 | Agregar GOGUINARA | 0.5h | NO |

**Total: ~26.5 horas de desarrollo**

### Orden de dependencias:

```
Sprint 1 (Seguridad)
    ↓
Sprint 2 (BD: tenants + admin_users)
    ↓
Sprint 3 (Auth JWT) ← depende de Sprint 2
    ↓
Sprint 4 (Super Admin) ← depende de Sprint 3
    ↓
Sprint 6 (Tenant routing) ← depende de Sprint 2 + 3
    ↓
Sprint 7 (Adaptar Vercel) ← depende de todo lo anterior
    ↓
Sprint 8 (Deploy) ← depende de Sprint 7
    ↓
Sprint 5 (Branding) ← puede hacerse post-deploy
Sprint 9 (GOGUINARA) ← después de Sprint 8
```

---

## Decisiones Clave

| Decisión | Elección | Razón |
|----------|----------|-------|
| Auth | JWT + bcrypt + BD | Persiste, serverless-compatible, seguro |
| Multi-tenant | Single DB + tenant_id | $0, escala a N marcas |
| Branding | CSS variables dinámicas | Sin deploy por cada marca |
| Deploy | Vercel (4 proyectos) | Gratis, auto-deploy, URLs estables |
| Impresión en prod | Frontend (iPad) directo | Vercel no puede TCP local |
| Super Admin | Integrado en el mismo admin panel | Ruta `/super`, sin portal extra |
| Rate limiting | express-rate-limit | Simple, probado, sin infra extra |
| Storage logos | Supabase Storage | Gratis en tier incluido, CDN |

---

## Costos Totales de Producción

| Servicio | Costo | Notas |
|----------|-------|-------|
| Vercel (4 proyectos) | $0/mes | Free tier, sin límite de proyectos |
| Supabase (1 proyecto) | $0/mes | Free tier, 500MB DB |
| Google Wallet API | $0 | Sin costo por uso |
| Dominio (futuro) | ~$10/año | Cuando lo contrates |
| Apple Wallet (futuro) | $99/año | Apple Developer Account |

**Costo MVP en producción: $0/mes**

---

## Documentos Relacionados

- `docs/01-arquitectura-saas.md` — Visión a largo plazo (Next.js)
- `docs/02-multi-tenant-implementation.md` — Detalle técnico de migración tenant_id
- `docs/03-thermal-printing-multi-printer.md` — Impresión multi-impresora
- `docs/04-transfer-points-gifts.md` — Transferencia de puntos/regalos (futuro)
- `docs/05-pre-deploy-security-and-auth.md` — Detalle de seguridad y auth

---

## Notas Finales

- El portal de beneficios del cliente NO necesita login (acceso por UUID)
- El Staff Portal SÍ necesita login (seguridad del negocio)
- Cada marca ve SOLO sus propios datos (aislamiento total por tenant_id)
- Los pases de Google Wallet ya contienen el UUID del cliente correcto
- Cuando se contrate dominio: actualizar CORS, CLIENT_PORTAL_URL, y re-generar pases
