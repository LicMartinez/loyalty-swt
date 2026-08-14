# SW Loyalty — Estado Actual del Proyecto (As-Built)

> **Fuente de verdad técnica.** Léela antes de explorar el código.  
> Última actualización: 2026-08-14  
> Estado: **plataforma multi-tenant operativa** (Vite + Express + Supabase), no el MVP single-tenant ni el plan Next.js de docs antiguas.

---

## 1. Qué es

Programa de lealtad digital multi-tenant para negocios (piloto: **PANEM**, slug `panem`).

**Capacidades en producción:**
- Registro de clientes con Google Wallet + Apple Wallet (`.pkpass`)
- Scanner QR (staff/iPad) → check-in, puntos, canjes, cortesías
- Niveles (tiers) y ciclos/sellos configurables por marca
- Admin de marca + Super Admin de plataforma
- Impresión térmica (Print Bridge local + catálogo de impresoras en BD)
- Portal de beneficios del cliente (link desde Wallet)

---

## 2. Monorepo — mapa de carpetas

```
loyalty/
├── backend/          # API Express (local :3000 / Vercel serverless)
├── frontend/         # Staff + registro + beneficios (Vite :5173, HTTPS)
├── admin/            # Panel admin + Super Admin (Vite :5174, HTTPS)
├── print-bridge/     # Bridge HTTPS local → impresoras TCP :9100 (:4001)
├── supabase/         # config.toml local (sin migrations SQL en repo)
├── docs/             # Documentación (este archivo = as-built)
└── .agents/skills/   # Skills Supabase del proyecto
```

**No hay** app Next.js. Los docs `01`–`06` de migración a Next/SaaS son **roadmap/histórico**, no el runtime actual.

---

## 3. Stack real

| Capa | Tecnología |
|------|------------|
| Staff / Cliente | React 19 + Vite 8 + react-router-dom 7 |
| Admin | React 19 + Vite 8 |
| API | Node.js CommonJS, Express 5 |
| BD | Supabase PostgreSQL (`@supabase/supabase-js` + **service role**) |
| Auth | JWT propio (`jsonwebtoken` + `bcrypt`) — **no** Supabase Auth |
| Wallet | Google Wallet API + Apple PassKit (`passkit-generator`) |
| Seguridad | `helmet`, `cors`, `express-rate-limit` |
| Tests | Vitest + fast-check (motores, no rutas HTTP) |
| Deploy | Vercel (3 fronts + API) + Supabase cloud + Print Bridge en PC del local |

### URLs de producción (referencia operativa)

| Portal | URL |
|--------|-----|
| Admin | `https://loyalty-admin-jet.vercel.app` |
| Staff / Beneficios | `https://loyalty-staff.vercel.app` |
| API | `https://loyalty-api-rho.vercel.app` |

Detalle de uso operativo: `docs/MANUAL-DE-INSTALACION.md`.

---

## 4. Cómo arrancar en local

```bash
# Terminal 1 — API
cd backend && npm run dev          # :3000

# Terminal 2 — Staff / registro / beneficios
cd frontend && npm run dev         # :5173 HTTPS, proxy /api → 3000

# Terminal 3 — Admin
cd admin && npm run dev            # :5174 HTTPS, proxy /api → 3000

# Opcional — impresión en LAN
cd print-bridge && node index.js   # :4001 HTTPS
```

Variable fronts: `VITE_API_URL` (sin slash final). Vacío = paths relativos `/api/...` (válido con proxy Vite).

---

## 5. Arquitectura en runtime

```
┌──────────────────┐  ┌──────────────────┐
│ frontend :5173   │  │ admin :5174      │
│ / staff          │  │ tenant admin     │
│ /register        │  │ super_admin UI   │
│ /benefits/:id    │  └────────┬─────────┘
└────────┬─────────┘           │
         │ proxy /api          │
         └──────────┬──────────┘
                    ▼
         ┌─────────────────────┐
         │ backend Express     │
         │ auth / admin /      │
         │ super / customers   │
         │ checkin / redeem    │
         └──────────┬──────────┘
                    │ service role
                    ▼
              ┌──────────┐
              │ Supabase │
              └──────────┘
                    │
    Google Wallet / Apple certs (backend)

iPad ──HTTPS──► Print Bridge :4001 ──TCP :9100──► Impresora
```

**Entry points backend:**
- Local: `backend/index.js` (`listen` si no hay `VERCEL`)
- Vercel: `backend/api/index.js` reexporta la app

---

## 6. Multi-tenancy y roles

**Modelo:** una sola BD + columna `tenant_id` en tablas de negocio.

| Rol | `tenant_id` | Acceso |
|-----|-------------|--------|
| `super_admin` | `NULL` | Crear marcas, usuarios de marca |
| `owner` / `admin` / `staff` | UUID del tenant | Panel/admin según JWT |

**Aislamiento:** filtros en aplicación (`.eq('tenant_id', …)`). Backend usa **service role → bypass RLS**. RLS solo documentado/activo en `tier_change_history` y `cycle_rewards` (policies `service_role`).

**Login:** `POST /api/auth/login`
- Con `slug` → usuario de esa marca
- Sin `slug` → solo `super_admin`

JWT 24h: `tenant_id`, `tenant_slug`, `role`, etc. (`auth-middleware.js`).

---

## 7. Apps UI

### 7.1 Frontend (`frontend/src`)

| Ruta | Archivo | Auth UI | Notas |
|------|---------|---------|-------|
| `/` | `App.jsx` + Scanner / CustomerProfile | `staff_token` | Check-in, canje, print |
| `/register?tenant=slug` | `pages/Register.jsx` | Público | **Slug obligatorio** en query (`?tenant=`). Sin slug → error (no default a `panem`) |
| `/benefits/:customerId` | `pages/Benefits.jsx` | Público | Solo lectura |

**Importante:** el `staff_token` es gate de pantalla; check-in/redemption **no envían Bearer** — usan `tenant_slug` en body/query.

Storage staff: `staff_token`, `staff_slug`, `staff_tenant_name`.

### 7.2 Admin (`admin/src`)

Sin token → `Login.jsx`.  
Si `user_data.role === 'super_admin'` → UI Super Admin (state, **sin** rutas `/super`).  
Si no → Layout + rutas de marca:

| Path | Página |
|------|--------|
| `/` | Dashboard |
| `/customers` | Clientes (tier, gifts, export) |
| `/perks` | Premios |
| `/promotions` | Promociones |
| `/reports` | Reportes |
| `/tiers` | Niveles |
| `/printers` | Impresoras (BD) |
| `/config` | Config programa + branding Wallet (iOS/Android) + password |

Cliente HTTP: `admin/src/api.js` → base `/api/admin` + Bearer `admin_token`.

### 7.3 Branding UI

La **tarjeta Wallet** sí se personaliza por tenant (Admin → Configuración → Tarjeta Wallet): logo, banner iOS (`strip`), icono, colores y nombres. Se guarda en `tenants.wallet_*` y, al generar el `.pkpass`, se embebe en el pase.

El resto de UIs (staff/admin CSS, tickets térmicos) **aún no** aplican branding dinámico. Tickets en `frontend/src/utils/printer.js` aún hardcodean nombre `PANEM` en varios strings.

---

## 8. API — mapa de endpoints

### Auth — `/api/auth` (`auth-routes.js`)

| Método | Ruta | Auth |
|--------|------|------|
| POST | `/login` | No |
| GET | `/me` | JWT |
| PUT | `/password` | JWT |

Rate limit login: 5 / 15 min. API general: 100 / min.

### Super — `/api/super` (`super-admin-routes.js`) — solo `super_admin`

| Método | Ruta |
|--------|------|
| GET/POST | `/tenants` |
| PUT | `/tenants/:id` |
| GET/POST | `/tenants/:id/users` |
| PUT/DELETE | `/users/:id` |

### Admin — `/api/admin` (`admin-routes.js`) — `owner`\|`admin`\|`staff`

Áreas: `stats`, `birthdays`, `checkins/recent`, `customers` (+ export, tier), `gifts`, `perks`, `promotions`, `config`, `branding` (+ upload imagen), `reports/*`, `tiers`, `printers` (+ test).

Todas filtran por `req.tenantId` del JWT.

### Público / staff — `index.js`

| Método | Ruta | Notas |
|--------|------|-------|
| GET | `/` | Health |
| GET | `/api/wallet/status` | |
| POST | `/api/customers` | Registro + Wallet (`tenant_slug` **obligatorio**; rechaza si falta o tenant inactivo) |
| GET | `/api/customers/:id` | Perfil |
| GET | `/api/customers/:id/benefits` | Portal cliente |
| GET | `/api/customers/:id/progress` | Sellos/ciclo |
| GET | `/api/customers/:id/apple-pass` | Descarga `.pkpass` con logo/strip/colores del tenant |
| POST | `/api/checkin` | Visita + puntos + ciclo |
| POST | `/api/redemption` | Canje por puntos |
| POST | `/api/redemption/gift` | Canje cortesía pendiente |
| POST | `/api/print` | TCP directo (solo útil si API ve la LAN) |

### Print Bridge (`print-bridge/index.js`)

| Método | Ruta |
|--------|------|
| GET | `/` |
| POST | `/print` | `{ ip, port, data }` ESC/POS |

---

## 9. Modelo de datos (tablas reales)

Fuentes de schema: scripts en `backend/migrate.js`, `backend/run_migration.js`, `backend/migrations/001–004`, y uso en código. **No hay** `supabase/migrations/` SQL versionado.

| Tabla | Rol |
|-------|-----|
| `tenants` | Marcas: slug, name, branding, wallet_* (incl. strip/icon/fg/label) |
| `admin_users` | Usuarios plataforma/marca (`tenant_id` NULL = super) |
| `customers` | Clientes: puntos, visitas, `tier_id`, ciclo, `wallet_pass_id` |
| `loyalty_tiers` | Niveles por tenant (`points_per_visit`, `is_default`) |
| `loyalty_config` | 1 fila/tenant: puntos, ciclo, `max_checkins_per_day`, reward perk |
| `perks` | Premios canjeables |
| `checkins` | Visitas |
| `redemptions` | Canjes |
| `direct_gifts` | Cortesías (`points`\|`perk`); `redeemed_at` null = pendiente |
| `promotions` | CRUD admin; **no aplicadas en check-in actual** |
| `tier_change_history` | Auditoría cambio de nivel |
| `cycle_rewards` | Historial de ciclos completados |
| `printers` | Impresoras por tenant (código usa `printers`, no `tenant_printers`) |
| `admin_sessions` | Legacy; auth actual es JWT |

Relación central: `tenants` 1—N casi todo; `customers.tier_id` → `loyalty_tiers`; `loyalty_config.cycle_reward_perk_id` → `perks`.

---

## 10. Flujos de negocio

### Registro
1. Cliente abre `/register?tenant={slug}` (QR/link por marca desde Admin → Configuración)
2. Frontend exige `?tenant=`; backend exige `tenant_slug` (sin fallback a `panem`) y `is_active`
3. Valida email/teléfono; unicidad email **por tenant**
4. Asigna tier `is_default`
5. Crea Google Wallet JWT; responde `saveUrl` + `applePassUrl`

Admin genera el QR público en **Configuración** (`registerUrl = STAFF_PORTAL/register?tenant=slug`). Env: `VITE_STAFF_PORTAL_URL` (default producción staff).

### Check-in
1. Límite diario (`loyalty_config.max_checkins_per_day`, default 1)
2. Puntos = `loyalty_tiers.points_per_visit` del cliente
3. Inserta `checkins`; actualiza visitas/puntos
4. `cycle-engine.processCycleStep` (sellos); al completar → `cycle_rewards` (no crea `direct_gifts` automático)
5. Si description del tier contiene `"regalo"` → auto `direct_gifts`
6. Actualiza Google Wallet (async)

**No hay ascenso automático de tier por visitas** — solo cambio manual en admin.

### Redención
- Puntos: descuenta balance + `redemptions` + print
- Gift: marca `direct_gifts.redeemed_at` + print
- Admin gifts: `POST /api/admin/gifts` (points suman; perk queda pendiente)

### Impresión (dos capas)
1. **iPad / staff:** config local (`PrinterConfig` + `printer.js`) → Print Bridge HTTPS `:4001` → TCP impresora
2. **Admin BD:** CRUD `/api/admin/printers`; backend puede `printToAllPrinters` tras eventos (desde Vercel suele **no** alcanzar LAN → el camino operativo real es Print Bridge)

Servicio Windows: `print-bridge/install-service.js` / `uninstall-service.js`.

---

## 11. Archivos clave (backend)

| Archivo | Responsabilidad |
|---------|-----------------|
| `index.js` | App, endpoints core, supabase client |
| `api/index.js` | Entry Vercel |
| `auth-routes.js` / `auth-middleware.js` | Login JWT |
| `admin-routes.js` | Panel marca |
| `super-admin-routes.js` | Plataforma |
| `tier-engine.js` | Niveles y puntos |
| `cycle-engine.js` | Sellos / ciclos |
| `wallet.js` | Google Wallet |
| `apple-wallet.js` | Generación `.pkpass` con branding por tenant (logo, strip, colores) |
| `print-service.js` | ESC/POS multi-printer |

Certificados Apple esperados en `backend/certs/` (`signerCert.pem`, `signerKey.pem`, `wwdr.pem`, `icon.png`).

---

## 12. Variables de entorno

No hay `.env.example` en repo. Esperadas:

| Variable | Dónde |
|----------|--------|
| `SUPABASE_URL` | backend |
| `SUPABASE_SERVICE_ROLE_KEY` | backend |
| `JWT_SECRET` | backend (fallback inseguro si falta) |
| `PORT` | backend (default 3000) |
| `VERCEL` | set → no `listen` |
| `ALLOWED_ORIGINS` | CORS CSV |
| `GOOGLE_ISSUER_ID` / `GOOGLE_CLASS_ID` | Wallet |
| `GCP_SERVICE_ACCOUNT_JSON` o `gcp-service-account.json` | Wallet |
| `CLIENT_PORTAL_URL` | links en passes (default staff Vercel) |
| `APPLE_TEAM_ID` | Apple (default hardcodeado en código) |
| `PRINT_BRIDGE_PORT` | print-bridge (default 4001) |
| `VITE_API_URL` | frontend / admin |
| `VITE_STAFF_PORTAL_URL` | admin (link/QR de registro; default `https://loyalty-staff.vercel.app`) |

Credenciales de negocio y secrets: `backend/.env` (no commitear). Uso humano: ver Manual (sin duplicar passwords aquí).

---

## 13. Migraciones

| Script | Qué |
|--------|-----|
| `migrations/001_create_loyalty_tiers.js` | Tabla tiers + seed |
| `002_...` | Columnas ciclo/tier en customers |
| `003_...` | Config de ciclo en loyalty_config |
| `004_...` | `tier_change_history` + `cycle_rewards` + RLS |
| `005_apple_wallet_branding.js` | `wallet_strip_url`, `wallet_icon_url`, `wallet_fg_color`, `wallet_label_color` + bucket `tenant-branding` |

Runner: intentan RPC/`exec_sql`; si fallan imprimen SQL para Dashboard. `npm run migrate` solo ejecuta el `001`.

---

## 14. Tests

```
backend/tests/tier-engine.test.js
backend/tests/cycle-engine.test.js
backend/tests/wallet.test.js
backend/tests/apple-wallet.test.js
backend/tests/properties/setup.test.js
```

Comando: `cd backend && npm test`. Sin tests de integración HTTP.

---

## 15. Deuda conocida / gotchas (importante al tocar código)

1. Endpoints públicos de negocio sin JWT (`checkin`, `redemption`, `customers`) — aislamiento por `tenant_slug` / UUID.
2. `DEFAULT_TENANT_ID` cero en `tier-engine` / `cycle-engine` puede contaminar datos multi-tenant.
3. `GET .../progress` puede leer `loyalty_config` sin filtrar tenant.
4. `printToAllPrinters` no filtra por `tenant_id`.
5. Insert de redención por puntos a veces omite `tenant_id`.
6. Completar ciclo no genera `direct_gifts` canjeable; solo `cycle_rewards`.
7. CRUD de `promotions` existe; **check-in no las aplica**.
8. Apple Wallet: pass estático al descargar; **sin push/update** tras check-in. Un cambio de branding iOS exige volver a añadir la tarjeta.
9. TCP print desde Vercel a LAN suele fallar → usar Print Bridge.
10. Placeholder UI a veces dice puerto `3001`; el bridge real es **HTTPS 4001**.
11. Docs `02-modelo-datos` hablan de `tenant_users` + Supabase Auth — **implementado** es `admin_users` + JWT.
12. Certificados Apple / `.p12` / `.pkpass` en raíz del repo son sensibles; no versionar secrets nuevos.

---

## 16. Qué está implementado vs roadmap en `docs/`

| Tema | Estado real |
|------|-------------|
| Multi-tenant + Super Admin | **Hecho** (UI + API) |
| JWT auth + roles | **Hecho** |
| Tiers + ciclos | **Hecho** |
| Impresoras multi + Print Bridge | **Hecho** |
| Google + Apple Wallet (alta) | **Hecho** (Apple sin updates) |
| Branding visual por tenant | **Parcial**: Wallet iOS/Android sí (Admin → Configuración). CSS de apps y tickets aún no |
| Migración a Next.js | **No** (sigue Vite+Express) |
| Transferencia puntos entre clientes | **No** (solo doc `04-transfer-...`) |
| Promociones en check-in | **No** |
| Billing / Stripe | **No** |

---

## 17. Guía rápida para agentes / futuros cambios

1. Leer **este archivo** primero; no re-mapear todo el monorepo.
2. Operación humana → `MANUAL-DE-INSTALACION.md`.
3. Roadmap/histórico → docs `01`–`06` (verificar contra este as-built antes de implementar “planes”).
4. Cambios de schema → preferir scripts en `backend/migrations/` y documentar aquí.
5. Nuevos endpoints admin → `admin-routes.js` + página en `admin/src/pages` + nav en `Layout.jsx`.
6. Nuevos endpoints públicos/staff → `index.js` + consumo en `frontend`.
7. Plataforma (marcas/users) → `super-admin-routes.js` + páginas SuperAdmin*.
8. Al tocar multi-tenant: siempre filtrar `tenant_id`; no confiar en RLS con service role.
9. Al tocar impresión en local: Print Bridge `:4001`, no asumir TCP desde Vercel.

---

## 18. Inventario de docs

| Archivo | Usar para |
|---------|-----------|
| **`00-ESTADO-ACTUAL.md`** | Contexto técnico actual (este) |
| `MANUAL-DE-INSTALACION.md` | Instalación y uso operativo |
| `01-arquitectura-saas.md` | Plan Next.js (histórico) |
| `02-modelo-datos-multitenant.md` | Diseño schema antiguo (parcialmente obsoleto) |
| `02-multi-tenant-implementation.md` | Plan migración tenant_id |
| `03-plan-migracion.md` | Roadmap fases |
| `03-thermal-printing-multi-printer.md` | Diseño print (mucho ya implementado) |
| `04-apple-wallet-integracion.md` | Detalle PassKit |
| `04-transfer-points-gifts.md` | Feature no implementada |
| `05-deploy-produccion.md` | Plan deploy Next (no aplicado) |
| `05-pre-deploy-security-and-auth.md` | Checklist seguridad (parcialmente resuelto) |
| `06-branding-por-tenant.md` | Plan branding UI (no aplicado) |
| `06-platform-saas-consolidado.md` | Plan sprints (mezcla hecho/pendiente) |
