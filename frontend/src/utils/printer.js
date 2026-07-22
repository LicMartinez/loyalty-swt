/**
 * Módulo de impresión térmica POS
 * Soporta:
 * - Impresión vía navegador (window.print) - compatible con cualquier impresora
 * - Web Serial API (conexión USB directa) - para impresoras ESC/POS
 * - Impresión vía IP (red) - para impresoras de red
 */

// Configuración guardada en localStorage
const PRINTER_CONFIG_KEY = 'printer_config';

export function getPrinterConfig() {
    const saved = localStorage.getItem(PRINTER_CONFIG_KEY);
    return saved ? JSON.parse(saved) : {
        method: 'browser', // 'browser' | 'serial' | 'network'
        networkIp: '',
        networkPort: 9100,
        paperWidth: 80 // mm
    };
}

export function savePrinterConfig(config) {
    localStorage.setItem(PRINTER_CONFIG_KEY, JSON.stringify(config));
}

/**
 * Genera el HTML del ticket para impresión
 */
function generateTicketHTML(ticketData) {
    const { customerName, perkName, perkDescription, redeemedAt } = ticketData;
    const date = new Date(redeemedAt);
    const dateStr = date.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

    return `
<!DOCTYPE html>
<html>
<head>
<style>
    @page { margin: 0; size: 80mm auto; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
        font-family: 'Courier New', monospace;
        width: 80mm;
        padding: 8mm 4mm;
        text-align: center;
    }
    .header {
        font-size: 28pt;
        font-weight: bold;
        font-family: 'Georgia', serif;
        margin-bottom: 4mm;
        letter-spacing: 2px;
    }
    .datetime {
        font-size: 10pt;
        text-align: left;
        margin-bottom: 6mm;
        line-height: 1.6;
    }
    .label {
        font-size: 12pt;
        font-weight: bold;
        margin-bottom: 3mm;
        letter-spacing: 1px;
    }
    .product {
        font-size: 22pt;
        font-weight: bold;
        font-family: 'Georgia', serif;
        margin-bottom: 6mm;
        line-height: 1.2;
        text-transform: uppercase;
    }
    .customer {
        font-size: 14pt;
        font-weight: bold;
        margin-bottom: 8mm;
        letter-spacing: 0.5px;
    }
    .disclaimer {
        font-size: 8pt;
        line-height: 1.4;
        border-top: 1px dashed #000;
        padding-top: 4mm;
        margin-top: 4mm;
        text-align: justify;
    }
    .separator {
        border-top: 1px dashed #000;
        margin: 4mm 0;
    }
</style>
</head>
<body>
    <div class="header">PANEM</div>
    <div class="separator"></div>
    <div class="datetime">
        Fecha: ${dateStr}<br>
        Hora: ${timeStr}
    </div>
    <div class="label">TICKET VALE POR:</div>
    <div class="product">${perkName || perkDescription || 'CORTESÍA'}</div>
    <div class="customer">${customerName}</div>
    <div class="disclaimer">
        "Ticket valido para la redención del producto descrito en la leyenda, 
        no canjeable en ninguna otra fecha diferente a la impresa en el ticket"
    </div>
</body>
</html>`;
}

/**
 * Genera comandos ESC/POS para impresoras térmicas
 */
function generateESCPOS(ticketData) {
    const { customerName, perkName, perkDescription, redeemedAt } = ticketData;
    const date = new Date(redeemedAt);
    const dateStr = date.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

    const ESC = '\x1B';
    const GS = '\x1D';
    const commands = [
        ESC + '@',                    // Initialize
        ESC + 'a' + '\x01',          // Center align
        GS + '!' + '\x11',           // Double height + width
        'PANEM\n',
        GS + '!' + '\x00',           // Normal size
        ESC + 'a' + '\x00',          // Left align
        '--------------------------------\n',
        `Fecha: ${dateStr}\n`,
        `Hora: ${timeStr}\n`,
        '--------------------------------\n',
        ESC + 'a' + '\x01',          // Center
        ESC + 'E' + '\x01',          // Bold on
        'TICKET VALE POR:\n\n',
        GS + '!' + '\x11',           // Double size
        `${(perkName || perkDescription || 'CORTESIA').toUpperCase()}\n\n`,
        GS + '!' + '\x00',           // Normal
        ESC + 'E' + '\x01',          // Bold
        `${customerName}\n`,
        ESC + 'E' + '\x00',          // Bold off
        '\n',
        '--------------------------------\n',
        ESC + 'a' + '\x01',          // Center
        '"Ticket valido para la\n',
        'redencion del producto\n',
        'descrito en la leyenda, no\n',
        'canjeable en ninguna otra\n',
        'fecha diferente a la\n',
        'impresa en el ticket"\n',
        '\n\n\n\n\n\n',
        GS + 'V' + '\x00',           // Cut paper
    ];

    return commands.join('');
}

/**
 * Imprime el ticket usando el método configurado
 */
export async function printRedemptionTicket(ticketData, printerIndex) {
    const config = getPrinterConfig();

    // En iOS/iPad, Web Serial no está disponible — forzar método browser
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    const method = (config.method === 'serial' && isIOS) ? 'browser' : config.method;

    switch (method) {
        case 'serial':
            await printViaSerial(ticketData);
            break;
        case 'network':
            await printViaNetwork(ticketData, config, printerIndex);
            break;
        case 'browser':
        default:
            printViaBrowser(ticketData);
            break;
    }
}

/**
 * Impresión vía navegador — compatible con iPad/iOS
 * Usa un iframe oculto para evitar problemas con popups bloqueados
 */
function printViaBrowser(ticketData) {
    const html = generateTicketHTML(ticketData);
    
    // Remover iframe anterior si existe
    const existingFrame = document.getElementById('print-frame');
    if (existingFrame) existingFrame.remove();

    const iframe = document.createElement('iframe');
    iframe.id = 'print-frame';
    iframe.style.cssText = 'position:fixed;top:0;left:0;width:80mm;height:100%;border:none;z-index:99999;background:white;';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();

    // Esperar a que cargue y luego imprimir
    iframe.onload = () => {
        setTimeout(() => {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            // En iOS el diálogo de impresión es nativo, remover iframe después
            setTimeout(() => {
                iframe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:none;opacity:0;';
            }, 1000);
        }, 300);
    };
}

/**
 * Impresión vía Web Serial API (USB directo)
 */
async function printViaSerial(ticketData) {
    if (!('serial' in navigator)) {
        alert('Web Serial API no soportada en este navegador. Usa Chrome/Edge.');
        printViaBrowser(ticketData); // Fallback
        return;
    }

    try {
        const port = await navigator.serial.requestPort();
        await port.open({ baudRate: 9600 });

        const encoder = new TextEncoder();
        const writer = port.writable.getWriter();
        const data = generateESCPOS(ticketData);
        await writer.write(encoder.encode(data));
        writer.releaseLock();
        await port.close();
    } catch (error) {
        console.error('Error impresión serial:', error);
        if (error.name !== 'NotFoundError') {
            alert('Error al imprimir. Usando impresión del navegador como respaldo.');
            printViaBrowser(ticketData);
        }
    }
}

/**
 * Impresión vía red (IP directa al puerto raw de la impresora)
 * Soporta múltiples impresoras — envía a todas las configuradas
 */
async function printViaNetwork(ticketData, config, printerIndex) {
    const printers = config.printers || [];
    
    if (printers.length === 0) {
        // Fallback: usar networkIp viejo si existe
        if (config.networkIp) {
            printers.push({ ip: config.networkIp, port: config.networkPort || 9100 });
        } else {
            alert('No hay impresoras de red configuradas.');
            printViaBrowser(ticketData);
            return;
        }
    }

    // Si se especifica un índice, imprimir solo en esa impresora (para test)
    const targetPrinters = printerIndex !== undefined ? [printers[printerIndex]] : printers;
    const escposData = generateESCPOS(ticketData);

    const results = await Promise.allSettled(
        targetPrinters.map(async (printer) => {
            if (!printer || !printer.ip) return;
            const response = await fetch('/api/print', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ip: printer.ip,
                    port: printer.port || 9100,
                    data: escposData
                })
            });
            if (!response.ok) throw new Error(`Error imprimiendo en ${printer.name || printer.ip}`);
        })
    );

    const failures = results.filter(r => r.status === 'rejected');
    if (failures.length > 0 && failures.length === targetPrinters.length) {
        // Todas fallaron — fallback a browser
        console.error('Todas las impresoras de red fallaron:', failures);
        alert('Error en todas las impresoras de red. Usando impresión del navegador como respaldo.');
        printViaBrowser(ticketData);
    } else if (failures.length > 0) {
        // Algunas fallaron
        console.warn('Algunas impresoras fallaron:', failures);
    }
}
