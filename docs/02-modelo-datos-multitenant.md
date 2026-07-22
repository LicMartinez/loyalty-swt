# Modelo de Datos Multi-Tenant

## Migración de Schema

### Tabla maestra: `tenants`

```sql
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,              -- Subdominio: "panem", "barx"
    name TEXT NOT NULL,                     -- Nombre del negocio
    logo_url TEXT,                          -- URL del logo en Supabase Storage
    primary_color TEXT DEFAULT '#3B82F6',   -- Color principal de la marca
    bg_color TEXT DEFAULT '#0F172A',        -- Color de fondo
    accent_color TEXT DEFAULT '#10B981',    -- Color de acento
    font_family TEXT DEFAULT 'Inter',       -- Fuente personalizada
    
    -- Configuración del programa
    points_per_visit INTEGER DEFAULT 10,
    program_name TEXT NOT NULL,
    
    -- Google Wallet
    google_issuer_id TEXT,
    google_class_id TEXT,
    google_service_account JSONB,           -- Credenciales GCP (encriptadas)
    
    -- Apple Wallet
    apple_pass_type_id TEXT,
    apple_team_id TEXT,
    apple_certificate BYTEA,               -- Certificado .p12 (encriptado)
    
    -- Geolocalización
    locations JSONB DEFAULT '[]',           -- [{lat, lng, name}]
    
    -- Plan y billing
    plan TEXT DEFAULT 'basic' CHECK (plan IN ('basic', 'pro', 'enterprise')),
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    max_customers INTEGER DEFAULT 500,      -- Límite según plan
    
    -- Estado
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Tabla: `tenant_users` (admins de cada tenant)

```sql
CREATE TABLE tenant_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'admin' CHECK (role IN ('owner', 'admin', 'staff')),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id, user_id)
);
```

### Modificación de tablas existentes

```sql
-- Agregar tenant_id a todas las tablas de datos
ALTER TABLE customers ADD COLUMN tenant_id UUID NOT NULL REFERENCES tenants(id);
ALTER TABLE perks ADD COLUMN tenant_id UUID NOT NULL REFERENCES tenants(id);
ALTER TABLE checkins ADD COLUMN tenant_id UUID NOT NULL REFERENCES tenants(id);
ALTER TABLE redemptions ADD COLUMN tenant_id UUID NOT NULL REFERENCES tenants(id);
ALTER TABLE promotions ADD COLUMN tenant_id UUID NOT NULL REFERENCES tenants(id);
ALTER TABLE direct_gifts ADD COLUMN tenant_id UUID NOT NULL REFERENCES tenants(id);

-- Índices para performance
CREATE INDEX idx_customers_tenant ON customers(tenant_id);
CREATE INDEX idx_perks_tenant ON perks(tenant_id);
CREATE INDEX idx_checkins_tenant ON checkins(tenant_id);
CREATE INDEX idx_redemptions_tenant ON redemptions(tenant_id);
CREATE INDEX idx_promotions_tenant ON promotions(tenant_id);
CREATE INDEX idx_direct_gifts_tenant ON direct_gifts(tenant_id);

-- Eliminar tabla loyalty_config (se mueve a tenants)
DROP TABLE IF EXISTS loyalty_config;
```

### Row Level Security (RLS)

```sql
-- Habilitar RLS en todas las tablas
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE perks ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_gifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;

-- Función helper para obtener tenant_id del usuario actual
CREATE OR REPLACE FUNCTION get_user_tenant_id()
RETURNS UUID AS $$
    SELECT tenant_id FROM tenant_users 
    WHERE user_id = auth.uid() 
    LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- Policies para customers (ejemplo, replicar para todas las tablas)
CREATE POLICY "Tenant isolation" ON customers
    FOR ALL
    USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Tenant isolation" ON perks
    FOR ALL
    USING (tenant_id = get_user_tenant_id());

-- Policy para tenants (solo ver el propio)
CREATE POLICY "Users see own tenant" ON tenants
    FOR SELECT
    USING (id = get_user_tenant_id());

-- Policy para service role (bypass RLS para API routes)
-- Las API routes usan service_role key que bypasea RLS
-- y filtran manualmente por tenant_id del subdominio
```

---

## Diagrama de Relaciones

```
tenants
  │
  ├── tenant_users (N) ──── auth.users
  │
  ├── customers (N)
  │     ├── checkins (N)
  │     ├── redemptions (N)
  │     └── direct_gifts (N)
  │
  ├── perks (N)
  │     ├── redemptions (FK)
  │     ├── direct_gifts (FK)
  │     └── promotions (FK)
  │
  └── promotions (N)
```

---

## Migración de Datos Existentes (PANEM)

```sql
-- 1. Crear el tenant PANEM
INSERT INTO tenants (slug, name, program_name, google_issuer_id, google_class_id, points_per_visit)
VALUES ('panem', 'PANEM', 'Loyalty PANEM', '3388000000023147315', '3388000000023147315.Loyalty_PANEM', 10)
RETURNING id;

-- 2. Asignar tenant_id a datos existentes (usar el ID retornado)
UPDATE customers SET tenant_id = '<panem_tenant_id>';
UPDATE perks SET tenant_id = '<panem_tenant_id>';
UPDATE checkins SET tenant_id = '<panem_tenant_id>';
UPDATE redemptions SET tenant_id = '<panem_tenant_id>';
UPDATE promotions SET tenant_id = '<panem_tenant_id>';
UPDATE direct_gifts SET tenant_id = '<panem_tenant_id>';
```

---

## Límites por Plan

| Feature | Basic | Pro | Enterprise |
|---------|-------|-----|-----------|
| Clientes máx. | 500 | 5,000 | Ilimitado |
| Admins | 1 | 5 | Ilimitado |
| Promociones activas | 3 | 20 | Ilimitado |
| Reportes | Básicos | Avanzados | Custom |
| Google Wallet | ✅ | ✅ | ✅ |
| Apple Wallet | ❌ | ✅ | ✅ |
| Impresión térmica | ✅ | ✅ | ✅ |
| Branding custom | Básico | Completo | White-label |
| Soporte | Email | Prioritario | Dedicado |
| Precio sugerido | $499 MXN/mes | $1,499 MXN/mes | $3,999 MXN/mes |
