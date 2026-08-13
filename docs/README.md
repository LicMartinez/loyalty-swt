# SW Loyalty — Documentación

## Empieza aquí

| Prioridad | Documento | Para qué |
|-----------|-----------|----------|
| **1** | **[00 — Estado actual (As-Built)](./00-ESTADO-ACTUAL.md)** | Fuente de verdad técnica. Stack, apps, API, BD, flujos, gotchas. **Léelo antes de explorar el código.** |
| **2** | [Manual de instalación y uso](./MANUAL-DE-INSTALACION.md) | Portales en producción, Print Bridge, guías de uso |

---

## Estado del sistema (resumen)

Plataforma **multi-tenant operativa**:
- Backend Express en Vercel + Supabase
- Frontend Vite (staff / registro / beneficios)
- Admin Vite (marca + Super Admin)
- Google Wallet + Apple Wallet
- Tiers, ciclos/sellos, impresión térmica vía Print Bridge

> El resto de documentos `01`–`06` son **planes / histórico**. Muchos asumen Next.js, single-tenant o features no implementadas. Contrastar siempre con `00-ESTADO-ACTUAL.md`.

---

## Arquitectura actual (runtime)

```
frontend :5173 (staff, register, benefits)
admin    :5174 (tenant admin + super_admin)
    │ proxy /api
    ▼
backend Express :3000 / Vercel
    │ service role
    ▼
Supabase PostgreSQL

iPad ──HTTPS──► Print Bridge :4001 ──TCP──► Impresora :9100
```

---

## Comandos de desarrollo

```bash
cd backend && npm run dev      # :3000
cd frontend && npm run dev     # :5173
cd admin && npm run dev        # :5174
cd print-bridge && node index.js  # :4001
```

---

## Documentación histórica / roadmap

| Documento | Nota |
|-----------|------|
| [01 - Arquitectura SaaS](./01-arquitectura-saas.md) | Plan Next.js — **no es el stack actual** |
| [02 - Modelo de datos](./02-modelo-datos-multitenant.md) | Diseño; usa `tenant_users`/Auth Supabase (implementado: `admin_users` + JWT) |
| [02 - Multi-tenant implementation](./02-multi-tenant-implementation.md) | Plan de migración |
| [03 - Plan de migración](./03-plan-migracion.md) | Roadmap fases |
| [03 - Thermal printing](./03-thermal-printing-multi-printer.md) | Diseño; multi-impresora ya existe en código |
| [04 - Apple Wallet](./04-apple-wallet-integracion.md) | Referencia PassKit (parcialmente vigente) |
| [04 - Transfer points](./04-transfer-points-gifts.md) | **No implementado** |
| [05 - Deploy producción](./05-deploy-produccion.md) | Plan Next — no aplicado |
| [05 - Pre-deploy security](./05-pre-deploy-security-and-auth.md) | Checklist; auth JWT ya existe |
| [06 - Branding por tenant](./06-branding-por-tenant.md) | **UI no implementada** |
| [06 - Platform SaaS consolidado](./06-platform-saas-consolidado.md) | Sprints; mezcla hecho/pendiente |

---

## Credenciales y secretos

Ver `backend/.env` y el [Manual](./MANUAL-DE-INSTALACION.md). No documentar passwords en commits nuevos.

Para agentes de Cursor: la regla del proyecto apunta a `docs/00-ESTADO-ACTUAL.md` como contexto obligatorio.
