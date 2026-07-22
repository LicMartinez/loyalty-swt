# Multi-Tenant Implementation — SW Loyalty

## Contexto

El MVP funcional ya está desplegado con un solo cliente (PANEM). Este documento describe el plan completo para convertir el sistema en multi-marca (multi-tenant) manteniendo la infraestructura gratuita en Supabase.

**Estado actual:**
- 1 proyecto Supabase (Free Tier: 500MB, 2 proyectos máx)
- Backend: Node.js/Express
- Admin Panel: React/Vite
- Staff Portal: React/Vite (scanner QR)
- Google Wallet: 1 Loyalty Class (PANEM)
- Todas las tablas nuevas (`loyalty_tiers`, `tier_change_history`, `cycle_rewards`) ya tienen `tenant_id`
- Tablas legacy (`customers`, `checkins`, `perks`, `redemptions`, `direct_gifts`, `promotions`, `loyalty_config`, `admin_sessions`) NO tienen `tenant_id` aún

**Objetivo:** Agregar el cliente GOGUINARA sin duplicar infraestructura, compartiendo la misma base de datos con aislamiento total de datos.

---

## Estrategia: Single-Database Multi-Tenant con `tenant_id`

Cada fila de cada tabla pertenece a un tenant específico. Las queries siempre filtran por `tenant_id`. Ningún tenant puede ver datos de otro.

### Costos

| Escenario | Costo |
|-----------|-------|
| 2 marcas (PANEM + GOGUINARA) en Free Tier | **$0/mes** |
| 3-10 marcas en Free Tier (si cabe en 500MB) | **$0/mes** |
| Escalar a Pro (más storage/backups) | **$25/mes** |

---

## Fase 1: Schema — Tabla `tenants` y migración

### 1.1 Crear tabla `tenants`

```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(50) NOT NULL UNIQUE,         -- "panem", "goguinara"
  name VARCHAR(100) NOT NULL,               -- "PANEM", "GOGUINARA"
  
  -- Configuración de Google Wallet
  wallet_class_id VARCHAR(200) NOT NULL,    -- "3388000000023147315.Loyalty_PANEM"
  wallet_issuer_name VARCHAR(100) NOT NULL,  -- "PANEM"
  wallet_program_name VARCHAR(100) NOT NULL, -- "Loyalty PANEM"
  wallet_bg_color VARCHAR(10) DEFAULT '#1a1a2e',
  wallet_logo_url TEXT,                      -- URL del logo para el pase
  
  -- Configuración de administración
  admin_user VARCHAR(100) NOT NULL,
  admin_pass_hash VARCHAR(255) NOT NULL,     -- bcrypt hash
  
  -- Branding
  primary_color VARCHAR(10) DEFAULT '#6366f1',
  secondary_color VARCHAR(10) DEFAULT '#1a1a2e',
  
  -- Metadata
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed tenants iniciales
INSERT INTO tenants (slug, name, wallet_class_id, wallet_issuer_name, wallet_program_name, wallet_bg_color, admin_user, admin_pass_hash)
VALUES 
  ('panem', 'PANEM', '3388000000023147315.Loyalty_PANEM', 'PANEM', 'Loyalty PANEM', '#1a1a2e', 'admin_panem', '<bcrypt_hash>'),
  ('goguinara', 'GOGUINARA', '3388000000023147315.Loyalty_GOGUINARA', 'GOGUINARA', 'Loyalty GOGUINARA', '#2e5c1a', 'admin_goguinara', '<bcrypt_hash>');
```

### 1.2 Agregar `tenant_id` a tablas legacy

```sql
-- Paso 1: Agregar columna nullable
ALTER TABLE customers ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE checkins ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE perks ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE redemptions ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE direct_gifts ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE promotions ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE admin_sessions ADD COLUMN tenant_id UUID REFERENCES tenants(id);

-- Paso 2: Backfill con el tenant de PANEM
UPDATE customers SET tenant_id = (SELECT id FROM tenants WHERE slug = 'panem');
UPDATE checkins SET tenant_id = (SELECT id FROM tenants WHERE slug = 'panem');
UPDATE perks SET tenant_id = (SELECT id FROM tenants WHERE slug = 'panem');
UPDATE redemptions SET tenant_id = (SELECT id FROM tenants WHERE slug = 'panem');
UPDATE direct_gifts SET tenant_id = (SELECT id FROM tenants WHERE slug = 'panem');
UPDATE promotions SET tenant_id = (SELECT id FROM tenants WHERE slug = 'panem');
UPDATE admin_sessions SET tenant_id = (SELECT id FROM tenants WHERE slug = 'panem');

-- Paso 3: Establecer NOT NULL
ALTER TABLE customers ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE checkins ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE perks ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE redemptions ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE direct_gifts ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE promotions ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE admin_sessions ALTER COLUMN tenant_id SET NOT NULL;

-- Paso 4: Modificar loyalty_config para soportar múltiples tenants
ALTER TABLE loyalty_config DROP CONSTRAINT IF EXISTS loyalty_config_pkey;
ALTER TABLE loyalty_config ADD COLUMN tenant_id UUID REFERENCES tenants(id);
UPDATE loyalty_config SET tenant_id = (SELECT id FROM tenants WHERE slug = 'panem');
ALTER TABLE loyalty_config ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE loyalty_config DROP CONSTRAINT IF EXISTS loyalty_config_id_check;
ALTER TABLE loyalty_config ADD PRIMARY KEY (tenant_id);
-- Insertar config para GOGUINARA
INSERT INTO loyalty_config (tenant_id, points_per_visit, program_name, cycle_visits_required)
VALUES ((SELECT id FROM tenants WHERE slug = 'goguinara'), 10, 'Loyalty GOGUINARA', 10);

-- Paso 5: Índices para performance
CREATE INDEX idx_customers_tenant ON customers(tenant_id);
CREATE INDEX idx_checkins_tenant ON checkins(tenant_id);
CREATE INDEX idx_perks_tenant ON perks(tenant_id);
CREATE INDEX idx_redemptions_tenant ON redemptions(tenant_id);
CREATE INDEX idx_direct_gifts_tenant ON direct_gifts(tenant_id);
CREATE INDEX idx_promotions_tenant ON promotions(tenant_id);
```

### 1.3 Actualizar `tenant_id` en tablas nuevas

Las tablas `loyalty_tiers`, `tier_change_history`, `cycle_rewards` ya usan un DEFAULT_TENANT_ID hardcoded ('00000000-0000-0000-0000-000000000000'). Se deben actualizar para apuntar al UUID real del tenant PANEM:

```sql
UPDATE loyalty_tiers SET tenant_id = (SELECT id FROM tenants WHERE slug = 'panem')
  WHERE tenant_id = '00000000-0000-0000-0000-000000000000';
UPDATE tier_change_history SET tenant_id = (SELECT id FROM tenants WHERE slug = 'panem')
  WHERE tenant_id = '00000000-0000-0000-0000-000000000000';
UPDATE cycle_rewards SET tenant_id = (SELECT id FROM tenants WHERE slug = 'panem')
  WHERE tenant_id = '00000000-0000-0000-0000-000000000000';

-- Seed tiers para GOGUINARA
INSERT INTO loyalty_tiers (tenant_id, name, points_per_visit, sort_order, is_default)
VALUES 
  ((SELECT id FROM tenants WHERE slug = 'goguinara'), 'Bronce', 3, 0, true),
  ((SELECT id FROM tenants WHERE slug = 'goguinara'), 'Plata', 5, 1, false),
  ((SELECT id FROM tenants WHERE slug = 'goguinara'), 'Oro', 10, 2, false),
  ((SELECT id FROM tenants WHERE slug = 'goguinara'), 'Platino', 10, 3, false);
```

---

## Fase 2: Backend — Resolución de Tenant

### 2.1 Middleware de tenant

```javascript
// middleware/tenant.js
async function tenantMiddleware(req, res, next) {
    const slug = req.headers['x-tenant-slug'] || req.params.tenant || req.query.tenant;
    
    if (!slug) {
        return res.status(400).json({ error: 'Tenant no especificado' });
    }
    
    const { data: tenant, error } = await supabase
        .from('tenants')
        .select('*')
        .eq('slug', slug)
        .eq('is_active', true)
        .single();
    
    if (error || !tenant) {
        return res.status(404).json({ error: 'Negocio no encontrado' });
    }
    
    req.tenant = tenant;
    req.tenantId = tenant.id;
    next();
}
```

### 2.2 Modificar queries

Cada query agrega `.eq('tenant_id', req.tenantId)`:

```javascript
// Antes
const { data } = await supabase.from('customers').select('*');

// Después
const { data } = await supabase.from('customers').select('*').eq('tenant_id', req.tenantId);
```

### 2.3 Rutas con tenant

```javascript
// API routes prefixed with tenant slug
app.use('/api/:tenant/admin', tenantMiddleware, adminRoutes);
app.use('/api/:tenant', tenantMiddleware, publicRoutes);

// Ejemplo de URLs:
// POST /api/panem/checkin
// GET /api/panem/customers/uuid/progress
// GET /api/goguinara/admin/tiers
```

---

## Fase 3: Google Wallet — Multi-Class

### 3.1 Una Loyalty Class por marca

Cada tenant tiene su propia Loyalty Class en Google Wallet. Se usa el mismo Issuer Account (misma service account de GCP).

```
Issuer: 3388000000023147315
├── Class: 3388000000023147315.Loyalty_PANEM
│   programName: "Loyalty PANEM"
│   issuerName: "PANEM"
│   hexBackgroundColor: "#1a1a2e"
│   programLogo: logo_panem.png
│
├── Class: 3388000000023147315.Loyalty_GOGUINARA
│   programName: "Loyalty GOGUINARA"
│   issuerName: "GOGUINARA"
│   hexBackgroundColor: "#2e5c1a"
│   programLogo: logo_goguinara.png
```

### 3.2 Modificar wallet.js

```javascript
// Antes: CLASS_ID desde .env (hardcoded a PANEM)
const CLASS_ID = process.env.GOOGLE_CLASS_ID;

// Después: CLASS_ID desde el tenant
function getClassId(tenant) {
    return tenant.wallet_class_id;
}

// Cada función recibe el tenant como parámetro
async function createWalletPassJWT(tenant, customerId, customerName) {
    const classId = tenant.wallet_class_id;
    await ensureLoyaltyClassExists(tenant); // Crea la class si no existe
    // ... usa classId en vez de CLASS_ID global
}

function updateWalletPass(tenant, customerId, visits, points, benefits, tierName, cycleProgress) {
    const classId = tenant.wallet_class_id;
    // ... usa classId
}
```

### 3.3 Crear Loyalty Class para GOGUINARA

Esto se hace automáticamente la primera vez que se crea un pase (el `ensureLoyaltyClassExists` ya lo maneja), pero necesita los datos del tenant:

```javascript
async function ensureLoyaltyClassExists(tenant) {
    const classId = tenant.wallet_class_id;
    // Check if exists → if not, create with tenant's branding
    const classData = {
        id: classId,
        issuerName: tenant.wallet_issuer_name,
        programName: tenant.wallet_program_name,
        hexBackgroundColor: tenant.wallet_bg_color,
        programLogo: { sourceUri: { uri: tenant.wallet_logo_url } },
        // ...
    };
}
```

---

## Fase 4: Portales Frontend

### 4.1 Portal Administrativo

**Opción A (MVP):** El login identifica al tenant

```
Login Page:
  - Slug del negocio: [panem    ] ← el admin escribe su slug
  - Usuario:          [admin    ]
  - Contraseña:       [*****    ]
```

El frontend guarda el slug en localStorage y lo envía como header en todas las requests.

**Opción B (futuro):** Subdominios
- `panem.loyalty.app/admin`
- `goguinara.loyalty.app/admin`

### 4.2 Portal de Escaneo (Staff / iPad)

**Opción A (MVP):** URL con slug

```
https://loyalty.vercel.app/staff/panem      → iPad en PANEM
https://loyalty.vercel.app/staff/goguinara  → iPad en GOGUINARA
```

El slug de la URL se extrae y se envía como header `X-Tenant-Slug` en cada request.

**Opción B (futuro):** El QR del pase ya contiene el customerId, y el customer pertenece a un tenant, entonces el backend puede resolver el tenant automáticamente desde el customerId. Pero para el check-in inicial se necesita saber el tenant para no cruzar datos.

### 4.3 Portal de Beneficios del Cliente

```
https://loyalty.vercel.app/benefits/panem/{customerId}
https://loyalty.vercel.app/benefits/goguinara/{customerId}
```

---

## Fase 5: RLS (Row Level Security) Avanzado

Cuando se migre a Supabase Auth con roles por tenant:

```sql
-- Policy: cada tenant solo ve sus propios datos
CREATE POLICY "tenant_isolation" ON customers
  FOR ALL
  USING (tenant_id = (current_setting('request.jwt.claims')::json->>'tenant_id')::uuid);
```

Para el MVP con service_role key (bypasea RLS), el aislamiento se hace a nivel de aplicación (middleware + queries filtradas).

---

## Escalabilidad: Agregar un nuevo tenant

### Checklist para agregar una marca nueva

1. **Insertar registro en `tenants`** con slug, nombre, colores, credenciales
2. **Insertar `loyalty_config`** para el nuevo tenant
3. **Insertar `loyalty_tiers`** predeterminados para el nuevo tenant
4. **Subir logo** del negocio a una URL pública (Supabase Storage o CDN)
5. **La Loyalty Class** de Google Wallet se crea automáticamente en el primer pase
6. **Compartir URLs** al admin y staff del nuevo negocio

No se necesita deploy nuevo, no se necesita nueva instancia de base de datos, no se necesita código nuevo. Solo datos en la tabla `tenants`.

---

## Migración de FREE a PRO (cuándo hacerlo)

| Señal | Acción |
|-------|--------|
| Base de datos > 400MB | Considerar Pro ($25/mes) |
| Más de 50,000 usuarios auth | Considerar Pro |
| Necesitas backups automáticos | Pro |
| Proyecto se pausa por inactividad | Pro (no tiene pausa) |
| Quieres point-in-time recovery | Pro |

Para un programa de lealtad típico (100-500 clientes por marca, 10-50 check-ins/día), el Free Tier puede soportar 10-20 marcas sin problema.

---

## Orden de Implementación Recomendado

1. Crear tabla `tenants` y seed PANEM + GOGUINARA
2. Agregar `tenant_id` a tablas legacy + backfill
3. Crear middleware de tenant en backend
4. Modificar todas las queries para filtrar por tenant
5. Modificar wallet.js para usar config del tenant
6. Ajustar login del admin panel para incluir slug
7. Ajustar staff portal para incluir slug en URL
8. Crear Loyalty Class de GOGUINARA en Google Wallet
9. Test E2E con ambos tenants
10. Deploy a producción

**Tiempo estimado:** 2-3 sesiones de trabajo.
