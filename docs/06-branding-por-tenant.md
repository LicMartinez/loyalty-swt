# Sistema de Branding por Tenant

## Objetivo

Cada tenant (negocio) debe tener su propia identidad visual sin compartir elementos con otros tenants. El cliente final nunca debe saber que está usando una plataforma compartida.

---

## Elementos Personalizables por Tenant

| Elemento | Almacenamiento | Uso |
|----------|---------------|-----|
| Logo principal | Supabase Storage | Header, Wallet pass, tickets |
| Logo secundario (ícono) | Supabase Storage | Favicon, app icon |
| Color primario | Campo en `tenants` | Botones, links, acentos |
| Color de fondo | Campo en `tenants` | Background de la app |
| Color de acento | Campo en `tenants` | Badges, highlights |
| Fuente | Campo en `tenants` | Toda la tipografía |
| Nombre del programa | Campo en `tenants` | Headers, Wallet, tickets |
| Nombre del negocio | Campo en `tenants` | Wallet issuer name |
| Mensaje de bienvenida | Campo en `tenants` | Página de registro |
| Términos y condiciones | Supabase Storage (MD) | Footer, Wallet back |

---

## Implementación con CSS Variables

```typescript
// src/lib/tenant.ts
export interface TenantBranding {
  slug: string;
  name: string;
  programName: string;
  logoUrl: string;
  primaryColor: string;
  bgColor: string;
  accentColor: string;
  fontFamily: string;
}

export function applyBranding(branding: TenantBranding) {
  const root = document.documentElement;
  root.style.setProperty('--primary', branding.primaryColor);
  root.style.setProperty('--bg-color', branding.bgColor);
  root.style.setProperty('--success', branding.accentColor);
  root.style.setProperty('--font-family', branding.fontFamily);
}
```

```typescript
// src/app/(tenant)/layout.tsx
import { getTenantBySlug } from '@/lib/tenant'

export default async function TenantLayout({ children }) {
  const tenant = await getTenantBySlug(/* from middleware */)
  
  return (
    <html style={{
      '--primary': tenant.primaryColor,
      '--bg-color': tenant.bgColor,
      '--success': tenant.accentColor,
    } as React.CSSProperties}>
      <body style={{ fontFamily: tenant.fontFamily }}>
        {children}
      </body>
    </html>
  )
}
```

---

## Branding en Google Wallet

Cada tenant tiene su propia Loyalty Class con:
- `programLogo` → Logo del tenant
- `programName` → Nombre del programa
- `issuerName` → Nombre del negocio
- `hexBackgroundColor` → Color de fondo del pase

```typescript
async function createTenantWalletClass(tenant: Tenant) {
  const classData = {
    id: `${tenant.google_issuer_id}.${tenant.slug}_loyalty`,
    issuerName: tenant.name,
    programName: tenant.program_name,
    programLogo: {
      sourceUri: { uri: tenant.logo_url }
    },
    hexBackgroundColor: tenant.bg_color,
    countryCode: 'MX',
    // ...
  };
  
  await googleWalletClient.request({
    url: 'https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass',
    method: 'POST',
    data: classData
  });
}
```

---

## Branding en Apple Wallet

El `.pkpass` incluye imágenes del tenant:
- `icon.png` / `icon@2x.png` — Logo pequeño
- `logo.png` / `logo@2x.png` — Logo en el pase
- `strip.png` — Imagen de fondo (banner)
- Colores en `pass.json`: `backgroundColor`, `foregroundColor`, `labelColor`

---

## Branding en Tickets Térmicos

El ticket de impresión usa el nombre del tenant en lugar de "PANEM" hardcodeado:

```typescript
function generateTicketHTML(ticketData, tenant: TenantBranding) {
  return `
    <div class="header">${tenant.name}</div>
    ...
  `;
}
```

---

## Wizard de Configuración (Onboarding)

Pasos del wizard para nuevo tenant:

1. **Datos básicos:** Nombre del negocio, slug (subdominio)
2. **Branding:** Upload logo, selección de colores (color picker)
3. **Programa:** Nombre del programa, puntos por visita
4. **Ubicación:** Dirección, coordenadas (mapa interactivo)
5. **Wallet:** Se crea automáticamente la clase de Google Wallet
6. **Confirmación:** Preview del pase y la app con su branding

---

## Supabase Storage — Estructura

```
storage/
├── tenants/
│   ├── panem/
│   │   ├── logo.png
│   │   ├── icon.png
│   │   └── strip.png
│   ├── barx/
│   │   ├── logo.png
│   │   ├── icon.png
│   │   └── strip.png
│   └── ...
```

Políticas de Storage:
- Lectura pública (los logos se muestran en la app)
- Escritura solo para admins del tenant
