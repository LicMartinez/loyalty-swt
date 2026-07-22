# Plan de Migración — De MVP a SaaS

## Fases de Implementación

---

## Fase 1: Deploy a Producción (Single-Tenant PANEM)
**Duración estimada: 1-2 días**
**Objetivo:** Tener PANEM funcionando en producción con dominio real.

### Tareas:
1. [ ] Crear proyecto en Vercel
2. [ ] Configurar dominio (loyalty.panem.mx o similar)
3. [ ] Migrar backend Express a Next.js API Routes
4. [ ] Configurar variables de entorno en Vercel
5. [ ] Actualizar `CLIENT_PORTAL_URL` al dominio real
6. [ ] Actualizar Google Wallet Class con URL de producción
7. [ ] Configurar HTTPS (automático en Vercel)
8. [ ] Prueba end-to-end en producción
9. [ ] Agregar Google Wallet test accounts necesarios

### Estructura mínima Next.js para Fase 1:
```
app/
├── page.tsx                    # Staff scanner (actual frontend)
├── register/page.tsx           # Auto-registro
├── benefits/[id]/page.tsx      # Portal beneficios
├── admin/                      # Admin panel (actual admin)
│   ├── page.tsx
│   └── ...
└── api/
    ├── customers/route.ts
    ├── checkin/route.ts
    ├── redemption/route.ts
    ├── admin/[...path]/route.ts
    ├── wallet/route.ts
    └── print/route.ts
```

---

## Fase 2: Preparar Multi-Tenancy
**Duración estimada: 1-2 semanas**
**Objetivo:** Infraestructura lista para múltiples clientes.

### Tareas:
1. [ ] Crear tabla `tenants` y `tenant_users`
2. [ ] Agregar `tenant_id` a todas las tablas existentes
3. [ ] Migrar datos de PANEM al nuevo schema
4. [ ] Implementar middleware de resolución de tenant por subdominio
5. [ ] Configurar wildcard domain en Vercel (`*.loyalty.app`)
6. [ ] Implementar carga dinámica de branding (logo, colores)
7. [ ] Crear RLS policies
8. [ ] Migrar auth a Supabase Auth
9. [ ] Implementar Supabase Storage para assets por tenant
10. [ ] Tests de aislamiento de datos

### Configuración Vercel para subdominios:
```json
// vercel.json
{
  "rewrites": [
    { "source": "/:path*", "destination": "/:path*" }
  ]
}
```

```typescript
// middleware.ts
import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || ''
  const subdomain = hostname.split('.')[0]
  
  // Ignorar subdominios del sistema
  if (['www', 'app', 'api'].includes(subdomain)) {
    return NextResponse.next()
  }
  
  // Inyectar tenant slug en headers para las API routes
  const response = NextResponse.next()
  response.headers.set('x-tenant-slug', subdomain)
  return response
}
```

---

## Fase 3: Onboarding y Super-Admin
**Duración estimada: 1-2 semanas**
**Objetivo:** Poder dar de alta nuevos clientes sin intervención técnica.

### Tareas:
1. [ ] Panel super-admin (`app.loyalty.app`)
2. [ ] Wizard de onboarding para nuevos tenants
3. [ ] Upload de logo y configuración de colores
4. [ ] Provisioning automático de Google Wallet Class por tenant
5. [ ] Generación automática de credenciales
6. [ ] Dashboard de métricas cross-tenant (para ti como operador)
7. [ ] Sistema de invitaciones para admins de cada tenant

### Flujo de Onboarding:
```
1. Nuevo cliente se registra en app.loyalty.app
2. Elige plan y paga (Stripe Checkout)
3. Wizard: nombre, logo, colores, ubicación
4. Sistema crea:
   - Registro en tabla tenants
   - Subdominio (slug.loyalty.app)
   - Google Wallet Class
   - Perks por defecto
   - Usuario admin
5. Cliente accede a slug.loyalty.app/admin
```

---

## Fase 4: Apple Wallet
**Duración estimada: 3-5 días (una vez tengas el certificado)**
**Objetivo:** Soporte para usuarios iPhone.

### Tareas:
1. [ ] Obtener Apple Developer License ($99 USD/año)
2. [ ] Generar Pass Type ID y certificado en Apple Developer Portal
3. [ ] Implementar módulo `apple-wallet.ts` (generación de .pkpass)
4. [ ] Endpoint para descargar pase Apple
5. [ ] Detección de dispositivo (Android → Google, iOS → Apple)
6. [ ] Endpoint de actualización de pases (Apple Push Notifications)
7. [ ] Registro de dispositivos para push updates

### Estructura del .pkpass:
```
pass.pkpass (ZIP)
├── pass.json          # Estructura del pase
├── icon.png           # Logo del tenant
├── icon@2x.png
├── logo.png
├── strip.png          # Imagen de fondo
├── manifest.json      # Hashes de todos los archivos
└── signature           # Firma con certificado Apple
```

---

## Fase 5: Funcionalidades Avanzadas
**Duración estimada: Ongoing**

### Tareas:
1. [ ] Notificaciones push (cumpleaños, promociones)
2. [ ] Emails automatizados (Resend)
3. [ ] Analytics avanzados por tenant
4. [ ] API pública para integraciones de terceros
5. [ ] Webhooks para eventos (check-in, redención)
6. [ ] App móvil nativa (React Native) — opcional
7. [ ] Integración con POS existentes (API)
8. [ ] Programa de referidos entre clientes
9. [ ] Gamificación (niveles, badges)
10. [ ] White-label completo (dominio propio del cliente)

---

## Timeline Estimado

```
Semana 1-2:   Fase 1 (Deploy producción PANEM)
Semana 3-4:   Fase 2 (Multi-tenancy)
Semana 5-6:   Fase 3 (Onboarding + Super-admin)
Semana 7-8:   Fase 4 (Apple Wallet)
Semana 9+:    Fase 5 (Features avanzados)
```

---

## Costos Operativos Estimados

| Servicio | Plan | Costo mensual |
|----------|------|---------------|
| Vercel | Pro | $20 USD |
| Supabase | Pro | $25 USD |
| Dominio (.app) | — | ~$15 USD/año |
| Resend | Starter | $0 (hasta 3k emails) |
| Apple Developer | — | $99 USD/año |
| **Total** | | **~$50 USD/mes** |

Con 5 clientes en plan básico ($499 MXN c/u) = $2,495 MXN/mes de ingreso vs ~$1,000 MXN de costo. Margen positivo desde el primer mes con pocos clientes.
