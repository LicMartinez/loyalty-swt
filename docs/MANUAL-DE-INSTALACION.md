# Manual de Instalación y Uso — SW Loyalty

## Índice

1. [¿Qué es SW Loyalty?](#qué-es-sw-loyalty)
2. [Portales del Sistema](#portales-del-sistema)
3. [Credenciales de Acceso](#credenciales-de-acceso)
4. [Guía del Panel de Administración](#guía-del-panel-de-administración)
5. [Guía del Portal Staff (iPad)](#guía-del-portal-staff-ipad)
6. [Guía del Portal de Beneficios (Cliente)](#guía-del-portal-de-beneficios-cliente)
7. [Registro de Nuevos Clientes](#registro-de-nuevos-clientes)
8. [Configuración de Impresoras](#configuración-de-impresoras)
9. [Instalación del Print Bridge](#instalación-del-print-bridge)
10. [Solución de Problemas](#solución-de-problemas)

---

## ¿Qué es SW Loyalty?

SW Loyalty es un sistema de lealtad digital que permite:
- Registrar visitas de clientes escaneando un código QR
- Acumular puntos según el nivel de fidelidad del cliente
- Canjear beneficios (bebidas, productos, cortesías)
- Visualizar progreso en Google Wallet
- Imprimir tickets de canje automáticamente

---

## Portales del Sistema

El sistema tiene 3 portales web. Todos funcionan desde cualquier navegador:

| Portal | URL | Para quién |
|--------|-----|-----------|
| Panel de Administración | https://loyalty-admin-jet.vercel.app | Gerente / Dueño del negocio |
| Portal Staff (iPad) | https://loyalty-staff.vercel.app | Baristas / Cajeros |
| Portal de Beneficios | https://loyalty-staff.vercel.app/benefits/{id} | Clientes (automático desde Google Wallet) |

---

## Credenciales de Acceso

### Panel de Administración

Para ingresar al panel de administración:

1. Abre el navegador y ve a: **https://loyalty-admin-jet.vercel.app**
2. Llena los campos:
   - **Negocio:** `panem`
   - **Usuario:** `admin`
   - **Contraseña:** `panem2024`
3. Click en **"Ingresar"**

### Portal Staff (iPad)

Para ingresar al portal del staff:

1. Abre Safari en el iPad y ve a: **https://loyalty-staff.vercel.app**
2. Llena los campos:
   - **Negocio:** `panem`
   - **Usuario:** `admin`
   - **Contraseña:** `panem2024`
3. Click en **"Ingresar"**

> Nota: El campo "Negocio" identifica a qué marca perteneces. Para PANEM siempre es `panem`.

---

## Guía del Panel de Administración

Desde el panel de administración puedes gestionar todo el programa de lealtad.

### Menú lateral (Sidebar)

| Sección | Qué hace |
|---------|----------|
| Dashboard | Resumen del día: visitas, canjes, puntos emitidos |
| Clientes | Lista de clientes, cambiar nivel, regalar puntos |
| Premios | Crear/editar beneficios canjeables con puntos |
| Promociones | Crear promociones especiales |
| Reportes | Ver estadísticas de visitas, canjes, niveles |
| Niveles | Configurar niveles de fidelidad (Bronce, Plata, Oro, Platino) |
| Impresoras | Configurar impresoras térmicas del local |
| Configuración | Puntos por visita, ciclo de visitas, nombre del programa |

### Crear un nuevo beneficio (Perk)

1. Ve a **Premios** en el sidebar
2. Click **"+ Nuevo"**
3. Llena: Nombre, Descripción, Costo en puntos
4. Activa o desactiva según necesites
5. Click **"Guardar"**

### Cambiar el nivel de un cliente

1. Ve a **Clientes** en el sidebar
2. Busca al cliente por nombre
3. Click en el ícono de **editar** (lápiz)
4. En el campo **"Nivel"** selecciona el nuevo nivel
5. El cambio se aplica inmediatamente

### Regalar puntos o cortesía a un cliente

1. Ve a **Clientes** en el sidebar
2. Busca al cliente
3. Click en el ícono de **regalo**
4. Selecciona tipo: Puntos o Beneficio
5. Si es puntos: ingresa la cantidad
6. Si es beneficio: selecciona cuál
7. Opcionalmente agrega una razón (ej: "Cumpleaños")
8. Click **"Enviar Regalo"**

---

## Guía del Portal Staff (iPad)

El portal staff es la herramienta que usa el personal del local para:
- Registrar visitas (check-in)
- Canjear beneficios
- Imprimir tickets

### Flujo de trabajo diario

#### 1. Registrar una visita (Check-in)

1. El cliente muestra su Google Wallet (el código QR)
2. En el iPad, apunta la cámara al QR del cliente
3. Aparece el perfil del cliente con su nombre, puntos y nivel
4. Click en **"Registrar Visita"** (botón verde grande)
5. Listo — los puntos se acumulan automáticamente

#### 2. Canjear un beneficio con puntos

1. Escanea el QR del cliente
2. En la sección **"Canjear con Puntos"** verás los beneficios disponibles
3. Solo aparecen los que el cliente tiene suficientes puntos para canjear
4. Click en **"Canjear"** junto al beneficio deseado
5. Confirma la acción
6. El ticket se imprime automáticamente
7. Los puntos se descuentan del saldo del cliente

#### 3. Redimir una cortesía (regalo directo)

1. Escanea el QR del cliente
2. Si tiene cortesías pendientes, aparecen en la sección verde **"Cortesías Disponibles"**
3. Click en **"Redimir"**
4. El ticket se imprime automáticamente
5. La cortesía se marca como usada

#### 4. Volver al escáner

Después de atender a un cliente, click en **"Volver al Escáner"** para estar listo para el siguiente.

### Configurar impresora desde el iPad

1. Click en el ícono de **engranaje** (⚙️) arriba a la derecha
2. Selecciona método **"Red (IP)"**
3. En **"Print Bridge"** pon: `https://192.168.0.248:4001` (la IP del equipo del local)
4. Click **"+ Agregar"** para agregar una impresora
5. Pon la IP de la impresora (ej: `192.168.0.10`) y puerto `9100`
6. Puedes agregar más impresoras repitiendo el paso 4-5
7. Click **"Guardar"**
8. Usa el botón 🖨 junto a cada impresora para hacer una prueba

> **IMPORTANTE:** La primera vez que configures el Print Bridge, debes abrir
> `https://192.168.0.248:4001/` directamente en Safari del iPad y aceptar
> el certificado de seguridad. Solo se hace una vez.

---

## Guía del Portal de Beneficios (Cliente)

Los clientes acceden a su portal de beneficios desde el link de su Google Wallet.
No necesitan contraseña — se accede automáticamente por su código único.

**URL ejemplo:** `https://loyalty-staff.vercel.app/benefits/526f145c-0e02-4065-99e1-8450f78611c5`

Lo que ve el cliente:
- Su nombre
- Visitas totales y puntos acumulados
- Cortesías disponibles para redimir
- Beneficios que ya puede canjear con sus puntos

El cliente **no puede canjear desde este portal** — debe presentar su QR en el establecimiento.

---

## Registro de Nuevos Clientes

### Opción 1: El staff registra al cliente (recomendado)

1. En el iPad, abre: **https://loyalty-staff.vercel.app/register**
2. Llena los datos del cliente:
   - **Nombre completo** (obligatorio)
   - **Correo electrónico** (obligatorio)
   - **Teléfono** (opcional)
   - **Fecha de nacimiento** (opcional, para cortesías de cumpleaños)
3. Click **"Registrarme"**
4. Aparece un botón/link de **"Agregar a Google Wallet"**
5. El cliente toca el botón desde su teléfono para guardar el pase
6. Listo — el cliente ya tiene su programa de lealtad

### Opción 2: Auto-registro con QR impreso

1. Imprime un QR que apunte a: `https://loyalty-staff.vercel.app/register`
2. Coloca el QR en el mostrador o en un letrero visible
3. El cliente escanea el QR con su teléfono
4. Llena sus datos y se registra solo
5. Guarda el pase en su Google Wallet

### Después del registro

- El cliente queda asignado al nivel **Bronce** (3 puntos por visita)
- Su ciclo de visitas inicia en 0
- La próxima vez que venga, el staff escanea su QR del Wallet para registrar la visita

---

## Configuración de Impresoras

El sistema imprime tickets automáticamente al canjear un beneficio.
Se necesita configurar la impresora una sola vez.

### Requisitos

- Impresora térmica de 80mm (ESC/POS) conectada a la red WiFi del local
- La impresora debe tener una IP fija (configurada en la impresora)
- Puerto de impresión: generalmente **9100** (default para ESC/POS)

### Desde el Panel de Administración

1. Ve a **Impresoras** en el sidebar
2. Click **"+ Agregar Impresora"**
3. Llena:
   - **Nombre:** ej. "Impresora Barra"
   - **IP:** la dirección IP de la impresora (ej: 192.168.0.10)
   - **Puerto:** 9100 (dejarlo así a menos que sea diferente)
4. Selecciona cuándo debe imprimir:
   - ☑ Canje de beneficio
   - ☑ Recompensa por ciclo completado
   - ☐ Check-in (normalmente no se necesita)
5. Click **"Crear"**
6. Click en **▶ (play)** para enviar un ticket de prueba

### Desde el iPad (Staff Portal)

Ver la sección de [configurar impresora desde el iPad](#configurar-impresora-desde-el-ipad) arriba.

---

## Instalación del Print Bridge

El **Print Bridge** es un pequeño programa que corre en una computadora del local.
Su función es recibir la orden de impresión del iPad y enviarla a la impresora térmica.

### ¿Por qué se necesita?

Los iPads no pueden hablar directamente con impresoras por red.
El Print Bridge actúa como intermediario:

```
iPad → Print Bridge (PC del local) → Impresora Térmica
```

### Requisitos previos

1. Una **PC con Windows** que esté siempre encendida en el local
2. **Node.js** instalado en esa PC (descargar de: https://nodejs.org)
3. La PC y las impresoras deben estar en la **misma red WiFi/LAN**

### Paso 1: Verificar que Node.js está instalado

1. Abre el menú Inicio de Windows
2. Busca **"cmd"** y ábrelo
3. Escribe: `node --version`
4. Debe mostrar algo como: `v24.12.0`
5. Si dice "no se reconoce", descarga Node.js de https://nodejs.org

### Paso 2: Abrir la carpeta del Print Bridge

1. Abre el **Explorador de Archivos** de Windows
2. Navega a: `C:\desarrollo\loyalty\print-bridge`
3. Verifica que existen estos archivos:
   - `index.js`
   - `install-service.js`
   - `uninstall-service.js`
   - `package.json`

### Paso 3: Instalar dependencias (solo la primera vez)

1. Abre **cmd** (menú Inicio → buscar "cmd")
2. Escribe estos comandos uno por uno:

```
cd C:\desarrollo\loyalty\print-bridge
npm install
```

3. Espera a que termine (puede tardar 1-2 minutos)
4. Debe decir "added X packages"

### Paso 4: Probar que funciona (temporal)

1. En el mismo cmd, escribe:

```
set PRINT_BRIDGE_PORT=4001
node index.js
```

2. Debe mostrar:
```
🖨  Print Bridge HTTPS en puerto 4001
   iPad: https://192.168.0.248:4001/
```

3. Desde el iPad, abre Safari y ve a `https://192.168.0.248:4001/`
   (reemplaza con la IP que muestra tu Print Bridge)
4. Acepta el certificado de seguridad
5. Debe mostrar: `{"status":"Print Bridge OK","port":4001}`
6. Si funciona, cierra el cmd (Ctrl+C) y continúa al paso 5

### Paso 5: Instalar como servicio de Windows (permanente)

Esto hace que el Print Bridge se inicie automáticamente con Windows,
sin ventana visible y sin que nadie lo pueda cerrar accidentalmente.

1. Abre **cmd como Administrador**:
   - Click derecho en el menú Inicio de Windows
   - Selecciona **"Terminal (Administrador)"** o **"Símbolo del sistema (Admin)"**
   - Si pide confirmación, click **"Sí"**

2. Escribe estos comandos:

```
cd C:\desarrollo\loyalty\print-bridge
node install-service.js
```

3. Debe mostrar:
```
✅ Servicio "PrintBridge" instalado e iniciado.
```

4. ¡Listo! El Print Bridge ya está corriendo como servicio.

### Paso 6: Verificar que el servicio funciona

1. Presiona **Win + R** en el teclado
2. Escribe: `services.msc` y presiona Enter
3. En la lista, busca **"PrintBridge"**
4. Debe decir:
   - Estado: **Running** (En ejecución)
   - Tipo de inicio: **Automático**

### Paso 7: Abrir el puerto en el Firewall (si no se hizo antes)

1. Abre **cmd como Administrador** (igual que el paso 5.1)
2. Escribe:

```
netsh advfirewall firewall add rule name="Print Bridge" dir=in action=allow protocol=TCP localport=4001
```

3. Debe decir "Aceptar" o "Ok"

### Paso 8: Aceptar certificado en el iPad (una sola vez)

1. En Safari del iPad, abre: `https://[IP-DEL-EQUIPO]:4001/`
   (ej: `https://192.168.0.248:4001/`)
2. Safari mostrará una advertencia de seguridad
3. Toca **"Mostrar detalles"** → **"Visitar este sitio web"** → **"Continuar"**
4. Debe mostrar: `{"status":"Print Bridge OK","port":4001}`
5. Esto solo se hace una vez. Después las impresiones funcionarán sin preguntar.

---

## Solución de Problemas

### "Error en check-in" desde el iPad

**Causa posible:** El límite de check-ins por día está activo.
**Solución:** En el Panel Admin → Configuración, verifica que "Máximo check-ins por día" esté en 0 (sin límite) o el valor deseado.

### "Error de conexión" al hacer login

**Causa posible:** El backend no está desplegado o Vercel tuvo un error.
**Solución:** Espera 30 segundos e intenta de nuevo. Si persiste, verifica la URL del API en la configuración.

### La impresora no imprime

**Verificar:**
1. ¿El Print Bridge está corriendo? → Abre `services.msc` y busca "PrintBridge"
2. ¿La impresora está encendida y en la misma red?
3. ¿La IP de la impresora es correcta? → Intenta hacer ping desde cmd: `ping 192.168.0.10`
4. ¿El iPad aceptó el certificado? → Abre `https://[IP]:4001/` en Safari y acepta

### "Todas las impresoras de red fallaron"

**Causa:** El iPad no puede comunicarse con el Print Bridge.
**Verificar:**
1. ¿El equipo con el Print Bridge está encendido?
2. ¿Están en la misma red WiFi?
3. ¿El firewall permite el puerto 4001?
4. ¿La URL del Print Bridge en la config del iPad es correcta? (debe ser `https://` no `http://`)

### El pase de Google Wallet dice "Solo para pruebas"

**Causa:** La Loyalty Class está en modo de revisión.
**Solución temporal:** Agregar el email del cliente como "tester" en la Google Pay Console.
**Solución definitiva:** Solicitar aprobación de la Loyalty Class en Google Pay Console.

### "Cliente no encontrado" al escanear

**Causa:** El QR del cliente no corresponde a un cliente registrado.
**Solución:** Registrar al cliente primero en `/register`.

### El servicio PrintBridge no aparece en services.msc

**Solución:** Reinstalar el servicio:
1. Abrir cmd como Administrador
2. Ejecutar:
```
cd C:\desarrollo\loyalty\print-bridge
node uninstall-service.js
node install-service.js
```

### Cambiar la IP del Print Bridge

Si la PC del local cambió de IP:
1. En el iPad → Configurar Impresora → Cambiar la URL del Print Bridge a la nueva IP
2. Recomendación: Configurar una **IP fija** en la PC para que no cambie

### Cómo configurar IP fija en la PC

1. Panel de Control → Red e Internet → Centro de redes
2. Click en tu conexión (WiFi o Ethernet)
3. Propiedades → Protocolo TCP/IPv4 → Propiedades
4. Selecciona "Usar la siguiente dirección IP"
5. IP: 192.168.0.248 (o la que estés usando)
6. Máscara: 255.255.255.0
7. Puerta de enlace: 192.168.0.1 (la IP de tu router)
8. DNS: 8.8.8.8 y 8.8.4.4
9. Aceptar

---

## Resumen de URLs importantes

| Qué | URL |
|-----|-----|
| Admin Panel | https://loyalty-admin-jet.vercel.app |
| Staff Portal (iPad) | https://loyalty-staff.vercel.app |
| Registro de clientes | https://loyalty-staff.vercel.app/register |
| API Backend | https://loyalty-api-rho.vercel.app |
| Print Bridge (local) | https://192.168.0.248:4001 |

---

## Resumen de comandos del Print Bridge

| Qué | Comando (cmd como Admin) |
|-----|--------------------------|
| Instalar servicio | `cd C:\desarrollo\loyalty\print-bridge` luego `node install-service.js` |
| Desinstalar servicio | `cd C:\desarrollo\loyalty\print-bridge` luego `node uninstall-service.js` |
| Reiniciar servicio | `net stop PrintBridge & net start PrintBridge` |
| Ver estado | `sc query PrintBridge` |
| Abrir puerto firewall | `netsh advfirewall firewall add rule name="Print Bridge" dir=in action=allow protocol=TCP localport=4001` |

---

## Diagrama del sistema

```
┌─────────────────────────────────┐
│  CLIENTE                        │
│  Google Wallet (QR)             │
│  Portal Beneficios (web)        │
└──────────────┬──────────────────┘
               │ muestra QR
               ▼
┌─────────────────────────────────┐
│  iPAD (Staff Portal)            │
│  loyalty-staff.vercel.app       │
│  - Escanear QR                  │
│  - Registrar visita             │
│  - Canjear beneficio            │
│  - Imprimir ticket              │
└──────────┬──────────────────────┘
           │                    │
           │ API calls          │ Impresión
           ▼                    ▼
┌──────────────────┐  ┌─────────────────────┐
│  VERCEL (nube)   │  │  PC LOCAL           │
│  Backend API     │  │  Print Bridge       │
│  Panel Admin     │  │  (servicio Windows) │
└────────┬─────────┘  └──────────┬──────────┘
         │                       │
         ▼                       ▼
┌──────────────────┐  ┌─────────────────────┐
│  SUPABASE (nube) │  │  IMPRESORA TÉRMICA  │
│  Base de datos   │  │  192.168.0.10:9100  │
└──────────────────┘  └─────────────────────┘
```
