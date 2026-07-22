# Integración Apple Wallet (PassKit)

## Requisitos Previos

1. **Apple Developer Program** ($99 USD/año)
   - Registrarse en https://developer.apple.com/programs/
   - Proceso de verificación: 24-48 horas

2. **Certificados necesarios:**
   - Pass Type ID (identificador único del tipo de pase)
   - Pass Signing Certificate (.p12)
   - Apple WWDR Intermediate Certificate

---

## Configuración en Apple Developer Portal

### 1. Crear Pass Type ID
1. Ir a Certificates, Identifiers & Profiles
2. Identifiers → Pass Type IDs → Register
3. Description: "SW Loyalty Pass"
4. Identifier: `pass.com.swtools.loyalty` (o tu dominio invertido)

### 2. Generar Certificado de Firma
1. Certificates → Create Certificate
2. Tipo: "Pass Type ID Certificate"
3. Seleccionar el Pass Type ID creado
4. Generar CSR desde Keychain Access (Mac) o OpenSSL
5. Descargar el certificado .cer
6. Exportar como .p12 (con contraseña)

### 3. Descargar WWDR Certificate
- Descargar desde: https://www.apple.com/certificateauthority/
- Archivo: AppleWWDRCAG4.cer

---

## Implementación Técnica

### Dependencias
```bash
npm install passkit-generator
# o
npm install @walletpass/pass-js
```

### Estructura del módulo `apple-wallet.ts`

```typescript
import { PKPass } from 'passkit-generator';
import path from 'path';

interface ApplePassConfig {
  teamIdentifier: string;
  passTypeIdentifier: string;
  certificate: Buffer;
  certificatePassword: string;
  wwdr: Buffer;
}

interface PassData {
  customerId: string;
  customerName: string;
  visits: number;
  points: number;
  tenantName: string;
  tenantLogo: Buffer;
}

export async function createApplePass(config: ApplePassConfig, data: PassData) {
  const pass = new PKPass({
    // Modelo del pase
    model: {
      formatVersion: 1,
      passTypeIdentifier: config.passTypeIdentifier,
      teamIdentifier: config.teamIdentifier,
      serialNumber: data.customerId,
      organizationName: data.tenantName,
      description: `${data.tenantName} Loyalty Card`,
      
      // Colores
      backgroundColor: 'rgb(15, 23, 42)',
      foregroundColor: 'rgb(248, 250, 252)',
      labelColor: 'rgb(148, 163, 184)',
      
      // Tipo: Store Card (tarjeta de lealtad)
      storeCard: {
        headerFields: [
          {
            key: 'points',
            label: 'PUNTOS',
            value: data.points
          }
        ],
        primaryFields: [
          {
            key: 'name',
            label: 'CLIENTE',
            value: data.customerName
          }
        ],
        secondaryFields: [
          {
            key: 'visits',
            label: 'VISITAS',
            value: data.visits
          }
        ],
        backFields: [
          {
            key: 'terms',
            label: 'Términos',
            value: 'Programa de lealtad. Puntos no canjeables por dinero.'
          }
        ]
      },
      
      // Barcode (QR con el UUID del cliente)
      barcodes: [
        {
          format: 'PKBarcodeFormatQR',
          message: data.customerId,
          messageEncoding: 'iso-8859-1',
          altText: data.customerId
        }
      ],
      
      // Ubicaciones para notificaciones
      locations: [
        {
          latitude: 19.42686,
          longitude: -99.17677,
          relevantText: '¡Estás cerca! Muestra tu pase para acumular puntos'
        }
      ],
      
      // URL para actualizaciones push
      webServiceURL: 'https://loyalty.app/api/apple-wallet',
      authenticationToken: data.customerId
    }
  }, {
    wwdr: config.wwdr,
    signerCert: config.certificate,
    signerKey: config.certificate,
    signerKeyPassphrase: config.certificatePassword
  });

  // Agregar imágenes
  pass.addBuffer('icon.png', data.tenantLogo);
  pass.addBuffer('icon@2x.png', data.tenantLogo);
  pass.addBuffer('logo.png', data.tenantLogo);

  return pass.getAsBuffer();
}
```

### Endpoint para descargar pase Apple

```typescript
// app/api/wallet/apple/[customerId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createApplePass } from '@/lib/wallet/apple';

export async function GET(
  request: NextRequest,
  { params }: { params: { customerId: string } }
) {
  const passBuffer = await createApplePass(config, passData);
  
  return new NextResponse(passBuffer, {
    headers: {
      'Content-Type': 'application/vnd.apple.pkpass',
      'Content-Disposition': `attachment; filename=loyalty.pkpass`
    }
  });
}
```

### Endpoints para Push Updates (requeridos por Apple)

```typescript
// POST /api/apple-wallet/v1/devices/:deviceId/registrations/:passTypeId/:serialNumber
// Registrar dispositivo para push updates

// DELETE /api/apple-wallet/v1/devices/:deviceId/registrations/:passTypeId/:serialNumber  
// Desregistrar dispositivo

// GET /api/apple-wallet/v1/devices/:deviceId/registrations/:passTypeId
// Listar pases registrados en un dispositivo

// GET /api/apple-wallet/v1/passes/:passTypeId/:serialNumber
// Obtener última versión del pase (Apple lo consulta cuando envías push)
```

---

## Detección de Dispositivo en el Frontend

```typescript
function getWalletType(): 'google' | 'apple' | 'none' {
  const ua = navigator.userAgent;
  
  if (/iPad|iPhone|iPod/.test(ua) || 
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    return 'apple';
  }
  
  if (/Android/.test(ua)) {
    return 'google';
  }
  
  return 'none';
}
```

En la página de registro, mostrar el botón correspondiente:
- Android → "Agregar a Google Wallet" (enlace JWT)
- iOS → "Agregar a Apple Wallet" (descarga .pkpass)

---

## Tabla de registro de dispositivos Apple

```sql
CREATE TABLE apple_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id TEXT NOT NULL,
    push_token TEXT NOT NULL,
    customer_id UUID REFERENCES customers(id),
    tenant_id UUID REFERENCES tenants(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(device_id, customer_id)
);
```

---

## Flujo de Actualización de Pases Apple

```
1. Cliente hace check-in
2. Backend actualiza puntos/visitas en DB
3. Backend envía push notification a Apple (APN)
4. Apple notifica al dispositivo del cliente
5. Dispositivo consulta GET /passes/:type/:serial
6. Backend genera nuevo .pkpass con datos actualizados
7. Wallet del cliente se actualiza automáticamente
```

---

## Diferencias clave vs Google Wallet

| Aspecto | Google Wallet | Apple Wallet |
|---------|--------------|--------------|
| Formato | JSON vía API/JWT | Archivo .pkpass (ZIP firmado) |
| Creación | API REST o JWT | Generar archivo localmente |
| Actualización | PATCH vía API | Push notification + re-descarga |
| Certificado | Service Account GCP | Apple Developer Certificate |
| Costo | Gratis | $99 USD/año (Developer Program) |
| Notificaciones | Mensajes en clase | Push via APN |
| Geolocalización | Locations en clase | Locations en pass.json |
