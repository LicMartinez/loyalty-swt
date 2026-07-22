# Impresión Térmica Multi-Impresora — SW Loyalty

## Contexto

Para cerrar el MVP y lanzar a producción, el sistema necesita poder enviar tickets de canje a **una o más impresoras térmicas** de forma automática al momento de redimir un beneficio o completar un ciclo.

**Estado actual:**
- El backend tiene un endpoint `POST /api/print` que envía datos raw TCP a una IP/puerto específico
- El staff portal tiene configuración de impresora (Web Serial API o window.print)
- No hay soporte para múltiples impresoras simultáneas

**Objetivo:** Poder configurar 1, 2 o N impresoras por tenant y enviar el ticket a todas al momento del canje.

---

## Casos de Uso

### Caso 1: Una sola impresora (actual)
El barista escanea el QR, registra el canje, el ticket se imprime en la impresora de la barra.

### Caso 2: Dos impresoras
El cajero registra el canje, el ticket se imprime en:
- **Impresora 1 (caja):** Comprobante para el cliente
- **Impresora 2 (cocina/barra):** Orden para preparar el beneficio

### Caso 3: N impresoras
Restaurante grande con varias estaciones. El ticket se envía a todas las impresoras configuradas para esa ubicación.

---

## Diseño Propuesto

### Tabla `tenant_printers`

```sql
CREATE TABLE tenant_printers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(100) NOT NULL,             -- "Impresora Barra", "Impresora Cocina"
  ip_address VARCHAR(45) NOT NULL,         -- "192.168.0.100"
  port INTEGER DEFAULT 9100,               -- Puerto TCP (default ESC/POS)
  is_active BOOLEAN DEFAULT true,
  print_on_checkin BOOLEAN DEFAULT false,  -- ¿Imprimir en cada check-in?
  print_on_redemption BOOLEAN DEFAULT true, -- ¿Imprimir en cada canje?
  print_on_cycle_reward BOOLEAN DEFAULT true, -- ¿Imprimir al completar ciclo?
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Ejemplo: PANEM tiene 2 impresoras
INSERT INTO tenant_printers (tenant_id, name, ip_address, port, print_on_redemption, print_on_cycle_reward)
VALUES 
  ('uuid-panem', 'Impresora Barra', '192.168.0.100', 9100, true, true),
  ('uuid-panem', 'Impresora Caja', '192.168.0.101', 9100, true, false);
```

### Endpoint de impresión múltiple

```javascript
// POST /api/:tenant/print-ticket
// Envía el ticket a TODAS las impresoras activas del tenant según el evento

async function printToAllPrinters(supabase, tenantId, ticketData, event) {
    // event: 'checkin' | 'redemption' | 'cycle_reward'
    
    const filterColumn = {
        'checkin': 'print_on_checkin',
        'redemption': 'print_on_redemption',
        'cycle_reward': 'print_on_cycle_reward'
    }[event];
    
    const { data: printers } = await supabase
        .from('tenant_printers')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .eq(filterColumn, true);
    
    if (!printers || printers.length === 0) {
        console.log(`[print] No printers configured for tenant ${tenantId} on ${event}`);
        return { printed: 0, errors: [] };
    }
    
    const results = await Promise.allSettled(
        printers.map(printer => sendToPrinter(printer.ip_address, printer.port, ticketData))
    );
    
    const errors = results
        .filter(r => r.status === 'rejected')
        .map((r, i) => ({ printer: printers[i].name, error: r.reason.message }));
    
    return {
        printed: results.filter(r => r.status === 'fulfilled').length,
        total: printers.length,
        errors
    };
}
```

### Integración con el flujo de canje

```javascript
// En POST /api/redemption - después del canje exitoso:
const ticketData = generateTicketESCPOS({
    customerName: customer.name,
    perkName: perk.name,
    perkDescription: perk.description,
    redeemedAt: new Date(),
    programName: tenant.wallet_program_name,
    type: 'redemption'
});

// Fire-and-forget: no bloquea la respuesta al staff
printToAllPrinters(supabase, req.tenantId, ticketData, 'redemption')
    .then(result => {
        if (result.errors.length > 0) {
            console.warn('[print] Some printers failed:', result.errors);
        }
    })
    .catch(err => console.error('[print] Print failed:', err.message));
```

### Generación del ticket ESC/POS

```javascript
function generateTicketESCPOS({ customerName, perkName, perkDescription, redeemedAt, programName, type }) {
    const ESC = '\x1B';
    const GS = '\x1D';
    
    let ticket = '';
    
    // Inicializar impresora
    ticket += ESC + '@';
    
    // Título centrado
    ticket += ESC + 'a' + '\x01'; // center
    ticket += ESC + '!' + '\x30'; // double height+width
    ticket += programName + '\n';
    ticket += ESC + '!' + '\x00'; // normal
    ticket += '\n';
    
    // Línea separadora
    ticket += '================================\n';
    
    // Tipo de ticket
    if (type === 'redemption') {
        ticket += ESC + '!' + '\x10'; // double height
        ticket += '   CANJE DE BENEFICIO\n';
    } else if (type === 'cycle_reward') {
        ticket += ESC + '!' + '\x10';
        ticket += '  RECOMPENSA POR CICLO\n';
    }
    ticket += ESC + '!' + '\x00';
    ticket += '================================\n\n';
    
    // Datos
    ticket += ESC + 'a' + '\x00'; // left align
    ticket += `Cliente: ${customerName}\n`;
    ticket += `Beneficio: ${perkName}\n`;
    if (perkDescription) ticket += `Detalle: ${perkDescription}\n`;
    ticket += `Fecha: ${redeemedAt.toLocaleDateString('es-MX')}\n`;
    ticket += `Hora: ${redeemedAt.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}\n`;
    
    // Separador final
    ticket += '\n================================\n';
    ticket += ESC + 'a' + '\x01'; // center
    ticket += 'Gracias por tu preferencia\n';
    ticket += '\n\n\n';
    
    // Cortar papel
    ticket += GS + 'V' + '\x00'; // full cut
    
    return ticket;
}
```

---

## Métodos de Impresión Soportados

### 1. TCP/IP (Red local) — Recomendado para producción
- Impresora conectada a la red WiFi/Ethernet del negocio
- Se envía por socket TCP al puerto 9100 (estándar ESC/POS)
- El backend hace la conexión directamente

### 2. Web Serial API (USB) — Fallback para laptops
- Impresora conectada por USB al dispositivo del staff
- El FRONTEND maneja la conexión (no el backend)
- Solo funciona en Chrome/Edge

### 3. Híbrido: Backend imprime + Frontend como respaldo
- El backend intenta imprimir por TCP a las impresoras configuradas
- Si no hay impresoras configuradas o todas fallan, el frontend muestra un modal con el ticket formateado para window.print()

---

## Admin Panel — Configuración de Impresoras

### Nueva página: `PrinterConfig.jsx`

```
Configuración de Impresoras
┌─────────────────────────────────────────────────────┐
│ Nombre           │ IP             │ Puerto │ Estado  │
├──────────────────┼────────────────┼────────┼─────────┤
│ Impresora Barra  │ 192.168.0.100  │ 9100   │ ● Activa│
│ Impresora Caja   │ 192.168.0.101  │ 9100   │ ● Activa│
└──────────────────┴────────────────┴────────┴─────────┘
                                        [+ Agregar Impresora]

Para cada impresora:
  ☑ Imprimir en check-in
  ☑ Imprimir en canje de beneficio
  ☑ Imprimir al completar ciclo de visitas
  
  [🖨 Test de Impresión]  [Guardar]  [Eliminar]
```

### Endpoints admin

```
GET    /api/:tenant/admin/printers         — Listar impresoras del tenant
POST   /api/:tenant/admin/printers         — Agregar impresora
PUT    /api/:tenant/admin/printers/:id     — Actualizar configuración
DELETE /api/:tenant/admin/printers/:id     — Eliminar impresora
POST   /api/:tenant/admin/printers/:id/test — Test de conexión (envía ticket de prueba)
```

---

## Flujo Completo: Canje con Impresión

```
Staff (iPad) → Canjea beneficio → POST /api/panem/redemption
                                       │
                                       ▼
                              ┌─ Backend ────────────┐
                              │ 1. Validar canje     │
                              │ 2. Actualizar BD     │
                              │ 3. Generar ticket    │
                              │ 4. Enviar a impr. 1  │──→ 🖨 Barra
                              │ 5. Enviar a impr. 2  │──→ 🖨 Caja
                              │ 6. Responder al staff│
                              └──────────────────────┘
                                       │
                                       ▼
                              Staff ve: "Canje exitoso ✓"
                              (ticket ya se imprimió automáticamente)
```

---

## Orden de Implementación

1. Crear tabla `tenant_printers` (después de multi-tenant)
2. Crear CRUD de impresoras en admin-routes
3. Implementar `generateTicketESCPOS()` con templates por tipo de evento
4. Implementar `printToAllPrinters()` con envío paralelo
5. Integrar en endpoints de canje y ciclo completado
6. Crear página `PrinterConfig.jsx` en el admin panel
7. Agregar endpoint de test de impresión
8. Test E2E con impresora real

---

## Consideraciones de Red

- Las impresoras deben estar en la **misma red local** que el servidor backend
- Si el backend está en Vercel (serverless), NO puede acceder a impresoras locales por TCP
- **Solución para producción en Vercel:** El frontend (staff portal) hace la impresión vía Web Serial o se usa un micro-servicio local (print bridge) que corre en la red del negocio

### Print Bridge (para deploy en Vercel)

```
Vercel (Backend) → Webhook → Print Bridge (PC local del negocio) → Impresora
```

El Print Bridge es un mini servidor Node.js que corre en un PC del negocio, escucha webhooks del backend y reenvía a las impresoras locales.

Alternativa más simple: el frontend (staff portal) se encarga de la impresión — ya tiene acceso a la red local porque corre en el navegador del iPad/PC del negocio.

---

## Para el MVP inmediato

Si el backend corre en la misma red que las impresoras (deploy local o VPS con VPN):
- Usa TCP directo desde el backend ✓

Si el backend está en Vercel:
- El staff portal (frontend) maneja la impresión
- Después del canje exitoso, el frontend recibe los datos del ticket y los envía a las impresoras configuradas usando `fetch` a la IP local de la impresora (requiere CORS permisivo o Web Serial)
