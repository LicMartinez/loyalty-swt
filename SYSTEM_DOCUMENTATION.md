# SW Loyalty — Documentación Completa del Sistema

## Resumen Ejecutivo

**SW Loyalty** es un sistema de programa de lealtad multi-tenant que permite a negocios (restaurantes, bares, etc.) gestionar tarjetas de fidelidad digitales para sus clientes. El sistema integra:

- Pases digitales en **Google Wallet** y **Apple Wallet**
- Check-in por escaneo de **código QR**
- Sistema de **niveles** (tiers) y **puntos**
- **Tarjeta de sellos** (ciclos de visitas con recompensa)
- Panel de **administración** completo
- **Impresión térmica** de tickets (ESC/POS)
- Soporte **multi-tenant** (múltiples marcas/negocios)
- **Modo kiosco** para check-in automático desatendido en pantalla grande

> **Estado**: Documento sincronizado con el código y la base de datos en producción. Cubre: modo kiosco, endpoint optimizado `/api/checkin/kiosk`, rate limiter de login ajustado, logo por defecto para Google Wallet, y el esquema real de la BD verificado en Supabase.

---

## Arquitectura General

```
┌─────────────────────────────────────────────────────────────┐
│                        VERCEL (Hosting)                       │
├─────────────────┬──────────────────┬────────────────────────┤
│  Frontend SPA   │   Admin Panel    │    Backend API          │
│  (Staff Portal) │   (Admin SPA)    │    (Express.js)         │
│  React + Vite   │   React + Vite   │    Serverless Node.js   │
│  :loyalty-staff │   :loyalty-admin │    :loyalty-api-rho     │
└────────┬────────┴────────┬─────────┴──────────┬─────────────┘
         │                 │                     │
         └─────────────────┼─────────────────────┘
                           │
              ┌────────────▼────────────────┐
              │        Supabase             │
              │  (PostgreSQL + Storage)     │
              └────────────┬───────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                  │
   ┌─────▼─────┐   ┌──────▼──────┐  ┌───────▼───────┐
   │  Google    │   │   Apple     │  │   Impresoras  │
   │  Wallet    │   │   Wallet    │  │   Térmicas    │
   │  (API)     │   │   (PKPass)  │  │   (ESC/POS)   │
   └────────────┘   └─────────────┘  └───────────────┘
```

---

## URLs de Producción

| Servicio | URL |
|----------|-----|
| Backend API | `https://loyalty-api-rho.vercel.app` |
| Frontend (Staff/Client) | `https://loyalty-staff.vercel.app` |
| Admin Panel | Desplegado en Vercel (URL propia) |

---

## 1. Backend (`backend/`)

### Tecnologías

| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| Express.js | 5.x | Framework HTTP |
| Supabase JS | 2.x | Cliente de base de datos |
| jsonwebtoken | 9.x | Autenticación JWT |
| bcrypt | 6.x | Hash de contraseñas |
| google-auth-library | 10.x | Google Wallet API |
| passkit-generator | 3.5.x | Apple Wallet .pkpass |
| helmet | 8.x | Headers de seguridad |
| express-rate-limit | 8.x | Limitación de solicitudes |
| dotenv | 17.x | Variables de entorno |

### Estructura de Archivos

```
backend/
├── index.js                  # Entry point principal, endpoints core
├── admin-routes.js           # Rutas CRUD admin (clientes, perks, promos, config, reportes)
├── auth-routes.js            # Login, /me, cambio de password
├── auth-middleware.js        # JWT middleware, generador de token
├── super-admin-routes.js     # Gestión de tenants y usuarios de plataforma
├── wallet.js                 # Integración Google Wallet (clases, pases, updates)
├── apple-wallet.js           # Generación de pases Apple Wallet (.pkpass)
├── tier-engine.js            # Lógica de niveles: resolución, cálculo de puntos
├── cycle-engine.js           # Lógica de ciclos (tarjeta de sellos)
├── print-service.js          # Servicio de impresión ESC/POS por TCP
├── vercel.json               # Config de deploy serverless
├── migrations/               # Migraciones SQL
├── certs/                    # Certificados Apple Wallet (PEM)
├── tests/                    # Tests con Vitest
└── package.json
```

### Endpoints Principales

#### Autenticación (`/api/auth/`)

| Método | Ruta | Descripción | Auth |
|--------|------|-------------|------|
| POST | `/api/auth/login` | Login (slug + username + password) | No |
| GET | `/api/auth/me` | Perfil del usuario autenticado | JWT |
| PUT | `/api/auth/password` | Cambiar contraseña | JWT |

#### Clientes - Core (`/api/`)

| Método | Ruta | Descripción | Auth |
|--------|------|-------------|------|
| POST | `/api/customers` | Registrar nuevo cliente + crear Wallet Pass | No |
| GET | `/api/customers/:id` | Perfil completo (perks + gifts) | No |
| GET | `/api/customers/:id/benefits` | Portal público de beneficios | No |
| GET | `/api/customers/:id/progress` | Progreso de tarjeta de sellos | No |
| GET | `/api/customers/:id/apple-pass` | Descargar .pkpass de Apple Wallet | No |
| POST | `/api/checkin` | Registrar visita (check-in) — flujo staff | No* |
| POST | `/api/checkin/kiosk` | Check-in + perfil (perks+gifts) en **una sola llamada**, optimizado para modo kiosco | No* |
| POST | `/api/redemption` | Canjear perk con puntos | No* |
| POST | `/api/redemption/gift` | Redimir regalo directo (gratis) | No* |
| GET | `/api/wallet/status` | Diagnóstico Google Wallet config | No |
| POST | `/api/print` | Puente de impresión TCP | No |

**Sobre `/api/checkin/kiosk`** (agregado para el modo kiosco): combina en una sola petición el check-in y la obtención de perks + regalos pendientes. Internamente ejecuta el insert del check-in y el update del cliente en **paralelo** (`Promise.all`), consulta perks y gifts en paralelo, y hace la actualización de Google Wallet y el auto-regalo como fire-and-forget. Esto reduce la latencia percibida (~300-500ms vs ~1s+ de los 2 requests secuenciales del flujo staff). Devuelve `{ checkin, customer, perks, pendingGifts }`.

*Estos endpoints validan `tenant_slug` para aislamiento entre negocios.

#### Admin (`/api/admin/`)

Todos requieren JWT con rol `owner`, `admin` o `staff`.

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/stats` | Dashboard: total clientes, check-ins hoy, canjes del mes |
| GET | `/birthdays` | Cumpleaños del mes actual |
| GET | `/checkins/recent` | Últimos 10 check-ins |
| GET | `/customers` | Lista de clientes del tenant |
| GET | `/customers/export` | Exportar clientes con último check-in |
| PUT | `/customers/:id` | Editar cliente |
| GET/POST/PUT/DELETE | `/perks[/:id]` | CRUD de beneficios canjeables |
| GET/POST/PUT/DELETE | `/promotions[/:id]` | CRUD de promociones |
| GET/PUT | `/config` | Configuración del programa de lealtad |
| GET/PUT | `/branding` | Branding de Wallet (colores, nombres) |
| POST | `/branding/image` | Subir imagen (logo/strip/icon) |
| GET/POST/PUT/DELETE | `/tiers[/:id]` | CRUD de niveles de lealtad |
| GET | `/reports/:type` | Reportes (visits, top_customers, redemptions, birthdays) |
| GET | `/reports/tiers` | Distribución de clientes por nivel |
| GET | `/reports/cycle-rewards` | Recompensas por ciclo (paginado) |

#### Super Admin (`/api/super/`)

Requiere JWT con rol `super_admin`.

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/tenants` | Listar todos los tenants |
| POST | `/tenants` | Crear tenant (+ config + tiers default) |
| PUT | `/tenants/:id` | Actualizar tenant |
| GET | `/tenants/:id/users` | Listar usuarios de un tenant |
| POST | `/tenants/:id/users` | Crear usuario admin |
| PUT | `/users/:id` | Actualizar usuario |
| DELETE | `/users/:id` | Desactivar usuario (soft delete) |

### Seguridad

- **Helmet**: Headers HTTP de seguridad
- **CORS**: Restringido a `ALLOWED_ORIGINS`
- **Rate Limiting**: 100 req/min global; login limitado a **10 intentos/15 min por IP** con `skipSuccessfulRequests: true` (los logins exitosos no cuentan contra el límite, para no penalizar a usuarios que aciertan tras un par de errores)
- **Bloqueo de cuenta**: 5 intentos fallidos → bloqueo 15 min (protección anti-fuerza-bruta a nivel de cuenta, independiente del rate limit por IP)
- **Nota operativa**: el rate limiter usa almacén en memoria (MemoryStore). En Vercel (serverless) los contadores viven por instancia y se limpian al reciclarse o con un redeploy. Un 429 en login suele ser bloqueo de IP, no de cuenta.
- **Validación de email**: Bloquea dominios desechables (60+ dominios)
- **JWT**: Tokens con expiración de 24h, roles embebidos
- **Contraseñas**: bcrypt con 12 salt rounds
- **Aislamiento multi-tenant**: Cada request validada contra `tenant_id` del JWT

### Variables de Entorno (Backend)

```env
# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# Google Wallet
GOOGLE_ISSUER_ID=3388000000023147315
GOOGLE_CLASS_ID=3388000000023147315.Loyalty_PANEM
GCP_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
# Opcional: logo por defecto para tenants sin logo propio (Google exige programLogo válido).
# Si no se define, se usa un logo genérico alojado en el bucket público de Supabase.
DEFAULT_WALLET_LOGO_URL=https://<proyecto>.supabase.co/storage/v1/object/public/tenant-branding/_defaults/logo.png

# Apple Wallet
APPLE_TEAM_ID=7S87DS9Z82

# Auth
JWT_SECRET=your-secret-key

# Server
PORT=3000
ALLOWED_ORIGINS=https://loyalty-staff.vercel.app,https://loyalty-admin.vercel.app
CLIENT_PORTAL_URL=https://loyalty-staff.vercel.app
```

---

## 2. Frontend — Staff Portal (`frontend/`)

### Tecnologías

| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| React | 19.x | UI Library |
| Vite | 8.x | Build tool |
| React Router | 7.x | Routing |
| html5-qrcode | 2.x | Escaneo QR |
| Axios | 1.x | HTTP Client |
| Lucide React | 1.x | Iconos |

### Estructura

```
frontend/
├── src/
│   ├── App.jsx                    # Flujo principal: Login → Scanner → Profile
│   ├── main.jsx                   # Entry point
│   ├── components/
│   │   ├── Scanner.jsx            # Escáner QR con html5-qrcode
│   │   ├── CustomerProfile.jsx    # Perfil post-scan: check-in, canjes, regalos
│   │   ├── KioskMode.jsx          # Modo kiosco: check-in automático + countdown configurable
│   │   ├── StaffLogin.jsx         # Login staff (slug + user + pass)
│   │   └── PrinterConfig.jsx      # Configuración método de impresión
│   ├── pages/
│   │   ├── Register.jsx           # Registro público de clientes (?tenant=slug)
│   │   └── Benefits.jsx           # Portal público de beneficios (/benefits/:id)
│   └── utils/
│       ├── printer.js             # 3 métodos de impresión: browser/serial/network
│       └── useBarcodeScanner.js   # Hook lector USB HID + helpers extractCustomerId/isValidCustomerId
├── vercel.json
└── package.json
```

### Flujos de Usuario

#### Staff (Aplicación Principal)
1. Login con slug del negocio + credenciales
2. Vista de escáner QR activa
3. Al escanear: muestra perfil del cliente con:
   - Datos (nombre, visitas, puntos)
   - Botón "Registrar Visita" (check-in)
   - Cortesías pendientes (redimibles gratis)
   - Perks canjeables con puntos
4. Al canjear: imprime ticket automáticamente

#### Cliente - Registro (`/register?tenant=slug`)
1. Formulario: nombre, email, teléfono, fecha cumpleaños
2. Validaciones client-side y server-side
3. Al crear: recibe botones para agregar a Google Wallet / Apple Wallet

#### Cliente - Beneficios (`/benefits/:customerId`)
1. Vista pública accesible desde el pase digital
2. Muestra puntos, perks disponibles, regalos pendientes

#### Modo Kiosco (check-in automático, pantalla grande)
Pensado para montar el sistema en una pantalla grande sin hostess. Se activa desde el header del Staff Portal (icono de monitor → panel de configuración → "Activar Modo Kiosco").

1. Pantalla completa con escáner QR permanente
2. Al escanear un QR válido, ejecuta el check-in **automáticamente** vía `POST /api/checkin/kiosk` (una sola llamada)
3. Muestra pantalla de resultado: bienvenida, puntos, visitas, nivel, progreso de ciclo y recompensa de ciclo si aplica
4. Si el cliente tiene beneficios (cortesías o perks canjeables), los muestra para redimir en el momento
5. **Countdown de inactividad configurable** (default 20s, rango 5–120s): cada interacción del usuario lo **reinicia desde cero**; si no hay interacción, regresa automáticamente al escáner al llegar a 0
6. Soporta escaneo por **lector USB** (principal) y **cámara** (secundario) simultáneamente

Detalles de comportamiento:
- **Countdown = temporizador de inactividad**: cualquier interacción (tap, scroll, movimiento, redención) reinicia el contador al timeout completo. Esto garantiza flujo continuo sin que el contador se quede estático mientras el cliente navega sus beneficios.
- El timeout se guarda en `localStorage` (`kiosk_timeout`), persiste entre recargas
- Los puntos mostrados usan un estado `currentPoints` que se actualiza tras cada redención, evitando mostrar saldos desactualizados
- La lista de perks se re-evalúa contra `currentPoints`: si tras un canje ya no alcanza, el perk desaparece
- Un flag `processingRef` evita check-ins concurrentes (doble escaneo del lector/cámara)
- En error (QR inválido, límite diario, etc.) muestra el mensaje 5s y vuelve al escáner
- Botón "Volver al escáner" para regresar manualmente y botón discreto "Salir del modo kiosco"

### Métodos de Impresión

| Método | Descripción | Compatibilidad |
|--------|-------------|----------------|
| Browser | Genera HTML en iframe oculto, usa `window.print()` | iOS/iPad/Desktop |
| Serial | Web Serial API directo a impresora USB ESC/POS | Chrome Desktop |
| Network | HTTP a un Print Bridge (relay HTTP→TCP) | Cualquier dispositivo |

### Métodos de Escaneo de QR

El sistema soporta **dos métodos de escaneo que coexisten** (no se reemplazan):

| Método | Cómo funciona | Uso principal |
|--------|---------------|---------------|
| **Lector USB** (HID) | Lector omnidireccional USB (keyboard-wedge): el SO lo ve como teclado, "teclea" el contenido del código + Enter. Capturado por el hook `useBarcodeScanner` que detecta ráfagas rápidas terminadas en Enter | Kiosco desatendido (All-in-One con lector fijo) — **método principal** |
| **Cámara** (`html5-qrcode`) | Acceso a la cámara del dispositivo, decodifica el QR por video | Respaldo / dispositivos móviles — **método secundario** |

**Hook `useBarcodeScanner`** (`frontend/src/utils/useBarcodeScanner.js`):
- Escucha `keydown` globalmente; acumula caracteres que llegan en < 50ms entre sí
- Al recibir Enter, si el buffer tiene longitud suficiente, dispara `onScan(code)`
- Ignora la escritura en inputs/textarea (evita falsos positivos)
- Se activa/desactiva con `{ enabled }` según la vista (solo escucha en la fase de escaneo)
- No requiere drivers ni permisos: el lector se comporta como teclado
- Recomendación de hardware: el lector debe enviar **Enter** como sufijo (configuración estándar)

Ambos métodos están activos tanto en el **Modo Kiosco** como en el **flujo normal de staff**.

---

## 3. Admin Panel (`admin/`)

### Tecnologías

Mismas que el frontend + `qrcode` (generación de QR codes).

### Estructura

```
admin/
├── src/
│   ├── App.jsx                        # Router: super_admin vs admin
│   ├── api.js                         # Axios instance con auth interceptor
│   ├── components/
│   │   ├── Layout.jsx                 # Shell con sidebar para admin
│   │   └── SuperAdminLayout.jsx       # Shell para super admin
│   └── pages/
│       ├── Login.jsx                  # Login admin
│       ├── Dashboard.jsx              # Stats: clientes, check-ins, canjes
│       ├── Customers.jsx              # Lista/edición de clientes
│       ├── Perks.jsx                  # CRUD beneficios canjeables
│       ├── Promotions.jsx             # CRUD promociones temporales
│       ├── TierConfig.jsx             # Configuración de niveles
│       ├── Config.jsx                 # Config programa (ciclos, nombre)
│       ├── Printers.jsx               # Gestión de impresoras de red
│       ├── Reports.jsx                # Reportes (visitas, top, canjes, etc.)
│       ├── SuperAdmin.jsx             # Gestión de tenants (plataforma)
│       └── SuperAdminUsers.jsx        # Gestión usuarios por tenant
├── vercel.json
└── package.json
```

### Roles y Permisos

| Rol | Acceso |
|-----|--------|
| `super_admin` | Gestión de tenants, usuarios de plataforma |
| `owner` | Todo el panel admin de su tenant |
| `admin` | Todo el panel admin de su tenant |
| `staff` | Todo el panel admin de su tenant |

---

## 4. Base de Datos (Supabase/PostgreSQL)

### Esquema de Tablas

#### `tenants`
Tabla central de multi-tenancy. Cada negocio es un tenant.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID (PK) | Identificador único |
| slug | VARCHAR (unique) | Identificador URL-friendly |
| name | VARCHAR | Nombre del negocio |
| is_active | BOOLEAN | Si el programa está activo |
| wallet_class_id | VARCHAR | ID de Loyalty Class en Google Wallet |
| wallet_issuer_name | VARCHAR | Nombre del emisor en Wallet |
| wallet_program_name | VARCHAR | Nombre del programa en Wallet |
| wallet_bg_color | VARCHAR(7) | Color de fondo (#RRGGBB) |
| wallet_fg_color | VARCHAR(7) | Color de texto |
| wallet_label_color | VARCHAR(7) | Color de labels |
| wallet_logo_url | TEXT | URL del logo |
| wallet_strip_url | TEXT | URL de la imagen strip |
| wallet_icon_url | TEXT | URL del ícono |
| logo_url | TEXT | Logo del negocio |
| primary_color, secondary_color, accent_color, text_color, background_color | VARCHAR | Colores de marca |
| created_at, updated_at | TIMESTAMPTZ | Timestamps |

#### `customers`
Clientes registrados en el programa de lealtad.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID (PK) | ID del cliente (usado en QR). Default `uuid_generate_v4()` |
| tenant_id | UUID (FK→tenants) | Negocio al que pertenece |
| name | TEXT | Nombre completo |
| email | TEXT (UNIQUE global) | ⚠️ La restricción UNIQUE es **global**, no por tenant. El backend además valida duplicados por (tenant_id + email) en el registro |
| phone | TEXT | Teléfono (10 dígitos MX) |
| birthday | DATE | Fecha de cumpleaños |
| visits_count | INTEGER | Total de visitas acumuladas (default 0) |
| points_balance | INTEGER | Saldo de puntos actual (default 0) |
| wallet_pass_id | TEXT (UNIQUE) | ID del objeto en Google Wallet |
| tier_id | UUID (FK→loyalty_tiers, NOT NULL) | Nivel actual |
| cycle_visits_count | INTEGER (CHECK >=0) | Visitas del ciclo actual (default 0) |
| cycles_completed | INTEGER (CHECK >=0) | Ciclos completados total (default 0) |
| is_active | BOOLEAN | Cliente activo (default true) |
| notes | TEXT | Notas internas del admin (default '') |
| created_at | TIMESTAMPTZ | Fecha de registro (default now()) |

#### `loyalty_tiers`
Niveles de lealtad configurables por tenant.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID (PK) | Identificador |
| tenant_id | UUID | Tenant dueño |
| name | VARCHAR(50) | Nombre (único por tenant) |
| points_per_visit | INTEGER (1-1000) | Puntos otorgados por visita |
| benefit_description | VARCHAR(200) | Descripción del beneficio del nivel |
| sort_order | INTEGER | Orden de visualización |
| is_default | BOOLEAN | Si es el nivel inicial |
| created_at, updated_at | TIMESTAMPTZ | Timestamps |

**Default Tiers:** Bronce (3pts), Plata (5pts), Oro (10pts), Platino (10pts + regalo)

#### `loyalty_config`
Configuración del programa por tenant.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | INTEGER (PK) | Identificador (default 1) |
| tenant_id | UUID (UNIQUE, FK→tenants) | Tenant (una config por tenant) |
| points_per_visit | INTEGER | Puntos por visita (legacy, default 10; los puntos reales vienen del tier) |
| program_name | TEXT | Nombre del programa (default 'Loyalty PANEM') |
| cycle_visits_required | INTEGER (CHECK 2-50) | Visitas para completar un ciclo (default 10) |
| cycle_reward_perk_id | UUID (FK→perks, nullable) | Perk de recompensa al completar ciclo |
| max_checkins_per_day | INTEGER | Límite de check-ins diarios (default 1; 0=ilimitado) |
| updated_at | TIMESTAMPTZ | Última actualización (default now()) |

#### `checkins`
Registro de visitas.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID (PK) | Identificador |
| tenant_id | UUID | Tenant |
| customer_id | UUID (FK→customers) | Cliente |
| scanned_by | VARCHAR | Quien registró ("Staff") |
| created_at | TIMESTAMPTZ | Fecha/hora del check-in |

#### `perks`
Beneficios canjeables con puntos.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID (PK) | Identificador (default `uuid_generate_v4()`) |
| tenant_id | UUID (FK→tenants) | Tenant |
| name | TEXT | Nombre del beneficio |
| description | TEXT | Descripción |
| cost_points | INTEGER | Costo en puntos |
| cost_visits | INTEGER | Costo alternativo en visitas (nullable) |
| is_active | BOOLEAN | Si está disponible (default true) |
| created_at | TIMESTAMPTZ | Creación (default now()) |

#### `redemptions`
Registro de canjes de perks.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID (PK) | Identificador |
| tenant_id | UUID | Tenant |
| customer_id | UUID (FK→customers) | Cliente |
| perk_id | UUID (FK→perks) | Beneficio canjeado |
| redeemed_by | VARCHAR | Quien procesó el canje |
| created_at | TIMESTAMPTZ | Fecha del canje |

#### `direct_gifts`
Regalos/cortesías directas (no requieren puntos).

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID (PK) | Identificador |
| tenant_id | UUID | Tenant |
| customer_id | UUID (FK→customers) | Cliente beneficiado |
| type | TEXT (CHECK 'points'/'perk') | Tipo de regalo |
| points_amount | INTEGER | Si tipo=points, cantidad regalada (default 0) |
| perk_id | UUID (FK→perks, nullable) | Si tipo=perk, cuál beneficio |
| reason | TEXT | Motivo del regalo |
| given_by | TEXT | Quien lo otorgó ('system' para auto-regalos) |
| redeemed_at | TIMESTAMPTZ | Null si no se ha redimido |
| created_at | TIMESTAMPTZ | Creación (default now()) |

#### `promotions`
Promociones temporales configurables.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID (PK) | Identificador (default `gen_random_uuid()`) |
| tenant_id | UUID (FK→tenants) | Tenant |
| name | TEXT | Nombre de la promoción |
| description | TEXT | Descripción |
| type | TEXT (CHECK) | Tipo: `double_points`, `bonus_points` o `free_perk` |
| value | INTEGER | Valor de la promoción (default 0) |
| perk_id | UUID (FK→perks, nullable) | Perk asociado (para `free_perk`) |
| start_date | TIMESTAMPTZ | Fecha/hora inicio |
| end_date | TIMESTAMPTZ | Fecha/hora fin |
| is_active | BOOLEAN | Activa/inactiva (default true) |
| days_of_week | INTEGER[] | Días válidos [0-6] (default `[]`) |
| created_at | TIMESTAMPTZ | Creación (default now()) |

#### `admin_users`
Usuarios administrativos del sistema.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID (PK) | Identificador |
| tenant_id | UUID (nullable) | Null = super_admin |
| username | VARCHAR (unique per tenant) | Nombre de usuario |
| password_hash | VARCHAR | Hash bcrypt |
| email | VARCHAR | Email |
| role | VARCHAR | 'super_admin', 'owner', 'admin', 'staff' |
| is_active | BOOLEAN | Activo (soft delete) |
| failed_attempts | INTEGER | Intentos fallidos de login |
| locked_until | TIMESTAMPTZ | Bloqueo temporal |
| last_login | TIMESTAMPTZ | Último login exitoso |
| created_at | TIMESTAMPTZ | Creación |

#### `tier_change_history`
Auditoría de cambios de nivel.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID (PK) | Identificador |
| tenant_id | UUID | Tenant |
| customer_id | UUID (FK→customers) | Cliente |
| previous_tier_id | UUID (FK→loyalty_tiers) | Nivel anterior |
| new_tier_id | UUID (FK→loyalty_tiers, NOT NULL) | Nuevo nivel |
| changed_by | VARCHAR(100) | Quien hizo el cambio |
| change_source | VARCHAR(20) | 'manual' o 'system' |
| created_at | TIMESTAMPTZ | Fecha del cambio |

**RLS**: Habilitada, policy para service_role.

#### `cycle_rewards`
Registro de ciclos completados.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID (PK) | Identificador |
| tenant_id | UUID | Tenant |
| customer_id | UUID (FK→customers) | Cliente |
| cycle_number | INTEGER | Número de ciclo completado |
| perk_id | UUID (FK→perks) | Recompensa otorgada (nullable) |
| created_at | TIMESTAMPTZ | Fecha de completación |

**UNIQUE**: (tenant_id, customer_id, cycle_number)
**RLS**: Habilitada, policy para service_role.

#### `printers`
Impresoras térmicas configuradas.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID (PK) | Identificador (default `gen_random_uuid()`) |
| tenant_id | UUID (FK→tenants) | Tenant |
| name | VARCHAR | Nombre descriptivo |
| ip_address | VARCHAR | IP de la impresora |
| port | INTEGER | Puerto (default 9100) |
| is_active | BOOLEAN | Activa (default true) |
| print_on_checkin | BOOLEAN | Imprimir en check-in (default **false**) |
| print_on_redemption | BOOLEAN | Imprimir en canje (default **true**) |
| print_on_cycle_reward | BOOLEAN | Imprimir en recompensa de ciclo (default **true**) |
| created_at | TIMESTAMPTZ | Creación (default now()) |

#### `admin_sessions`
Tabla de sesiones (presente en la BD; el flujo actual de auth es stateless con JWT, por lo que normalmente no se usa. Se conserva para compatibilidad / posible invalidación de tokens).

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID (PK) | Identificador (default `gen_random_uuid()`) |
| token | TEXT (UNIQUE) | Token de sesión |
| created_at | TIMESTAMPTZ | Creación (default now()) |
| expires_at | TIMESTAMPTZ | Expiración |

### Row Level Security (RLS)

**Todas las tablas del esquema `public` tienen RLS habilitado.** El backend opera con la **service role key** de Supabase, que **bypassa RLS**, por lo que toda la autorización real (aislamiento por tenant, roles) se hace en la capa de aplicación (middleware + filtros `.eq('tenant_id', ...)`). Las tablas `tier_change_history` y `cycle_rewards` tienen además políticas explícitas para `service_role`.

> ⚠️ Importante: como la seguridad depende de la capa de aplicación y de la service role key, **nunca** se debe exponer esa key al frontend ni permitir acceso directo del cliente a la BD.

---

## 5. Integraciones Externas

### Google Wallet

- **Tipo**: Loyalty Card (LoyaltyObject + LoyaltyClass)
- **Autenticación**: Service Account con scope `wallet_object.issuer`
- **Flujo de creación**: "Fat JWT" — el objeto se incluye completo en el JWT y se crea cuando el usuario lo agrega
- **Contenido del pase**:
  - QR Code: UUID del cliente (para escaneo en check-in)
  - Puntos (loyalty points)
  - Visitas del ciclo (secondary loyalty points)
  - Módulos de texto: Nivel, Progreso de ciclo
  - Link: Portal de beneficios del cliente
- **Actualizaciones**: Fire-and-forget con retry (0s, 5s, 30s) — no bloquea flujo principal
- **Multi-tenant**: Cada tenant tiene su propia Loyalty Class (`Loyalty_{slug}`), creada automáticamente al registrar el primer cliente del tenant
- **⚠️ `programLogo` obligatorio**: Google **rechaza** la creación de una LoyaltyClass sin un logo válido (URL que cargue). Si el tenant no tiene `wallet_logo_url`, se usa un **logo por defecto** alojado en el bucket público de Supabase (`tenant-branding/_defaults/logo.png`), configurable con `DEFAULT_WALLET_LOGO_URL`. Anteriormente se usaba una URL de ejemplo de Google que dejó de cargar y provocaba fallos de registro en tenants sin logo.

### Apple Wallet

- **Tipo**: Store Card (storeCard)
- **Generación**: Serverless, se genera el .pkpass al vuelo
- **Certificados**: PEM files en `backend/certs/` (signerCert, signerKey, wwdr)
- **Pass Type ID**: `pass.com.sw-pos.loyalty`
- **Team ID**: `7S87DS9Z82`
- **Contenido del pase**:
  - QR Code (format PKBarcodeFormatQR): UUID del cliente
  - Header: Puntos
  - Primary: Nombre del cliente
  - Secondary: Nivel + Visitas (progreso)
  - Back: ID membresía, Programa, Marca, URL beneficios
- **Branding dinámico**: Colores del tenant, logo/strip/icon remotos
- **Strip image**: Si no se configura, genera un PNG degradado programáticamente

### Impresión Térmica (ESC/POS)

- **Protocolo**: TCP directo a impresora (puerto 9100)
- **Formatos**: ESC/POS estándar (inicialización, centrado, doble tamaño, bold, corte)
- **Eventos de impresión**: check-in, redemption, cycle_reward
- **Backend**: Envía a todas las impresoras activas que coincidan con el tipo de evento
- **Frontend**: 3 métodos (browser/serial/network) con fallback automático

---

## 6. Flujos de Datos Principales

### Registro de Cliente

```
[Formulario Register.jsx]
    ↓ POST /api/customers {name, email, phone, birthday, tenant_slug}
[Validaciones]
    → Validar tenant_slug → encontrar tenant activo
    → Validar email (formato + dominio no desechable + TLD válido)
    → Validar teléfono (10 dígitos MX)
    → Verificar duplicados por email+tenant
[Creación]
    → Obtener tier default del tenant
    → Generar UUID para el cliente
    → Crear Google Wallet pass (Fat JWT)
    → Insertar en BD (customers)
    → Retornar: customer + saveUrl (Google) + applePassUrl
```

### Check-in (Visita)

```
[Scanner.jsx] → escanea QR del pase
    ↓ extrae customer UUID
[CustomerProfile.jsx] → GET /api/customers/:id
    ↓ muestra perfil
[Click "Registrar Visita"]
    ↓ POST /api/checkin {customerId, scannedBy, tenant_slug}
[Proceso en backend]
    1. Obtener cliente + validar tenant isolation
    2. Verificar límite diario (max_checkins_per_day)
    3. Resolver nivel del cliente (tier-engine)
    4. Calcular puntos según nivel
    5. Insertar registro en `checkins`
    6. Actualizar visits_count y points_balance
    7. Procesar ciclo (cycle-engine):
       - Incrementar cycle_visits_count
       - Si completa: reset, incrementar cycles_completed, crear reward
    8. Auto-regalo si es Platino
    9. Actualizar Google Wallet (async, fire-and-forget)
    10. Retornar: puntos, visitas, nivel, progreso ciclo, auto-gifts
```

### Check-in Kiosco (automático, optimizado)

```
[KioskMode.jsx] → escáner QR permanente
    ↓ QR válido detectado (valida formato UUID en cliente)
    ↓ POST /api/checkin/kiosk {customerId, scannedBy:'Kiosk', tenant_slug}
[Proceso en backend — una sola llamada]
    1. Obtener cliente + validar tenant isolation
    2. Config + límite diario (una query)
    3. Resolver tier y calcular puntos
    4. PARALELO: insert checkin  +  update customer (visits/points)
    5. Procesar ciclo (cycle-engine)
    6. PARALELO: obtener perks activos  +  regalos pendientes
    7. Fire-and-forget: update Google Wallet + auto-regalo Platino
    8. Retornar { checkin, customer, perks, pendingGifts }
[KioskMode.jsx]
    → Muestra resultado + beneficios
    → Countdown configurable (localStorage kiosk_timeout, default 20s)
    → Interacción pausa countdown; al expirar vuelve al escáner
```

### Canje de Beneficio (Redemption)

```
[CustomerProfile.jsx] → click en perk
    ↓ POST /api/redemption {customerId, perkId, redeemedBy, tenant_slug}
[Proceso]
    1. Obtener perk y validar que esté activo
    2. Validar que el cliente tiene puntos suficientes
    3. Descontar puntos del balance
    4. Insertar registro en `redemptions`
    5. Actualizar Google Wallet (async)
    6. Imprimir en impresoras configuradas (backend)
    7. Retornar datos del ticket
[Frontend]
    → Imprime ticket localmente (printer.js)
```

### Ciclo / Tarjeta de Sellos

```
[Durante check-in]
    → processCycleStep(supabase, customerId, cycleConfig)
    → Incrementa cycle_visits_count
    → Si newCount >= cycle_visits_required:
        → Reset cycle_visits_count a 0
        → Incrementa cycles_completed
        → Inserta en cycle_rewards
        → Opcionalmente vincula un perk como recompensa
    → Retorna: {completed, rewardName, cycleNumber, newCycleVisitsCount}
```

---

## 7. Sistema Multi-Tenant

### Creación de Tenant

Cuando un super_admin crea un nuevo negocio:
1. Se inserta en `tenants` con slug, nombre y wallet_class_id auto-generado
2. Se crea `loyalty_config` con valores default (10 pts/visita, ciclo de 10)
3. Se crean 4 `loyalty_tiers` default (Bronce, Plata, Oro, Platino)
4. Se puede crear un usuario `owner` para el negocio

### Aislamiento

- Cada request autenticada incluye `tenant_id` en el JWT
- Middleware inyecta `req.tenantId` en todas las rutas admin
- Queries siempre filtran por `.eq('tenant_id', req.tenantId)`
- Endpoints públicos usan `tenant_slug` como parámetro para resolver el tenant
- Un cliente pertenece exactamente a un tenant

---

## 8. Deployment

### Vercel Configuration

**Backend** (`backend/vercel.json`):
```json
{
  "version": 2,
  "builds": [{ "src": "api/index.js", "use": "@vercel/node" }],
  "routes": [{ "src": "/(.*)", "dest": "/api/index.js" }]
}
```
Express se exporta como `module.exports = app` para funcionar como serverless function.

**Frontend/Admin** (`vercel.json`):
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```
SPA con client-side routing.

### Variables de Entorno por Servicio

| Servicio | Variables Requeridas |
|----------|---------------------|
| Backend | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET, GOOGLE_ISSUER_ID, GCP_SERVICE_ACCOUNT_JSON, APPLE_TEAM_ID, ALLOWED_ORIGINS, CLIENT_PORTAL_URL |
| Frontend | VITE_API_URL |
| Admin | VITE_API_URL |

---

## 9. Reportes Disponibles

| Reporte | Endpoint | Descripción |
|---------|----------|-------------|
| Visitas | `/reports/visits?from=&to=` | Historial de check-ins con fecha/hora/cliente |
| Top Customers | `/reports/top_customers` | Top 20 clientes por visitas |
| Canjes | `/reports/redemptions?from=&to=` | Historial de redemptions |
| Cumpleaños | `/reports/birthdays` | Clientes con cumpleaños este mes |
| Tiers | `/reports/tiers` | Distribución de clientes por nivel |
| Cycle Rewards | `/reports/cycle-rewards?from=&to=&page=` | Recompensas otorgadas (paginado) |

---

## 10. Configuraciones Clave del Admin

| Configuración | Dónde | Descripción |
|---------------|-------|-------------|
| Nombre del programa | Config / Branding | Se sincroniza con Wallet |
| Puntos por visita | Tier Config | Definido por nivel (no global) |
| Visitas por ciclo | Config | 2–50, define la "tarjeta de sellos" |
| Recompensa de ciclo | Config | Perk que se otorga al completar ciclo |
| Max check-ins/día | Config | Previene abuso (default: 1) |
| Colores de Wallet | Branding | bg, fg, label — se aplican a todos los pases |
| Imágenes de Wallet | Branding | Logo, Strip, Icon — para Google y Apple |
| Impresoras | Printers | IP/puerto + qué eventos imprimir |
| Niveles | Tiers | 1-10 niveles con puntos customizables |
| Modo Kiosco | Staff Portal (frontend) | Activación + timeout configurable (5–120s), guardado en localStorage del dispositivo |

---

## 11. Testing

- **Framework**: Vitest
- **Tipo**: Tests de propiedades (property-based testing con fast-check)
- **Ubicación**: `backend/tests/`
- **Ejecución**: `npm run test` (single run) o `npm run test:properties`

---

## 12. Comandos de Desarrollo

```bash
# Backend
cd backend
npm install
npm run dev          # nodemon con hot reload (Puerto 3000)

# Frontend
cd frontend
npm install
npm run dev          # Vite dev server

# Admin
cd admin
npm install
npm run dev          # Vite dev server

# Migraciones
cd backend
npm run migrate      # Ejecuta migration 001

# Tests
cd backend
npm test             # Vitest single run
```

---

## Notas Importantes para Implementadores

1. **Supabase Service Role**: El backend usa el service role key (bypassa RLS). Nunca exponerla al frontend.
2. **Google Wallet Class**: Se crea automáticamente si no existe al registrar el primer cliente de un tenant. Requiere un `programLogo` válido: si el tenant no tiene logo, se usa el logo default del bucket (`DEFAULT_WALLET_LOGO_URL`). Un tenant sin logo y sin default válido fallará al registrar clientes.
3. **Apple Wallet Certs**: Deben estar en `backend/certs/` (signerCert.pem, signerKey.pem, wwdr.pem). Passphrase: `loyalty2024`.
4. **UUID como QR**: El contenido del código QR en los pases es simplemente el UUID del cliente. El scanner extrae el último segmento si contiene puntos (formato Google: `issuerId.customerId`).
5. **Fire-and-forget**: Las actualizaciones de Wallet no bloquean el flujo. Si fallan, se reintentan silenciosamente.
6. **Timezone**: Todas las fechas en UTC (TIMESTAMPTZ). El frontend formatea a `es-MX`.
7. **Puntos por nivel**: Los puntos se calculan según el `points_per_visit` del tier actual del cliente, no de la config global.
