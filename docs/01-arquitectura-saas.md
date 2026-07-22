# Arquitectura SaaS — SW Loyalty

## Visión General

Transformar el MVP actual (single-tenant para PANEM) en una plataforma SaaS multi-tenant donde múltiples negocios (bares, restaurantes, cafeterías) puedan tener su propio programa de lealtad con marca, diseño y datos completamente independientes.

---

## Stack Tecnológico Definitivo

| Componente | Tecnología | Justificación |
|------------|-----------|---------------|
| Frontend + Backend | **Next.js 14+ (App Router)** | Unifica frontend y API en un solo proyecto. SSR para SEO, subdominios dinámicos, deploy nativo en Vercel |
| Base de datos | **Supabase (PostgreSQL)** | RLS nativo para multi-tenancy, realtime, auth, storage. Ya lo usamos |
| Deploy | **Vercel** | Frontend + API Routes (serverless). Soporta wildcard subdomains |
| Auth | **Supabase Auth** | Manejo de usuarios por organización/tenant |
| Storage | **Supabase Storage** | Logos, assets de cada tenant en buckets separados |
| Emails | **Resend** | Notificaciones de cumpleaños, bienvenida, promociones |
| Pagos | **Stripe** | Suscripciones mensuales por tenant |
| Wallet iOS | **PassKit (Node.js)** | Generación de .pkpass con certificado Apple |
| Wallet Android | **Google Wallet API** | Ya implementado |
| Impresión | **ESC/POS vía Web Serial + Red** | Ya implementado |

### ¿Por qué NO se necesita Railway/Render?

**Respuesta corta: No lo necesitas.** Con Next.js + Vercel + Supabase cubres todo:

- **Next.js API Routes** reemplazan tu Express.js actual. Son funciones serverless que escalan automáticamente.
- **Vercel** ejecuta tanto el frontend como las API Routes sin necesidad de un servidor separado.
- **Supabase** maneja la base de datos, auth, storage y realtime.

**¿Cuándo SÍ necesitarías Railway/Render?**
- Si tuvieras procesos de larga duración (workers, cron jobs de más de 60s)
- Si necesitaras WebSockets persistentes (Supabase Realtime ya lo cubre)
- Si tu backend tuviera estado en memoria (el nuestro no lo tiene)
- Si excedieras los límites de Vercel (10s timeout en plan free, 60s en Pro)

Para este proyecto, **Vercel + Supabase es suficiente** incluso con cientos de tenants.

---

## Modelo Multi-Tenancy

### Estrategia: Row-Level Security con `tenant_id`

Cada tabla tiene una columna `tenant_id` y Supabase aplica RLS automáticamente para que cada tenant solo vea sus propios datos.

```
┌─────────────────────────────────────────┐
│         Supabase (una instancia)        │
│                                         │
│  ┌─────────┐  ┌─────────┐  ┌────────┐  │
│  │ Tenant A│  │ Tenant B│  │Tenant C│  │
│  │ (PANEM) │  │ (Bar X) │  │(Café Y)│  │
│  └─────────┘  └─────────┘  └────────┘  │
│                                         │
│  Mismas tablas, filtradas por RLS       │
│  Cada tenant solo ve sus propios datos  │
└─────────────────────────────────────────┘
```

### Identificación del Tenant

El tenant se identifica por **subdominio**:
- `panem.loyalty.app` → tenant_id de PANEM
- `barx.loyalty.app` → tenant_id de Bar X
- `app.loyalty.app` → Super-admin panel

El middleware de Next.js extrae el subdominio y lo inyecta en el contexto de la request.

---

## Estructura del Proyecto (Next.js)

```
loyalty-saas/
├── app/
│   ├── (tenant)/              # Rutas por tenant (subdominio)
│   │   ├── layout.tsx         # Carga branding del tenant
│   │   ├── page.tsx           # Staff scanner
│   │   ├── register/page.tsx  # Auto-registro clientes
│   │   ├── benefits/[id]/page.tsx
│   │   └── admin/
│   │       ├── page.tsx       # Dashboard
│   │       ├── customers/
│   │       ├── perks/
│   │       ├── promotions/
│   │       ├── reports/
│   │       └── config/
│   ├── (platform)/            # Super-admin (gestión de tenants)
│   │   ├── tenants/
│   │   ├── billing/
│   │   └── onboarding/
│   └── api/
│       ├── customers/
│       ├── checkin/
│       ├── redemption/
│       ├── admin/
│       ├── wallet/
│       └── print/
├── lib/
│   ├── supabase.ts            # Cliente Supabase con tenant context
│   ├── wallet/
│   │   ├── google.ts          # Google Wallet
│   │   └── apple.ts           # Apple Wallet (PassKit)
│   ├── printer.ts
│   └── tenant.ts              # Resolución de tenant por subdominio
├── middleware.ts               # Extrae tenant del subdominio
├── supabase/
│   └── migrations/            # Migraciones SQL
└── vercel.json
```

---

## Flujo de Resolución de Tenant

```
Request: https://panem.loyalty.app/admin
         │
         ▼
┌─ middleware.ts ─────────────────────┐
│ 1. Extrae subdominio: "panem"       │
│ 2. Busca en tabla tenants           │
│ 3. Inyecta tenant_id en headers     │
│ 4. Si no existe → 404              │
└─────────────────────────────────────┘
         │
         ▼
┌─ API Route / Page ──────────────────┐
│ Lee tenant_id del header            │
│ Todas las queries usan tenant_id    │
│ Carga branding (logo, colores)      │
└─────────────────────────────────────┘
```
