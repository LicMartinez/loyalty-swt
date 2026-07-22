# Pre-Deploy: Seguridad, Auth y Preparación Multi-Tenant

## Contexto

Antes de publicar los portales en producción hay 3 temas críticos que resolver:
1. Seguridad contra ataques y protección de datos
2. Compatibilidad futura con Apple Wallet
3. Sistema de autenticación real por usuario/contraseña (preparado para multi-tenant)

---

## 1. Seguridad — Protección de la plataforma

### 1.1 Lo que está expuesto HOY (riesgos actuales)

| Riesgo | Severidad | Estado |
|--------|-----------|--------|
| Admin login con credenciales hardcodeadas en memoria | CRÍTICO | ⚠️ Sin hash, sin DB |
| Tokens de sesión en memoria (se pierden al reiniciar) | ALTO | ⚠️ No persisten |
| Sin rate limiting — fuerza bruta posible | ALTO | ⚠️ No hay protección |
| Portal de beneficios accesible por UUID sin auth | MEDIO | Aceptable para MVP |
| Sin CORS restrictivo | MEDIO | ⚠️ Acepta cualquier origen |
| Service Role Key en .env del backend | BAJO | OK si el backend está en servidor seguro |
| RLS habilitado en todas las tablas | OK | ✅ Ya implementado |

### 1.2 Lo que hay que implementar ANTES del deploy

#### A) Rate Limiting (protección contra fuerza bruta)

```javascript
// Usar express-rate-limit
const rateLimit = require('express-rate-limit');

// Limitar login: 5 intentos en 15 minutos
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 5,
    message: { error: 'Demasiados intentos. Espera 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/admin/login', loginLimiter);

// Limitar API general: 100 requests/min por IP
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: { error: 'Demasiadas solicitudes. Intenta más tarde.' }
});
app.use('/api/', apiLimiter);
```

#### B) CORS restrictivo

```javascript
const cors = require('cors');
app.use(cors({
    origin: [
        'https://loyalty-admin.vercel.app',
        'https://loyalty-staff.vercel.app',
        'https://loyalty-client.vercel.app',
        // Agregar dominios propios cuando se tengan
    ],
    credentials: true
}));
```

#### C) Helmet (headers de seguridad)

```javascript
const helmet = require('helmet');
app.use(helmet());
```

#### D) Validación de input

- Sanitizar todos los inputs con `express-validator` o `zod`
- Validar UUIDs antes de hacer queries
- No exponer errores internos (ya se hace en el progress endpoint)

#### E) Protección del portal de beneficios del usuario

El portal se accede por UUID. El UUID v4 tiene ~122 bits de entropía — es prácticamente imposible de adivinar. Pero como protección adicional:
- Rate limit en el endpoint `/api/customers/:id/benefits` (10 req/min por IP)
- No retornar datos sensibles (solo nombre, puntos, beneficios)
- Log de accesos anómalos (muchos UUIDs diferentes desde misma IP = scraping)

---

## 2. Apple Wallet — Impacto Futuro

### ¿Cómo funciona Apple Wallet vs Google Wallet?

| Aspecto | Google Wallet | Apple Wallet |
|---------|--------------|--------------|
| Formato | API REST (JSON) | Archivo `.pkpass` (ZIP con JSON + imágenes) |
| Actualización | PATCH via API (push update) | Push notification vía APNs |
| Certificado | Service Account (GCP) | Apple Developer Certificate ($99/año) |
| Distribución | Link `pay.google.com/gp/v/save/...` | Link a descargar `.pkpass` |
| Personalización visual | Limitada (colores, logo, text modules) | Más flexible (custom images, barcode layout) |

### ¿Qué cambia en la arquitectura?

**Casi nada a nivel de backend.** La lógica de negocio (puntos, tiers, ciclos) es idéntica. Solo se agrega un módulo paralelo:

```
wallet.js (actual)
├── google.js  → Google Wallet API (ya existe)
└── apple.js   → Apple Wallet PassKit (nuevo)
```

#### Lo que se necesita para Apple Wallet:

1. **Apple Developer Account** ($99/año) — para el certificado de firma de pases
2. **Módulo `passkit-generator`** (npm) — genera archivos `.pkpass`
3. **Servidor HTTPS** — para distribuir los archivos `.pkpass` (Vercel sirve)
4. **APNs** (Apple Push Notification) — para actualizar pases existentes

#### Flujo de Apple Wallet:

```
1. Cliente se registra → backend genera .pkpass → cliente descarga → agrega a Apple Wallet
2. Check-in → backend genera .pkpass actualizado → APNs notifica al dispositivo → Wallet descarga la actualización
```

#### Cambios en tabla `customers`:

```sql
ALTER TABLE customers ADD COLUMN wallet_type VARCHAR(10); -- 'google' | 'apple' | null
ALTER TABLE customers ADD COLUMN apple_pass_serial VARCHAR(100);
ALTER TABLE customers ADD COLUMN apple_push_token TEXT;
```

#### Impacto en el flujo actual:

```javascript
// Después de un check-in, actualizar el wallet correspondiente:
if (customer.wallet_type === 'google') {
    wallet.google.updatePass(customer, ...);
} else if (customer.wallet_type === 'apple') {
    wallet.apple.updatePass(customer, ...);
}
```

### Conclusión Apple Wallet:

- **No bloquea el deploy actual** — se agrega después como módulo paralelo
- **Requiere inversión:** $99/año Apple Developer
- **Tiempo de implementación:** 8-12 horas adicionales
- **No afecta la estructura de datos** del programa de lealtad

---

## 3. Autenticación Real — Preparación Multi-Tenant

### Estado actual (problema):

```javascript
// admin-routes.js — credenciales hardcodeadas
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'panem2024';
// Tokens en memoria — se pierden al reiniciar
const activeSessions = new Map();
```

### Lo que necesitamos:

| Requisito | Solución |
|-----------|----------|
| Múltiples admins por tenant | Tabla `admin_users` en BD |
| Contraseñas seguras | bcrypt hash |
| Sesiones persistentes | JWT o tabla `admin_sessions` en BD |
| Preparado para GOGUINARA | Cada admin asociado a un `tenant_id` |
| Protección contra fuerza bruta | Rate limit + lockout después de N intentos |

### Diseño propuesto:

#### Tabla `admin_users`

```sql
CREATE TABLE admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  username VARCHAR(100) NOT NULL,
  email VARCHAR(200),
  password_hash VARCHAR(255) NOT NULL,  -- bcrypt
  role VARCHAR(20) DEFAULT 'admin' CHECK (role IN ('admin', 'staff', 'owner')),
  is_active BOOLEAN DEFAULT true,
  failed_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, username)
);
```

#### Flujo de login:

```javascript
// POST /api/auth/login
// Body: { tenant_slug, username, password }

1. Buscar tenant por slug
2. Buscar admin_user por (tenant_id, username)
3. Verificar si está bloqueado (locked_until > now)
4. Comparar password con bcrypt
5. Si falla: incrementar failed_attempts, bloquear si >= 5
6. Si ok: generar JWT con { userId, tenantId, role }, resetear attempts
7. Retornar JWT

// JWT payload:
{
  sub: "user-uuid",
  tenant_id: "tenant-uuid",
  tenant_slug: "panem",
  role: "admin",
  exp: timestamp + 24h
}
```

#### Middleware de auth (reemplazo):

```javascript
// auth-middleware.js
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;

function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No autorizado' });

    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.user = payload;
        req.tenantId = payload.tenant_id;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Sesión expirada' });
    }
}
```

#### Staff Portal auth:

El staff portal también necesita login (no queremos que cualquiera con la URL pueda escanear y registrar check-ins):

```
Staff login:
  - Tenant: [panem]     (o se detecta por URL)
  - Usuario: [barista1]
  - Contraseña: [****]
  
Roles:
  - 'staff' → Solo puede escanear, check-in, canjear
  - 'admin' → Todo lo anterior + config, reportes, gestión
  - 'owner' → Todo + gestión de otros admins
```

### Impacto en los portales:

| Portal | Auth actual | Auth nueva |
|--------|-------------|------------|
| Admin | Login simple en memoria | JWT + admin_users + tenant |
| Staff (iPad) | Sin auth (abierto) | Login por usuario staff + tenant |
| Usuario (beneficios) | Por UUID en URL | Sin cambio (acceso por UUID del Wallet) |

---

## Orden de Implementación Pre-Deploy

### Sprint 1: Seguridad básica (bloquea deploy sin esto)
1. ✅ Instalar `express-rate-limit` + configurar límites
2. ✅ Instalar `helmet` para headers de seguridad
3. ✅ Configurar CORS con whitelist de dominios
4. ✅ Validar inputs (UUIDs, strings)

### Sprint 2: Auth real (necesario para multi-tenant)
5. Crear tabla `admin_users` con bcrypt
6. Implementar login con JWT
7. Reemplazar authMiddleware actual por JWT
8. Agregar tenant_id a cada request desde el JWT
9. Agregar login al Staff Portal
10. Actualizar Admin Panel login para incluir tenant

### Sprint 3: Deploy
11. Adaptar backend para Vercel serverless
12. Configurar 3 proyectos en Vercel
13. Configurar variables de entorno
14. Actualizar CLIENT_PORTAL_URL con la URL de Vercel
15. Re-generar pases del wallet con la URL nueva
16. Test E2E en producción

---

## Variables de Entorno para Producción

```env
# Supabase
SUPABASE_URL=https://angmhxtwcfbcpsozkuka.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Auth
JWT_SECRET=<un-string-aleatorio-de-64-chars>

# Google Wallet
GOOGLE_ISSUER_ID=3388000000023147315
GOOGLE_CLASS_ID=3388000000023147315.Loyalty_PANEM
# (las credenciales JSON se manejan como variable de entorno en Vercel, no como archivo)

# Portal URLs
CLIENT_PORTAL_URL=https://loyalty-client.vercel.app
ADMIN_PORTAL_URL=https://loyalty-admin.vercel.app
STAFF_PORTAL_URL=https://loyalty-staff.vercel.app
```

---

## Resumen de Decisiones

| Decisión | Elección | Razón |
|----------|----------|-------|
| Auth | JWT + bcrypt + BD | Persiste, es seguro, funciona serverless |
| Rate limiting | express-rate-limit | Simple, probado, sin dependencias externas |
| Multi-tenant auth | tenant_slug en login + tenant_id en JWT | Un solo deploy sirve a todos los tenants |
| Apple Wallet | Post-deploy | No bloquea MVP, requiere $99/año |
| Impresión en producción | Desde el iPad (frontend) | Backend serverless no puede TCP a impresoras locales |
