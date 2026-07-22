# Deploy a Producción — Guía Paso a Paso

## Prerequisitos

- Cuenta en Vercel (vercel.com)
- Dominio configurado (ej: `loyalty.panem.mx` o `loyalty.app`)
- Proyecto Supabase ya funcionando (angmhxtwcfbcpsozkuka)
- Node.js 18+

---

## Paso 1: Migrar a Next.js

### Crear proyecto Next.js

```bash
npx create-next-app@latest loyalty-saas --typescript --tailwind --app --src-dir
cd loyalty-saas
```

### Migrar componentes React existentes
- Copiar componentes de `frontend/src/components/` → `src/components/`
- Copiar páginas de `frontend/src/pages/` → `src/app/`
- Copiar estilos de `frontend/src/index.css` → `src/app/globals.css`
- Copiar `admin/src/` → `src/app/admin/`

### Migrar API Routes
Convertir cada endpoint de Express a Next.js API Route:

```typescript
// Antes (Express): backend/index.js
app.get('/api/customers/:id', async (req, res) => { ... })

// Después (Next.js): src/app/api/customers/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  const { data: customer, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', params.id)
    .single()
    
  if (error) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(customer)
}
```

---

## Paso 2: Configurar Vercel

### Instalar Vercel CLI
```bash
npm i -g vercel
```

### Login y deploy
```bash
vercel login
vercel --prod
```

### Variables de entorno en Vercel Dashboard
Ir a Project Settings → Environment Variables:

```
SUPABASE_URL=https://angmhxtwcfbcpsozkuka.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
GOOGLE_ISSUER_ID=3388000000023147315
GOOGLE_CLASS_ID=3388000000023147315.Loyalty_PANEM
GOOGLE_SERVICE_ACCOUNT={"type":"service_account",...}  # JSON completo
CLIENT_PORTAL_URL=https://loyalty.panem.mx
ADMIN_USER=admin
ADMIN_PASS=<contraseña-segura>
```

### Configurar dominio
1. En Vercel Dashboard → Domains
2. Agregar `loyalty.panem.mx`
3. Configurar DNS en tu registrador:
   - CNAME: `loyalty` → `cname.vercel-dns.com`

---

## Paso 3: Actualizar Google Wallet

Una vez en producción, actualizar la clase de Wallet:

```javascript
// Actualizar URLs en la clase
await client.request({
  url: `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass/${CLASS_ID}`,
  method: 'PATCH',
  data: {
    // Actualizar callback URL si usas callbacks
    callbackOptions: {
      url: 'https://loyalty.panem.mx/api/wallet/callback'
    }
  }
});
```

Actualizar `CLIENT_PORTAL_URL` para que los enlaces en los pases apunten al dominio real.

---

## Paso 4: Solicitar Publishing Access en Google Wallet

Para salir de Demo Mode y que cualquier usuario pueda guardar pases:

1. Ir a Google Pay & Wallet Console
2. Google Wallet API → Manage
3. Solicitar "Publishing Access"
4. Google revisará tu implementación (1-3 días hábiles)
5. Una vez aprobado, cualquier usuario puede guardar pases

### Requisitos para aprobación:
- Logo de alta calidad
- Nombre de programa claro
- Pase funcional con barcode
- Política de privacidad (URL)
- Términos de servicio (URL)

---

## Paso 5: Verificación Post-Deploy

### Checklist:
- [ ] Frontend carga correctamente en el dominio
- [ ] Login del admin funciona
- [ ] Registro de clientes genera pase de Wallet
- [ ] Enlace "Add to Google Wallet" funciona
- [ ] Scanner QR funciona desde tablet/iPad
- [ ] Check-in actualiza puntos en DB y Wallet
- [ ] Redención funciona y genera ticket
- [ ] Portal de beneficios accesible desde Wallet
- [ ] Reportes cargan datos correctamente
- [ ] HTTPS funciona (automático en Vercel)

---

## Estructura de archivos para deploy

```
loyalty-saas/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Staff scanner
│   │   ├── register/page.tsx     # Auto-registro
│   │   ├── benefits/[id]/page.tsx
│   │   ├── admin/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx          # Dashboard
│   │   │   ├── customers/page.tsx
│   │   │   ├── perks/page.tsx
│   │   │   ├── promotions/page.tsx
│   │   │   ├── reports/page.tsx
│   │   │   └── config/page.tsx
│   │   ├── api/
│   │   │   ├── customers/
│   │   │   │   ├── route.ts      # POST crear
│   │   │   │   └── [id]/
│   │   │   │       ├── route.ts  # GET perfil
│   │   │   │       └── benefits/route.ts
│   │   │   ├── checkin/route.ts
│   │   │   ├── redemption/
│   │   │   │   ├── route.ts
│   │   │   │   └── gift/route.ts
│   │   │   ├── admin/
│   │   │   │   ├── login/route.ts
│   │   │   │   ├── stats/route.ts
│   │   │   │   ├── customers/route.ts
│   │   │   │   ├── perks/route.ts
│   │   │   │   ├── promotions/route.ts
│   │   │   │   ├── config/route.ts
│   │   │   │   └── reports/[type]/route.ts
│   │   │   ├── wallet/
│   │   │   │   └── status/route.ts
│   │   │   └── print/route.ts
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── Scanner.tsx
│   │   ├── CustomerProfile.tsx
│   │   ├── PrinterConfig.tsx
│   │   └── admin/
│   │       └── Layout.tsx
│   ├── lib/
│   │   ├── supabase.ts
│   │   ├── wallet/
│   │   │   ├── google.ts
│   │   │   └── apple.ts
│   │   └── printer.ts
│   └── utils/
│       └── printer.ts
├── public/
│   ├── favicon.svg
│   └── icons.svg
├── next.config.js
├── package.json
├── tsconfig.json
└── vercel.json
```

---

## Notas sobre Vercel Serverless

- **Timeout:** 10s (Free), 60s (Pro), 300s (Enterprise)
- **Cold starts:** ~200-500ms (aceptable para esta app)
- **Límite de body:** 4.5MB (suficiente para nuestras APIs)
- **Conexiones DB:** Usar connection pooling de Supabase (ya incluido)
- **Impresión por red:** El endpoint `/api/print` que usa TCP sockets NO funciona en serverless. Alternativa: el iPad se conecta directamente a la impresora vía Web Serial o el backend de impresión corre como un micro-servicio separado (solo si se necesita impresión por IP).
