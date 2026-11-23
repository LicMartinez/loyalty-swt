# SW Loyalty — Documentación Completa del Sistema

> **Fuente de verdad del proyecto.** Este archivo describe el sistema **tal como está implementado** (as-built). Úsalo para entender el funcionamiento y para decidir dónde tocar código.  
> Última revisión: **2026-11-17** (contrastado con el monorepo).  
> Compacto de mapa: `docs/00-ESTADO-ACTUAL.md`. Operación humana: `docs/MANUAL-DE-INSTALACION.md`.  
> Los docs `docs/01`–`06` son roadmap/histórico (planes Next.js, etc.); **no** son el runtime.

---

## Resumen Ejecutivo

**SW Loyalty** es un programa de lealtad digital **multi-tenant** (piloto: PANEM, slug `panem`). Una sola API y una sola BD; cada negocio se aísla por `tenant_id`.

**En producción hoy:**
- Registro de clientes con **Google Wallet** y **Apple Wallet** (`.pkpass`)
- Check-in por **QR** (staff/iPad) y **modo kiosco** desatendido
- Niveles (tiers), puntos y **tarjeta de sellos** (ciclos) por marca
- Admin de marca + **Super Admin** de plataforma
- Impresión térmica: **Print Bridge local** (camino operativo) + catálogo en BD
- Portal de beneficios del cliente (link desde Wallet)
- **Branding de tarjeta Wallet por tenant** (logo, banner iOS, colores, nombres)
- Staff en PC: impresoras IP (barra vs cover), despacho de boletos de cover, kiosco con loop de fotos/video

**Stack real:** Vite + React (staff/admin) + Express (API) + Supabase. **No** hay Next.js ni Supabase Auth.

---

## Arquitectura General

```
┌─────────────────────────────────────────────────────────────┐
│                        VERCEL (Hosting)                       │
├─────────────────┬──────────────────┬────────────────────────┤
│  Frontend SPA   │   Admin Panel    │    Backend API          │
│  Staff/Kiosco   │   Admin + Super  │    Express.js           │
│  React + Vite   │   React + Vite   │    Serverless Node.js   │
│  loyalty-staff  │  loyalty-admin-  │    loyalty-api-rho      │
│                 │  jet             │                         │
└────────┬────────┴────────┬─────────┴──────────┬─────────────┘
         │                 │                     │
         └─────────────────┼─────────────────────┘
                           │  service role (bypassa RLS)
              ┌────────────▼────────────────┐
              │        Supabase             │
              │  PostgreSQL + Storage       │
              │  bucket: tenant-branding    │
              └────────────┬───────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                  │
   ┌─────▼─────┐   ┌──────▼──────┐  ┌───────▼────────┐
   │  Google    │   │   Apple     │  │ Print Bridge   │
   │  Wallet    │   │   Wallet    │  │ PC del local   │
   │  API       │   │   .pkpass   │  │ HTTPS :4001    │
   └────────────┘   └─────────────┘  └───────┬────────┘
                                             │ TCP :9100
                                       ┌─────▼──────┐
                                       │ Impresora  │
                                       │ ESC/POS    │
                                       └────────────┘
```

**Entry points backend:**
- Local: `backend/index.js` (`listen` si no hay `VERCEL`)
- Vercel: `backend/api/index.js` reexporta la app

---

## URLs de Producción

| Servicio | URL | Puerto local |
|----------|-----|----------------|
| Backend API | `https://loyalty-api-rho.vercel.app` | 3000 |
| Staff / registro / beneficios / kiosco | `https://loyalty-staff.vercel.app` | 5173 HTTPS |
| Admin + Super Admin | `https://loyalty-admin-jet.vercel.app` | 5174 HTTPS |
| Print Bridge | Solo LAN (no Vercel) | 4001 HTTPS |

Fronts: `VITE_API_URL` vacío = paths relativos `/api/...` (válido con proxy Vite).

---

## Mapa del monorepo

```
loyalty/
├── backend/          # API Express (local :3000 / Vercel serverless)
├── frontend/         # Staff + kiosco + registro + beneficios (Vite :5173)
├── admin/            # Panel marca + Super Admin (Vite :5174)
├── print-bridge/     # Bridge HTTPS local → impresoras TCP :9100
├── supabase/         # config.toml local (sin migrations SQL versionadas)
├── docs/             # As-built corto + histórico 01–06 + manual
├── SYSTEM_DOCUMENTATION.md  # Este archivo — documento final
└── .agents/skills/   # Skills Supabase
```

---

## 1. Backend (`backend/`)

### Tecnologías

| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| Express.js | 5.x | Framework HTTP |
| Supabase JS | 2.x | Cliente de BD (service role) |
| jsonwebtoken | 9.x | JWT propio |
| bcrypt | 6.x | Hash de contraseñas |
| google-auth-library | 10.x | Google Wallet API |
| passkit-generator | 3.5.x | Apple Wallet `.pkpass` |
| helmet | 8.x | Headers de seguridad |
| express-rate-limit | 8.x | Rate limit |
| dotenv | 17.x | Variables de entorno |

JSON body: límite **25 MB** (imágenes Wallet + videos del kiosco en base64).

### Estructura de archivos

```
backend/
├── index.js                  # App Express, endpoints públicos/staff
├── api/index.js              # Entry Vercel (reexporta app)
├── admin-routes.js           # CRUD admin de marca
├── auth-routes.js            # Login, /me, password
├── auth-middleware.js        # JWT + roles
├── super-admin-routes.js     # Tenants y usuarios de plataforma
├── wallet.js                 # Google Wallet (clases, JWT, PATCH branding)
├── apple-wallet.js           # Generación .pkpass con branding
├── tier-engine.js            # Niveles y puntos
├── cycle-engine.js           # Tarjeta de sellos
├── print-service.js          # ESC/POS TCP (desde la API; en Vercel casi no llega a LAN)
├── vercel.json
├── migrations/               # 001–005 (JS que imprimen SQL si no hay RPC)
├── certs/                    # Apple: signerCert.pem, signerKey.pem, wwdr.pem, icon.png
├── tests/                    # Vitest
└── package.json
```

### Endpoints

#### Autenticación (`/api/auth/`) — `auth-routes.js`

| Método | Ruta | Auth | Notas |
|--------|------|------|-------|
| POST | `/api/auth/login` | No | Con `slug` → usuario de esa marca. Sin `slug` → solo `super_admin` |
| GET | `/api/auth/me` | JWT | |
| PUT | `/api/auth/password` | JWT | |

Rate limit login: **10 intentos / 15 min por IP**, `skipSuccessfulRequests: true`. API general: **100 req/min**. Bloqueo de cuenta: 5 fallos → 15 min (`auth-routes.js`). En Vercel el rate limit es por instancia (MemoryStore).

#### Público / staff (`index.js`)

Estos endpoints **no usan JWT**. El aislamiento es por `tenant_slug` y/o UUID del cliente.

| Método | Ruta | Notas |
|--------|------|-------|
| GET | `/` | Health |
| GET | `/api/wallet/status` | Diagnóstico Google Wallet |
| POST | `/api/customers` | Registro + Wallet. `tenant_slug` **obligatorio**; tenant debe estar activo |
| GET | `/api/customers/:id` | Perfil (staff). Query `tenant_slug` para isolation |
| GET | `/api/customers/:id/benefits` | Portal cliente (solo lectura) |
| GET | `/api/customers/:id/progress` | Sellos/ciclo. ⚠️ Lee `loyalty_config` **sin** filtrar `tenant_id` |
| GET | `/api/customers/:id/apple-pass` | Descarga `.pkpass` con logo/strip/colores del tenant |
| GET | `/api/cover-products` | Boletos de cover activos (`tenant_slug`) |
| POST | `/api/cover-products/:id/dispatch` | Registra impresión de cover |
| GET | `/api/kiosk/display` | Media + logo del kiosco (`tenant_slug`) |
| POST | `/api/checkin` | Visita staff: puntos + ciclo + rollback parcial |
| POST | `/api/checkin/kiosk` | Check-in + perks + gifts en **una** llamada |
| POST | `/api/redemption` | Canje por puntos. ⚠️ No exige `tenant_slug`; no siempre escribe `tenant_id` en `redemptions` |
| POST | `/api/redemption/gift` | Marca `direct_gifts.redeemed_at` |
| POST | `/api/print` | TCP directo desde la API (útil solo si el proceso ve la LAN) |

`/api/checkin` y `/api/checkin/kiosk` **validan tenant solo si llega `tenant_slug`**. El staff/kiosco sí lo envían (`localStorage.staff_slug`).

**`POST /api/checkin/kiosk`:** insert de check-in + update de cliente en paralelo; perks y gifts en paralelo; Wallet y auto-regalo Platino fire-and-forget. Respuesta: `{ checkin, customer, perks, pendingGifts }`.

#### Admin (`/api/admin/`) — JWT `owner` \| `admin` \| `staff`

Todas filtran por `req.tenantId`.

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/stats` | Clientes, check-ins hoy, canjes del mes |
| GET | `/birthdays` | Cumpleaños del mes |
| GET | `/checkins/recent` | Últimos 10 |
| GET | `/customers` | Lista |
| GET | `/customers/export` | Excel / último check-in |
| PUT | `/customers/:id` | Editar |
| PUT | `/customers/:id/tier` | Cambio de nivel (auditoría en `tier_change_history`) |
| DELETE | `/customers/:id` | Borra cliente y tablas relacionadas |
| POST | `/gifts` | Cortesía: puntos (suman al saldo) o perk (queda pendiente) |
| GET/POST/PUT/DELETE | `/perks[/:id]` | Premios |
| GET/POST/PUT/DELETE | `/promotions[/:id]` | CRUD. **El check-in no las aplica** |
| GET/PUT | `/config` | `points_per_visit`, `program_name`, ciclo, reward. Al guardar `program_name` también actualiza `tenants.wallet_program_name` |
| GET/PUT | `/branding` | Nombres y colores Wallet + `kiosk_media` |
| POST | `/branding/image` | Sube logo/strip/icon al bucket `tenant-branding` |
| POST/DELETE | `/branding/kiosk-media` | Fotos/videos del loop del kiosco |
| GET/POST/PUT/DELETE | `/cover-products[/:id]` | Catálogo de boletos de cover |
| GET/POST/PUT/DELETE | `/tiers[/:id]` | Niveles |
| GET | `/reports/:type` | `visits`, `top_customers`, `redemptions`, `birthdays` |
| GET | `/reports/tiers` | Distribución por nivel |
| GET | `/reports/cycle-rewards` | Recompensas de ciclo (paginado) |
| GET/POST/PUT/DELETE | `/printers[/:id]` | Catálogo BD |
| POST | `/printers/:id/test` | Ticket de prueba (TCP desde API) |

`max_checkins_per_day` existe en BD y lo usa el check-in; **no hay campo en Admin → Configuración** (se cambia en SQL o ampliando el PUT `/config`).

#### Super Admin (`/api/super/`) — solo `super_admin`

| Método | Ruta |
|--------|------|
| GET/POST | `/tenants` |
| PUT | `/tenants/:id` |
| GET/POST | `/tenants/:id/users` |
| PUT/DELETE | `/users/:id` |

Al crear tenant: inserta `tenants` (`wallet_class_id` = `{ISSUER}.Loyalty_{slug}`), `loyalty_config` default y 4 tiers.

### Seguridad

- Helmet + CORS (`ALLOWED_ORIGINS`; si está vacío, CORS abierto)
- Rate limit y bloqueo de cuenta (arriba)
- Email: formato + TLD + **60+ dominios desechables**
- Teléfono: 10 dígitos MX
- JWT 24h con `tenant_id`, `tenant_slug`, `role`
- bcrypt 12 rounds
- Autorización real en aplicación (service role **bypassa RLS**)

### Variables de entorno (backend)

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
JWT_SECRET=
PORT=3000
ALLOWED_ORIGINS=https://loyalty-staff.vercel.app,https://loyalty-admin-jet.vercel.app
CLIENT_PORTAL_URL=https://loyalty-staff.vercel.app

GOOGLE_ISSUER_ID=3388000000023147315
GOOGLE_CLASS_ID=3388000000023147315.Loyalty_PANEM
GCP_SERVICE_ACCOUNT_JSON={...}   # o archivo gcp-service-account.json
DEFAULT_WALLET_LOGO_URL=https://<proyecto>.supabase.co/storage/v1/object/public/tenant-branding/_defaults/logo.png

APPLE_TEAM_ID=7S87DS9Z82
```

No hay `.env.example` en el repo. No commitear `.env` ni certs nuevos.

---

## 2. Frontend — Staff Portal (`frontend/`)

### Tecnologías

React 19, Vite 8, React Router 7, html5-qrcode, Axios, Lucide.

Dev: **HTTPS :5173**, proxy `/api` → `http://127.0.0.1:3000`. `VITE_API_URL` opcional.

### Estructura

```
frontend/src/
├── App.jsx                    # Login → Scanner/Profile o KioskMode
├── main.jsx                   # Rutas: /  /register  /benefits/:id
├── components/
│   ├── Scanner.jsx            # Cámara html5-qrcode
│   ├── CustomerProfile.jsx    # Check-in, canjes, cortesías, print local
│   ├── KioskMode.jsx          # Check-in automático + countdown
│   ├── StaffLogin.jsx         # slug + user + pass
│   ├── PrinterConfig.jsx      # IP + rol barra/cover + Print Bridge
│   ├── CoverDispatch.jsx      # Despacho de boletos de cover
│   └── KioskBranding.jsx      # Loop fotos/video en espera
├── pages/
│   ├── Register.jsx           # Público; ?tenant= obligatorio
│   └── Benefits.jsx           # Portal cliente
└── utils/
    ├── printer.js             # browser / serial / Print Bridge
    └── useBarcodeScanner.js   # Lector USB HID (keyboard-wedge)
```

**Auth UI:** `staff_token` solo oculta/muestra la app. Check-in y canjes **no envían Bearer**; mandan `tenant_slug` desde `localStorage.staff_slug`.

Storage staff: `staff_token`, `staff_slug`, `staff_tenant_name`.

### Flujos

#### Staff
1. Login (slug del negocio + usuario + password)
2. Escáner (cámara). Lector USB HID como **método secundario** en esta vista
3. Perfil: visita, cortesías pendientes, perks
4. Al canjear: impresión local (`printer.js`)

#### Registro (`/register?tenant=slug`)
Sin query `tenant` → error (no hay default a `panem`). Formulario + validaciones. Respuesta: `saveUrl` (Google) + `applePassUrl`.

#### Beneficios (`/benefits/:customerId`)
Vista pública desde el pase.

#### Modo kiosco
Header staff → icono monitor → timeout 5–120 s (default 20, `localStorage.kiosk_timeout`) → Activar.

- Pantalla completa, escáner permanente
- QR válido → `POST /api/checkin/kiosk`
- Resultado: bienvenida, puntos, visitas, nivel, ciclo, cortesías/perks
- **Countdown de inactividad:** cada interacción **reinicia** el contador al timeout completo (no lo pausa)
- USB HID = **método principal** en kiosco; cámara solo si hay dispositivo (o preferencia `kiosk_camera`)
- Pantalla de espera: loop de fotos/videos (`tenants.kiosk_media`) a pantalla completa. **Se suben en Admin → Kiosco / Marketing**, no en staff.
- Salir del kiosco: botón fijo (z-index alto) o tecla **Escape**
- `processingRef` evita doble check-in
- Error: mensaje 5 s y vuelve al escáner

### Escaneo QR

| Método | Cómo | Dónde |
|--------|------|--------|
| USB HID | El lector “teclea” el UUID + Enter; `useBarcodeScanner` detecta ráfagas &lt; 50 ms | Principal en kiosco; secundario en staff |
| Cámara | `html5-qrcode` | Principal en staff; respaldo en kiosco |

El QR del pase es el **UUID del cliente**. Si el texto trae puntos (formato Google `issuerId.customerId`), se usa el último segmento (`extractCustomerId`).

### Impresión en el iPad/staff (camino operativo)

Config local en `PrinterConfig` (no es el CRUD de Admin → Impresoras).

| Método | Uso |
|--------|-----|
| Browser | `window.print()` — iOS/iPad **o Windows** (elige COVER en el diálogo del sistema) |
| Serial | Web Serial USB ESC/POS — Chrome desktop |
| Network | HTTPS al **Print Bridge** `:4001` (en la misma PC: `https://127.0.0.1:4001`) → TCP :9100. El certificado self-signed hay que aceptarlo una vez. |

Cada impresora IP tiene rol:

| Rol | Qué imprime |
|-----|-------------|
| **Barra** | Canjes y cortesías — **todas** las impresoras de barra |
| **Cover** | Boletos de acceso — **una sola** impresión en esa impresora |

El nombre del negocio sale del tenant (`staff_tenant_name`), ya no “PANEM” fijo.

---

## 3. Admin Panel (`admin/`)

React 19 + Vite 8 + `qrcode`. Dev: **HTTPS :5174**, mismo proxy `/api`.  
`VITE_API_URL`, `VITE_STAFF_PORTAL_URL` (default `https://loyalty-staff.vercel.app` para el QR de registro).

Cliente HTTP: `admin/src/api.js` → `/api/admin` + Bearer `admin_token`.

### Estructura

```
admin/src/
├── App.jsx                  # Sin token → Login. super_admin → UI plataforma (sin rutas /super)
├── api.js
├── components/Layout.jsx    # Sidebar marca
├── components/SuperAdminLayout.jsx
└── pages/
    ├── Login.jsx
    ├── Dashboard.jsx
    ├── Customers.jsx        # Edición, tier, gifts, export, delete
    ├── Perks.jsx
    ├── Promotions.jsx
    ├── TierConfig.jsx
    ├── Config.jsx           # QR registro + ciclo + **Tarjeta Wallet** + password
    ├── Printers.jsx         # Catálogo BD
    ├── Reports.jsx
    ├── SuperAdmin.jsx
    └── SuperAdminUsers.jsx
```

### Rutas de marca

| Path | Página |
|------|--------|
| `/` | Dashboard |
| `/customers` | Clientes |
| `/perks` | Premios |
| `/promotions` | Promociones (solo CRUD) |
| `/reports` | Reportes |
| `/tiers` | Niveles |
| `/printers` | Impresoras BD |
| `/kiosk` | Boletos de cover + media loop del kiosco |
| `/config` | Programa + branding Wallet + QR de registro + password |

### Branding Wallet (Admin → Configuración)

Cada tenant personaliza la tarjeta iOS/Android:

- Nombres: `wallet_program_name`, `wallet_issuer_name`
- Colores: fondo, texto, etiquetas (si no hay texto/label, el `.pkpass` calcula contraste)
- Imágenes PNG/JPEG ≤ 2 MB → Storage `tenant-branding/{tenant_id}/{logo\|strip\|icon}.ext`
- Preview aproximado de iOS en la misma pantalla

Al guardar branding se intenta `PATCH` de la Loyalty Class de Google. **Apple no actualiza pases ya descargados**; el cliente debe volver a añadir la tarjeta.

El CSS de staff/admin y los tickets térmicos **no** aplican aún `primary_color` / `logo_url` del tenant.

### Roles

| Rol | `tenant_id` | Acceso |
|-----|-------------|--------|
| `super_admin` | `NULL` | Marcas y usuarios de marca |
| `owner` / `admin` / `staff` | UUID | Todo el panel de su tenant (hoy no hay diferencia de menú por rol) |

---

## 4. Print Bridge (`print-bridge/`)

Proceso **en la PC del local**, no en Vercel. El iPad llama HTTPS `:4001`; el bridge abre TCP a la impresora.

| Método | Ruta | Body |
|--------|------|------|
| GET | `/` | Health `{ status, port }` |
| POST | `/probe` | `{ ip, port }` — abre TCP y cierra, sin imprimir |
| POST | `/print` | `{ ip, port, data }` ESC/POS |

Puerto: `PRINT_BRIDGE_PORT` (default **4001**). Certificado self-signed en `print-bridge/.certs/`.  
Servicio Windows: `install-service.js` / `uninstall-service.js`.

`printToAllPrinters` en el backend (tras canje, etc.) **no filtra `tenant_id`** y desde Vercel **casi nunca alcanza la LAN**. El flujo real de tickets es staff → Print Bridge.

---

## 5. Base de Datos (Supabase/PostgreSQL)

No hay `supabase/migrations/` SQL versionado. El esquema vive en producción + scripts `backend/migrations/001`–`005`.

### `tenants`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID (PK) | |
| slug | VARCHAR unique | URL-friendly |
| name | VARCHAR | |
| is_active | BOOLEAN | |
| wallet_class_id | VARCHAR | Loyalty Class Google (`…Loyalty_{slug}`) |
| wallet_issuer_name | VARCHAR | Emisor |
| wallet_program_name | VARCHAR | Texto del pase |
| wallet_bg_color | VARCHAR | Fondo `#RRGGBB` |
| wallet_fg_color | VARCHAR | Texto (opcional) |
| wallet_label_color | VARCHAR | Etiquetas (opcional) |
| wallet_logo_url | TEXT | Logo (Google + Apple `logo.png`) |
| wallet_strip_url | TEXT | Banner iOS; si falta, se genera degradado |
| wallet_icon_url | TEXT | Icono notificaciones Apple |
| kiosk_media | JSONB | Loop del kiosco: `[{ url, type: 'image'\|'video' }]` |
| logo_url, primary_color, secondary_color, accent_color, text_color, background_color | | Branding UI de apps **aún no usado** |
| created_at, updated_at | TIMESTAMPTZ | |

Storage público: bucket **`tenant-branding`**.

### `customers`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID (PK) | Contenido del QR. Default `uuid_generate_v4()` |
| tenant_id | UUID FK | |
| name, email, phone, birthday | | Email UNIQUE **global** en BD; el registro también valida duplicado por (tenant + email) |
| visits_count | INTEGER | Default 0 |
| points_balance | INTEGER | Default 0 |
| wallet_pass_id | TEXT unique | Objeto Google Wallet |
| tier_id | UUID FK NOT NULL | |
| cycle_visits_count | INTEGER ≥0 | Sellos del ciclo actual |
| cycles_completed | INTEGER ≥0 | |
| is_active | BOOLEAN | |
| notes | TEXT | |
| created_at | TIMESTAMPTZ | |

**No hay ascenso automático de tier por visitas** — solo `PUT /customers/:id/tier`.

### `loyalty_tiers`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID | |
| tenant_id | UUID | |
| name | VARCHAR(50) unique por tenant | |
| points_per_visit | INTEGER 1–1000 | Puntos reales del check-in |
| benefit_description | VARCHAR(200) | Si contiene `"regalo"` (case insensitive) → auto `direct_gifts` en check-in |
| sort_order | INTEGER | |
| is_default | BOOLEAN | Nivel al registrarse |
| created_at, updated_at | | |

Default al crear tenant: Bronce (3), Plata (5), Oro (10), Platino (10 + texto de regalo).

### `loyalty_config`

Una fila por tenant.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | INTEGER | |
| tenant_id | UUID unique FK | |
| points_per_visit | INTEGER | Legacy; el check-in usa el del **tier** |
| program_name | TEXT | |
| cycle_visits_required | INTEGER 2–50 | Default 10 |
| cycle_reward_perk_id | UUID FK perks nullable | |
| max_checkins_per_day | INTEGER | Default 1; **0 = ilimitado**. No expuesto en UI |
| updated_at | TIMESTAMPTZ | |

### `checkins` / `perks` / `redemptions` / `direct_gifts` / `promotions`

- `checkins`: visita (`tenant_id`, `customer_id`, `scanned_by`, `created_at`)
- `perks`: premio (`cost_points`, `cost_visits` nullable, `is_active`)
- `redemptions`: canje por puntos
- `direct_gifts`: `type` `points` \| `perk`; `redeemed_at` null = pendiente; `given_by` `admin` o `system`
- `promotions`: `double_points` \| `bonus_points` \| `free_perk` + fechas/días. **CRUD only**

### `admin_users`

| Columna | Notas |
|---------|-------|
| tenant_id | `NULL` = super_admin |
| username | Unique por tenant |
| password_hash | bcrypt |
| role | `super_admin` \| `owner` \| `admin` \| `staff` |
| failed_attempts, locked_until, last_login, is_active | |

### `tier_change_history` / `cycle_rewards`

- Historial de nivel (`change_source` `manual` \| `system`). RLS + policy `service_role`
- Ciclos completados: UNIQUE `(tenant_id, customer_id, cycle_number)`. Completar ciclo **escribe `cycle_rewards`**, **no** crea `direct_gifts` canjeable. ⚠️ `cycle-engine` inserta `tenant_id` con UUID cero (`DEFAULT_TENANT_ID`)

### `printers`

Catálogo por tenant: IP, puerto 9100, flags `print_on_checkin` (default false), `print_on_redemption` / `print_on_cycle_reward` (default true).

### `cover_products` / `cover_tickets`

Boletos de acceso del staff portal. `cover_products`: catálogo por tenant (`name`, `is_active`, `sort_order`). `cover_tickets`: log de cada despacho.

### `admin_sessions`

Legacy. Auth actual es JWT stateless.

### RLS

Todas las tablas `public` tienen RLS. El backend usa **service role → bypass**. La seguridad es filtro `.eq('tenant_id', …)` en código. **Nunca** exponer la service role al frontend.

### Migraciones en repo

| Script | Qué |
|--------|-----|
| `001_create_loyalty_tiers.js` | Tiers + seed (`npm run migrate` solo corre esta) |
| `002_...` | Columnas ciclo/tier en customers |
| `003_...` | Ciclo en loyalty_config |
| `004_...` | `tier_change_history` + `cycle_rewards` + RLS |
| `005_apple_wallet_branding.js` | `wallet_strip_url`, `wallet_icon_url`, `wallet_fg_color`, `wallet_label_color` + bucket `tenant-branding` |
| `006_cover_products_and_kiosk_media.js` | `cover_products`, `cover_tickets`, `tenants.kiosk_media` |

Si no existe RPC `exec_sql`, el script imprime el SQL para el Dashboard.

---

## 6. Integraciones externas

### Google Wallet

- LoyaltyClass + LoyaltyObject. Scope `wallet_object.issuer`
- **Fat JWT**: el objeto se crea al guardar el pase
- QR = UUID del cliente; puntos; visitas de ciclo; módulos Nivel/Progreso; link a `/benefits/:id`
- Updates: fire-and-forget con retry 0s / 5s / 30s
- Una class por tenant (`Loyalty_{slug}`), se crea al primer registro
- **`programLogo` obligatorio.** Sin `wallet_logo_url` http(s) se usa `DEFAULT_WALLET_LOGO_URL` (bucket `tenant-branding/_defaults/logo.png`)
- `updateLoyaltyClassBranding` al guardar branding en Admin

### Apple Wallet

- Tipo `storeCard`. Pass Type ID `pass.com.sw-pos.loyalty`. Team ID `7S87DS9Z82` (o `APPLE_TEAM_ID`)
- Se genera **al vuelo** en `GET /api/customers/:id/apple-pass`
- Certs PEM en `backend/certs/` (passphrase del signer: `loyalty2024`)
- Header: puntos reales. Primary: nombre. Secondary: nivel + `visitas/ciclo`
- Back: ID, programa, marca, URL beneficios
- Imágenes embebidas: `icon` / `logo` / `strip` (`@2x`/`@3x`). Sin strip → PNG degradado del color de marca
- Colores: `backgroundColor` del tenant; fg/label override o contraste automático
- **Sin webServiceURL / push:** el pase es estático. Check-in y branding nuevo **no** actualizan el pase ya en el iPhone

### Impresión ESC/POS

Dos capas:

1. **Operativa:** iPad → Print Bridge `:4001` → TCP impresora
2. **Catálogo admin + `printToAllPrinters`:** la API intenta TCP; en Vercel suele fallar y además no filtra tenant

---

## 7. Flujos de datos

### Registro

```
Register.jsx ?tenant=slug
  → POST /api/customers { name, email, phone, birthday, tenant_slug }
  → tenant activo, email, teléfono, unique email+tenant
  → tier is_default, UUID, Fat JWT Google, INSERT customers
  → { customer, saveUrl, applePassUrl }
```

`applePassUrl` apunta a `https://loyalty-api-rho.vercel.app/api/customers/{id}/apple-pass` (dominio público, no `VERCEL_URL`).

### Check-in staff

```
Scanner → GET /api/customers/:id?tenant_slug=
  → POST /api/checkin { customerId, scannedBy, tenant_slug }
  1. Isolation si hay slug
  2. max_checkins_per_day (default 1)
  3. Puntos = loyalty_tiers.points_per_visit
  4. INSERT checkins + UPDATE visits/points (con rollback si falla después)
  5. processCycleStep → cycle_rewards al completar (no direct_gifts)
  6. Si benefit_description contiene "regalo" → direct_gifts
  7. PATCH Google Wallet async
```

### Check-in kiosco

Igual en negocio; una sola request `/api/checkin/kiosk`; insert+update en paralelo; incluye perks y pendingGifts en la respuesta.

### Canje

Puntos: descuenta balance + `redemptions` + print local + Wallet async.  
Gift: `redeemed_at` + print.  
Admin gifts: `POST /api/admin/gifts`.

### Ciclo (sellos)

`processCycleStep`: incrementa `cycle_visits_count`; al llegar a `cycle_visits_required` resetea a 0, sube `cycles_completed`, inserta `cycle_rewards` (con `DEFAULT_TENANT_ID` hoy).

---

## 8. Multi-tenant

- Una BD, columna `tenant_id`
- JWT inyecta `req.tenantId` en admin
- Público: `tenant_slug` en body/query
- Un cliente = un tenant
- Super admin crea marca + config + 4 tiers; luego usuarios `owner`/`admin`/`staff`

---

## 9. Deployment

**Backend** `backend/vercel.json`: `@vercel/node` sobre `api/index.js`, rewrite `/(.*)`.

**Fronts:** SPA rewrite a `index.html`.

| Servicio | Env |
|----------|-----|
| Backend | `SUPABASE_*`, `JWT_SECRET`, `GOOGLE_*`, `GCP_SERVICE_ACCOUNT_JSON`, `APPLE_TEAM_ID`, `ALLOWED_ORIGINS`, `CLIENT_PORTAL_URL`, opcional `DEFAULT_WALLET_LOGO_URL` |
| Frontend | `VITE_API_URL` |
| Admin | `VITE_API_URL`, `VITE_STAFF_PORTAL_URL` |
| Print Bridge | `PRINT_BRIDGE_PORT` (4001) |

---

## 10. Reportes

| Reporte | Endpoint |
|---------|----------|
| Visitas | `/reports/visits?from=&to=` |
| Top 20 | `/reports/top_customers` |
| Canjes | `/reports/redemptions?from=&to=` |
| Cumpleaños | `/reports/birthdays` |
| Tiers | `/reports/tiers` |
| Cycle rewards | `/reports/cycle-rewards?from=&to=&page=` |

---

## 11. Testing

Vitest + fast-check (motores, **no** rutas HTTP).

```
backend/tests/tier-engine.test.js
backend/tests/cycle-engine.test.js
backend/tests/wallet.test.js
backend/tests/apple-wallet.test.js   # helpers de color/strip PNG
backend/tests/properties/setup.test.js
```

```bash
cd backend && npm test
```

---

## 12. Comandos de desarrollo

```bash
# Terminal 1 — API
cd backend && npm run dev          # :3000

# Terminal 2 — Staff / kiosco / registro
cd frontend && npm run dev         # :5173 HTTPS

# Terminal 3 — Admin
cd admin && npm run dev            # :5174 HTTPS

# Opcional — impresión LAN
cd print-bridge && node index.js   # :4001 HTTPS
```

```bash
cd backend
npm run migrate    # solo 001
npm test
```

---

## 13. Guía para cambiar el sistema

1. Leer **este archivo**. No reimplementar planes de `docs/01`–`06` sin contrastarlos.
2. Operación humana → `docs/MANUAL-DE-INSTALACION.md`.
3. **Nuevo endpoint admin** → `admin-routes.js` + página en `admin/src/pages` + ítem en `Layout.jsx`.
4. **Público/staff/kiosco** → `index.js` + consumo en `frontend`.
5. **Plataforma (marcas/users)** → `super-admin-routes.js` + SuperAdmin*.
6. **Schema** → script en `backend/migrations/` + SQL en Dashboard si no hay `exec_sql` + actualizar este doc.
7. **Siempre** filtrar `tenant_id`. No confiar en RLS con service role.
8. Impresión en local → Print Bridge `:4001`, no TCP desde Vercel.
9. Tras cambios estructurales, actualizar **este archivo** y el mapa `docs/00-ESTADO-ACTUAL.md`.

---

## 14. Qué está hecho vs no

| Tema | Estado |
|------|--------|
| Multi-tenant + Super Admin | Hecho |
| JWT + roles | Hecho (staff ve el mismo menú admin que owner) |
| Tiers + ciclos | Hecho; tier no sube solo |
| Kiosco | Hecho |
| Print Bridge + catálogo impresoras | Hecho |
| Google + Apple al alta | Hecho |
| Branding Wallet por tenant | Hecho (Admin → Configuración) |
| CSS/logo dinámico en staff/admin | No |
| Tickets con nombre del tenant | No (hardcode PANEM) |
| Push/update Apple tras check-in | No |
| Promociones en check-in | No (solo CRUD) |
| Completar ciclo → cortesía canjeable | No (solo `cycle_rewards`) |
| Transferencia de puntos | No |
| Next.js / Stripe | No |

---

## 15. Deuda / gotchas (al tocar código)

1. Endpoints de negocio sin JWT: isolation débil si falta `tenant_slug`.
2. `DEFAULT_TENANT_ID` (`00000000-…`) en `tier-engine` / `cycle-engine` puede contaminar `cycle_rewards.tenant_id`.
3. `GET /api/customers/:id/progress` lee `loyalty_config` sin `.eq('tenant_id')`.
4. `printToAllPrinters` no filtra tenant; TCP desde Vercel a LAN suele fallar.
5. Insert de redención por puntos a veces omite `tenant_id`.
6. Ciclo completo ≠ `direct_gifts`.
7. Promociones no entran al check-in.
8. Apple estático: re-añadir el pase tras branding o para ver puntos nuevos.
9. Unique de email en BD es **global**; el código valida por tenant.
10. Certificados Apple / `.p12` / service accounts: no versionar secretos nuevos.
11. UI a veces menciona puerto `3001`; el bridge real es **4001**.
12. `max_checkins_per_day` no está en la UI de Config.

---

## 16. Inventario de docs

| Archivo | Usar para |
|---------|-----------|
| **`SYSTEM_DOCUMENTATION.md`** | Documento final: funcionamiento + dónde cambiar |
| `docs/00-ESTADO-ACTUAL.md` | Mapa corto as-built (apunta aquí) |
| `docs/MANUAL-DE-INSTALACION.md` | Instalación y uso operativo |
| `docs/01`–`06` | Roadmap/histórico; verificar contra este archivo |

---

## Notas para implementadores

1. **Service role** solo en backend.
2. Google exige `programLogo` válido; sin logo de tenant usa el default del bucket.
3. Certs Apple en `backend/certs/`. Icon de fallback: `certs/icon.png`.
4. QR = UUID del cliente.
5. Updates de Google Wallet no bloquean el check-in.
6. Fechas en UTC (`TIMESTAMPTZ`); UI `es-MX`.
7. Puntos de visita = `points_per_visit` del **tier**, no de `loyalty_config`.
8. Banner iOS recomendado: PNG **750×246**. Logo ~320×100 o cuadrado.
