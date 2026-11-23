/**
 * Módulo de impresión térmica POS
 * Soporta:
 * - Impresión vía navegador (window.print) - compatible con cualquier impresora
 * - Web Serial API (conexión USB directa) - para impresoras ESC/POS
 * - Impresión vía IP (red) - para impresoras de red
 */

// Configuración guardada en localStorage
const PRINTER_CONFIG_KEY = 'printer_config';

const DEFAULT_BRIDGE_URL = 'https://127.0.0.1:4001';

export function getPrinterConfig() {
    const saved = localStorage.getItem(PRINTER_CONFIG_KEY);
    const defaults = {
        method: 'network',
        networkIp: '',
        networkPort: 9100,
        paperWidth: 80,
        printBridgeUrl: DEFAULT_BRIDGE_URL,
        printers: [],
    };
    if (!saved) return defaults;
    try {
        const parsed = JSON.parse(saved);
        const printers = (parsed.printers || []).map((p) => ({
            ...p,
            role: p.role === 'cover' ? 'cover' : 'bar',
        }));
        return {
            ...defaults,
            ...parsed,
            printers,
            printBridgeUrl: parsed.printBridgeUrl || DEFAULT_BRIDGE_URL,
        };
    } catch {
        return defaults;
    }
}

function brandName(ticketData) {
    return (
        ticketData?.brandName ||
        (typeof localStorage !== 'undefined' && localStorage.getItem('staff_tenant_name')) ||
        'LOYALTY'
    ).toUpperCase();
}

/**
 * Barra: todas las impresoras que no son cover.
 * Cover: una sola impresora marcada como exclusiva (la primera con role=cover).
 */
export function printersForTarget(config, target = 'bar') {
    const printers = config.printers || [];
    if (target === 'cover') {
        const exclusive = printers.filter((p) => p.role === 'cover' && p.ip);
        return exclusive.slice(0, 1);
    }
    const bar = printers.filter((p) => p.role !== 'cover' && p.ip);
    if (bar.length) return bar;
    return printers.filter((p) => p.ip);
}

export function savePrinterConfig(config) {
    localStorage.setItem(PRINTER_CONFIG_KEY, JSON.stringify(config));
}

export function bridgeBaseUrl(config) {
    return (config?.printBridgeUrl || localStorage.getItem('print_bridge_url') || DEFAULT_BRIDGE_URL).replace(/\/$/, '');
}

/**
 * Comprueba si Print Bridge responde en esta PC (HTTPS :4001).
 * Si falla, casi siempre es: el proceso no está corriendo o el certificado self-signed no se aceptó.
 */
export async function checkPrintBridge(config) {
    const url = bridgeBaseUrl(config);
    try {
        const res = await fetch(`${url}/`, { method: 'GET' });
        if (!res.ok) {
            return { ok: false, url, error: `Print Bridge respondió HTTP ${res.status}` };
        }
        const data = await res.json().catch(() => ({}));
        return { ok: true, url, data };
    } catch {
        return {
            ok: false,
            url,
            error: `No se pudo conectar a ${url}. Arranca Print Bridge en esta PC y abre esa URL para aceptar el certificado.`,
        };
    }
}

/** Intenta abrir un TCP a la impresora vía Print Bridge, sin imprimir. */
export async function probePrinter(config, printer) {
    const url = bridgeBaseUrl(config);
    if (!printer?.ip) return { ok: false, error: 'Falta la IP de la impresora' };
    try {
        const res = await fetch(`${url}/probe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ip: printer.ip, port: printer.port || 9100 }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
            return { ok: false, error: body.error || `No hay ruta TCP a ${printer.ip}:${printer.port || 9100}` };
        }
        return { ok: true };
    } catch {
        return {
            ok: false,
            error: `Print Bridge no responde en ${url}. Ábrelo en el navegador y acepta el certificado.`,
        };
    }
}

/**
 * Genera el HTML del ticket para impresión
 */
function generateTicketHTML(ticketData) {
    const { customerName, perkName, perkDescription, redeemedAt, ticketKind } = ticketData;
    const date = new Date(redeemedAt);
    const dateStr = date.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    const isCover = ticketKind === 'cover';
    const header = brandName(ticketData);

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
    <div class="header">${header}</div>
    <div class="separator"></div>
    <div class="datetime">
        Fecha: ${dateStr}<br>
        Hora: ${timeStr}
    </div>
    <div class="label">${isCover ? 'BOLETO DE COVER' : 'TICKET VALE POR:'}</div>
    <div class="product">${perkName || perkDescription || (isCover ? 'COVER' : 'CORTESÍA')}</div>
    <div class="customer">${customerName || (isCover ? '1 ACCESO' : '')}</div>
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
    const { customerName, perkName, perkDescription, redeemedAt, ticketKind } = ticketData;
    const date = new Date(redeemedAt);
    const dateStr = date.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    const isCover = ticketKind === 'cover';
    const header = brandName(ticketData);

    const ESC = '\x1B';
    const GS = '\x1D';
    const commands = [
        ESC + '@',                    // Initialize
        ESC + 'a' + '\x01',          // Center align
        GS + '!' + '\x11',           // Double height + width
        `${header}\n`,
        GS + '!' + '\x00',           // Normal size
        ESC + 'a' + '\x00',          // Left align
        '--------------------------------\n',
        `Fecha: ${dateStr}\n`,
        `Hora: ${timeStr}\n`,
        '--------------------------------\n',
        ESC + 'a' + '\x01',          // Center
        ESC + 'E' + '\x01',          // Bold on
        isCover ? 'BOLETO DE COVER\n\n' : 'TICKET VALE POR:\n\n',
        GS + '!' + '\x11',           // Double size
        `${(perkName || perkDescription || (isCover ? 'COVER' : 'CORTESIA')).toUpperCase()}\n\n`,
        GS + '!' + '\x00',           // Normal
        ESC + 'E' + '\x01',          // Bold
        `${customerName || (isCover ? '1 ACCESO' : '')}\n`,
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
export async function printRedemptionTicket(ticketData, printerIndexOrOpts, configOverride) {
    const config = configOverride || getPrinterConfig();

    let printerIndex;
    let target = ticketData?.ticketKind === 'cover' ? 'cover' : 'bar';
    if (typeof printerIndexOrOpts === 'number') {
        printerIndex = printerIndexOrOpts;
    } else if (printerIndexOrOpts && typeof printerIndexOrOpts === 'object') {
        if (printerIndexOrOpts.target) target = printerIndexOrOpts.target;
        if (printerIndexOrOpts.printerIndex !== undefined) printerIndex = printerIndexOrOpts.printerIndex;
    }

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    const method = (config.method === 'serial' && isIOS) ? 'browser' : config.method;

    switch (method) {
        case 'serial':
            await printViaSerial(ticketData);
            break;
        case 'network':
            await printViaNetwork(ticketData, config, printerIndex, target);
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
 * Usa el Print Bridge local para enviar comandos TCP a las impresoras.
 * El Print Bridge corre en una PC dentro de la red del local (HTTPS :4001).
 */
async function printViaNetwork(ticketData, config, printerIndex, target = 'bar') {
    let printers = config.printers || [];

    if (printers.length === 0) {
        if (config.networkIp) {
            printers = [{ ip: config.networkIp, port: config.networkPort || 9100, role: 'bar' }];
        } else {
            alert('No hay impresoras de red configuradas. Agrega una por IP en Configurar Impresoras.');
            printViaBrowser(ticketData);
            return;
        }
    }

    const bridgeUrl = config.printBridgeUrl || localStorage.getItem('print_bridge_url') || DEFAULT_BRIDGE_URL;

    if (!bridgeUrl) {
        alert('Configura la URL del Print Bridge (ej: https://127.0.0.1:4001) en la sección de impresoras.');
        printViaBrowser(ticketData);
        return;
    }

    let targetPrinters;
    if (printerIndex !== undefined) {
        targetPrinters = printers[printerIndex] ? [printers[printerIndex]] : [];
    } else {
        targetPrinters = printersForTarget({ printers }, target);
    }

    if (!targetPrinters.length) {
        alert(target === 'cover'
            ? 'No hay una impresora de cover. Márcala como “Cover (exclusiva)” en Configurar Impresoras.'
            : 'No hay impresoras de barra configuradas.');
        return;
    }
    const escposData = generateESCPOS(ticketData);

    const results = await Promise.allSettled(
        targetPrinters.map(async (printer) => {
            if (!printer || !printer.ip) throw new Error('La impresora no tiene IP');
            let response;
            try {
                response = await fetch(`${bridgeUrl.replace(/\/$/, '')}/print`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ip: printer.ip,
                        port: printer.port || 9100,
                        data: escposData
                    })
                });
            } catch {
                throw new Error(
                    `Print Bridge no responde en ${bridgeUrl}. En esta PC: cd print-bridge && node index.js, luego abre ${bridgeUrl} y acepta el certificado.`
                );
            }
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `Error imprimiendo en ${printer.name || printer.ip}`);
            }
        })
    );

    const failures = results.filter(r => r.status === 'rejected');
    if (failures.length > 0 && failures.length === targetPrinters.length) {
        console.error('Todas las impresoras de red fallaron:', failures);
        const reason = failures[0]?.reason?.message || 'Print Bridge no alcanzó la impresora';
        const useBrowser = confirm(
            `${reason}\n\n¿Imprimir con el diálogo de Windows? Elige la impresora COVER (u otra instalada) en el diálogo.`
        );
        if (useBrowser) printViaBrowser(ticketData);
    } else if (failures.length > 0) {
        console.warn('Algunas impresoras fallaron:', failures);
    }
}
