# Transferencia de Puntos y Regalos entre Clientes

## Contexto

Los clientes quieren poder compartir sus puntos y/o regalos pendientes (shots, cortesías) con otros clientes del programa, sin depender del establecimiento ni del staff. La operación debe poder realizarse en cualquier momento y lugar.

## Método: QR-to-QR

El cliente que quiere transferir escanea el QR del destinatario desde su propio portal de beneficios. No se expone un directorio de usuarios. Solo se transfiere a quien tenga su QR presente.

---

## Flujo del Usuario

### Transferir Puntos

```
Usuario A (emisor):
  1. Abre su portal de beneficios (link en Google Wallet)
  2. Toca botón "Transferir"
  3. Selecciona "Puntos"
  4. Ingresa cantidad (ej: 150)
  5. Se activa la cámara → escanea QR del Usuario B
  6. Ve confirmación: "Transferir 150 puntos a Juan Pérez"
  7. Confirma

Resultado:
  - Usuario A: -150 puntos
  - Usuario B: +150 puntos
  - Se registra la transferencia en tabla `transfers`
  - Wallet de ambos se actualiza
```

### Transferir Regalo (Shot/Cortesía)

```
Usuario A (emisor):
  1. Abre su portal de beneficios
  2. Toca botón "Transferir"
  3. Selecciona "Regalo"
  4. Elige cuál regalo transferir (de su lista de pendientes)
  5. Escanea QR del Usuario B
  6. Ve confirmación: "Transferir 1x Redoxon a Juan Pérez"
  7. Confirma

Resultado:
  - El direct_gift cambia de customer_id (A → B)
  - O se crea un nuevo direct_gift para B y se marca el de A como "transferred"
  - Wallet de ambos se actualiza
```

---

## Seguridad y Autenticación

### ¿Cómo se autentica el emisor?

El portal de beneficios se accede vía UUID en la URL (enlace guardado en Google Wallet). Solo quien tiene el pase en su teléfono puede abrir su portal. Esto es suficiente como autenticación básica:
- El UUID no es adivinable (formato UUID v4)
- Solo el dueño del teléfono tiene acceso al Wallet

### ¿Cómo se identifica al receptor?

Escaneando su QR del Wallet. El QR contiene el `customerId` (UUID). No se expone ningún directorio de usuarios.

### Protección adicional (opcional):

- **Rate limiting:** Máximo N transferencias por día desde un mismo UUID
- **Código de confirmación:** El receptor muestra un código temporal de 4 dígitos en su pantalla que el emisor debe ingresar (previene transferencias con QR fotografiado)
- **Monto mínimo de retención:** No se pueden transferir TODOS los puntos — debe quedar un saldo mínimo

---

## Base de Datos

### Tabla `transfers`

```sql
CREATE TABLE transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  from_customer_id UUID NOT NULL REFERENCES customers(id),
  to_customer_id UUID NOT NULL REFERENCES customers(id),
  type VARCHAR(20) NOT NULL CHECK (type IN ('points', 'gift')),
  
  -- Para type='points'
  points_amount INTEGER DEFAULT 0 CHECK (points_amount >= 0),
  
  -- Para type='gift'
  gift_id UUID REFERENCES direct_gifts(id),
  
  -- Metadata
  status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('completed', 'reversed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  
  -- Restricción: no transferir a sí mismo
  CHECK (from_customer_id != to_customer_id)
);

CREATE INDEX idx_transfers_from ON transfers(tenant_id, from_customer_id);
CREATE INDEX idx_transfers_to ON transfers(tenant_id, to_customer_id);
CREATE INDEX idx_transfers_date ON transfers(tenant_id, created_at);
```

### Tabla `transfer_config` (o columnas en `loyalty_config`)

```sql
ALTER TABLE loyalty_config ADD COLUMN transfers_enabled BOOLEAN DEFAULT false;
ALTER TABLE loyalty_config ADD COLUMN transfer_min_points INTEGER DEFAULT 10;
ALTER TABLE loyalty_config ADD COLUMN transfer_max_points INTEGER DEFAULT 500;
ALTER TABLE loyalty_config ADD COLUMN transfer_max_daily INTEGER DEFAULT 3;
ALTER TABLE loyalty_config ADD COLUMN transfer_gifts_enabled BOOLEAN DEFAULT false;
ALTER TABLE loyalty_config ADD COLUMN transfer_commission_pct INTEGER DEFAULT 0; -- 0-20%
```

---

## Configuración Admin (Panel Administrativo)

### Sección "Transferencias" en Config.jsx

| Campo | Tipo | Descripción |
|-------|------|-------------|
| Transferencias habilitadas | Toggle | Activa/desactiva todo el módulo |
| Permitir transferir regalos | Toggle | Si se pueden mover shots/cortesías |
| Mínimo de puntos por transferencia | Número | Mínimo para transferir (ej: 10) |
| Máximo de puntos por transferencia | Número | Máximo por operación (ej: 500) |
| Máximo transferencias por día | Número | Límite diario por cliente (ej: 3) |
| Comisión (%) | Número | % que se "pierde" en la transferencia (0 = sin comisión) |

### Reporte de Transferencias

En la sección de Reportes del admin panel:
- Lista de transferencias con: fecha, emisor, receptor, tipo, cantidad
- Filtro por rango de fechas
- Totales: puntos transferidos, regalos transferidos

---

## Endpoints Backend

```
POST /api/customers/:id/transfer/points
  Body: { toCustomerId: "uuid", amount: 150 }
  
  Validaciones:
  - transfers_enabled = true
  - amount >= transfer_min_points
  - amount <= transfer_max_points
  - from_customer.points_balance >= amount
  - Transferencias hoy < transfer_max_daily
  - from != to
  
  Acción:
  - from_customer.points_balance -= amount (+ comisión si aplica)
  - to_customer.points_balance += amount
  - INSERT INTO transfers
  - Actualizar wallets de ambos

POST /api/customers/:id/transfer/gift
  Body: { toCustomerId: "uuid", giftId: "uuid" }
  
  Validaciones:
  - transfer_gifts_enabled = true
  - El gift pertenece al from_customer
  - El gift no está redimido
  - Transferencias hoy < transfer_max_daily
  
  Acción:
  - UPDATE direct_gifts SET customer_id = toCustomerId
  - INSERT INTO transfers
  - Actualizar wallets de ambos

GET /api/customers/:id/transfers
  Retorna: historial de transferencias del cliente (enviadas y recibidas)
```

---

## Frontend: Portal de Beneficios del Cliente

### Nueva sección: "Transferir"

```
┌─────────────────────────────────────┐
│  Juan Pérez                         │
│  Puntos: 450  |  Regalos: 3        │
│                                     │
│  [📸 Transferir Puntos]             │
│  [🎁 Transferir Regalo]             │
│                                     │
│  ─── Historial ───                  │
│  → Enviaste 50 pts a María (ayer)   │
│  ← Recibiste 1 shot de Pedro (lun) │
└─────────────────────────────────────┘
```

Al tocar "Transferir Puntos":
1. Input de cantidad (con validación min/max)
2. Se abre el scanner de QR
3. Confirmación con nombre del destinatario
4. Resultado: éxito o error

---

## Comisión (opcional)

Si el admin configura comisión del 10%:
- Usuario A transfiere 100 puntos
- Usuario A pierde 100 puntos
- Usuario B recibe 90 puntos
- 10 puntos se "queman" (no van a ningún lado)

Esto incentiva que los puntos se canjeen en el negocio en vez de solo transferirlos.

---

## Casos Borde

| Caso | Comportamiento |
|------|----------------|
| Transferir a sí mismo | Rechazado (CHECK constraint) |
| Saldo insuficiente | Error: "Puntos insuficientes" |
| Límite diario alcanzado | Error: "Alcanzaste el límite de transferencias por hoy" |
| Regalo ya redimido | Error: "Este regalo ya fue canjeado" |
| Transferencias deshabilitadas | Error: "Las transferencias no están disponibles" |
| Destinatario no existe | Error: "Cliente no encontrado" |
| Destinatario de otro tenant | Error: "Cliente no encontrado" (no se revela que es de otra marca) |

---

## Orden de Implementación

1. Agregar columnas de config a `loyalty_config`
2. Crear tabla `transfers`
3. Crear endpoints de transferencia en backend
4. Agregar configuración al admin panel
5. Agregar sección "Transferir" al portal de beneficios del cliente
6. Agregar scanner QR al portal de beneficios
7. Agregar historial de transferencias
8. Agregar reporte de transferencias al admin
9. Actualizar wallets de ambos participantes
10. Tests E2E

**Tiempo estimado:** 10-15 horas de desarrollo.

---

## Dependencias

- **Multi-tenant:** La transferencia debe validar que ambos clientes pertenecen al mismo tenant. No se permiten transferencias cross-tenant.
- **Portal de beneficios del cliente:** Ya existe en `/api/customers/:id/benefits`. Se extiende con la sección de transferencias y un scanner QR embebido (la librería `html5-qrcode` ya se usa en el staff portal).
- **Google Wallet:** Ambos wallets se actualizan después de la transferencia (fire-and-forget).
