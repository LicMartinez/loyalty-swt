# SW Loyalty — Documentación del Proyecto

## Estado Actual: MVP Single-Tenant (PANEM)

El sistema está funcionando como programa de lealtad para un solo negocio (PANEM) con las siguientes capacidades:
- Registro de clientes con pase de Google Wallet
- Scanner QR desde iPad/tablet para check-in
- Acumulación de puntos por visita
- Redención de beneficios (con puntos o cortesías directas)
- Panel de administración completo
- Impresión de tickets térmicos
- Portal de beneficios para el cliente (accesible desde Wallet)
- Marketing por proximidad (geolocalización en Wallet)

---

## Documentación de Migración a SaaS

| Documento | Contenido |
|-----------|-----------|
| [01 - Arquitectura SaaS](./01-arquitectura-saas.md) | Stack tecnológico, estrategia multi-tenant, estructura del proyecto |
| [02 - Modelo de Datos](./02-modelo-datos-multitenant.md) | Schema SQL, RLS policies, migración de datos existentes |
| [03 - Plan de Migración](./03-plan-migracion.md) | Fases de implementación, timeline, costos operativos |
| [04 - Apple Wallet](./04-apple-wallet-integracion.md) | Integración PassKit, certificados, push updates |
| [05 - Deploy Producción](./05-deploy-produccion.md) | Guía paso a paso para Vercel, Next.js, configuración |
| [06 - Branding por Tenant](./06-branding-por-tenant.md) | Personalización visual, CSS variables, Wallet branding |

---

## Arquitectura Actual (MVP)

```
┌─────────────────────────────────────────────────────┐
│  Frontend (Vite + React) — Puerto 5173              │
│  • / — Staff scanner                               │
│  • /register — Auto-registro clientes              │
│  • /benefits/:id — Portal de beneficios            │
└─────────────────────────────────────────────────────┘
         │ (proxy /api → backend)
┌─────────────────────────────────────────────────────┐
│  Backend (Express.js) — Puerto 3000                 │
│  • /api/customers — CRUD clientes + Wallet         │
│  • /api/checkin — Registro de visitas              │
│  • /api/redemption — Canje de beneficios           │
│  • /api/admin/* — Panel de administración          │
│  • /api/print — Bridge impresión por red           │
└─────────────────────────────────────────────────────┘
         │
┌─────────────────────────────────────────────────────┐
│  Admin Panel (Vite + React) — Puerto 5174           │
│  • Dashboard, Clientes, Premios, Promociones       │
│  • Reportes, Configuración, Regalos directos       │
└─────────────────────────────────────────────────────┘
         │
┌─────────────────────────────────────────────────────┐
│  Supabase (angmhxtwcfbcpsozkuka)                   │
│  • customers, perks, checkins, redemptions         │
│  • promotions, direct_gifts, loyalty_config        │
└─────────────────────────────────────────────────────┘
         │
┌─────────────────────────────────────────────────────┐
│  Google Wallet API                                  │
│  • Issuer: 3388000000023147315                     │
│  • Class: Loyalty_PANEM                            │
│  • Barcode QR con UUID del cliente                 │
└─────────────────────────────────────────────────────┘
```

---

## Credenciales y Accesos

| Servicio | Ubicación |
|----------|-----------|
| Supabase | `backend/.env` (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) |
| Google Wallet | `backend/.env` (GOOGLE_ISSUER_ID, GOOGLE_CLASS_ID) |
| GCP Service Account | `backend/gcp-service-account.json` |
| Admin Panel | `backend/.env` (ADMIN_USER, ADMIN_PASS) |

---

## Comandos de Desarrollo

```bash
# Backend
cd backend && npm run dev

# Frontend (Staff + Registro + Beneficios)
cd frontend && npm run dev

# Admin Panel
cd admin && npm run dev
```

---

## Decisión: ¿Por qué Vercel + Supabase es suficiente?

No se necesita Railway, Render, ni ningún servidor adicional porque:

1. **Next.js API Routes** reemplazan Express.js como funciones serverless
2. **Supabase** maneja DB, Auth, Storage y Realtime en una sola plataforma
3. **Vercel** escala automáticamente sin gestionar servidores
4. **No hay procesos de larga duración** — todas las operaciones son request/response
5. **La impresión térmica** se maneja desde el navegador (Web Serial) o vía red local (no necesita servidor central)

El único caso donde se necesitaría un servidor persistente es si se implementaran:
- Cron jobs de más de 60 segundos (Vercel Cron cubre hasta 60s)
- WebSockets custom (Supabase Realtime ya lo cubre)
- Procesamiento de video/imágenes pesado (no aplica)
