'use strict';

const net = require('net');

/**
 * Genera comandos ESC/POS para un ticket de canje/recompensa
 */
function generateTicketESCPOS({ programName, customerName, perkName, perkDescription, redeemedAt, type, reason }) {
    const date = new Date(redeemedAt);
    const dateStr = date.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

    const ESC = '\x1B';
    const GS = '\x1D';

    const title = type === 'cycle_reward' ? 'RECOMPENSA POR CICLO' : 'TICKET VALE POR:';
    const product = (perkName || perkDescription || reason || 'CORTESÍA').toUpperCase();

    const commands = [
        ESC + '@',                    // Initialize
        ESC + 'a' + '\x01',          // Center align
        GS + '!' + '\x11',           // Double height + width
        (programName || 'LOYALTY') + '\n',
        GS + '!' + '\x00',           // Normal size
        ESC + 'a' + '\x00',          // Left align
        '--------------------------------\n',
        `Fecha: ${dateStr}\n`,
        `Hora: ${timeStr}\n`,
        '--------------------------------\n',
        ESC + 'a' + '\x01',          // Center
        ESC + 'E' + '\x01',          // Bold on
        title + '\n\n',
        GS + '!' + '\x11',           // Double size
        product + '\n\n',
        GS + '!' + '\x00',           // Normal
        ESC + 'E' + '\x01',          // Bold
        customerName + '\n',
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
 * Envía datos a una impresora por TCP
 * @param {string} ip - IP de la impresora
 * @param {number} port - Puerto (default 9100)
 * @param {string} data - Datos ESC/POS a enviar
 * @returns {Promise<void>}
 */
function sendToPrinter(ip, port, data) {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        const timeout = 5000;

        client.setTimeout(timeout);

        client.connect(port || 9100, ip, () => {
            client.write(data, 'binary', () => {
                client.end();
                resolve();
            });
        });

        client.on('error', (err) => {
            client.destroy();
            reject(new Error(`No se pudo conectar a ${ip}:${port} — ${err.message}`));
        });

        client.on('timeout', () => {
            client.destroy();
            reject(new Error(`Timeout conectando a ${ip}:${port}`));
        });
    });
}

/**
 * Envía un ticket a TODAS las impresoras activas según el tipo de evento
 * @param {object} supabase - Cliente Supabase
 * @param {string} event - 'checkin' | 'redemption' | 'cycle_reward'
 * @param {object} ticketData - Datos del ticket
 * @returns {Promise<{ printed: number, total: number, errors: Array }>}
 */
async function printToAllPrinters(supabase, event, ticketData) {
    const filterColumn = {
        'checkin': 'print_on_checkin',
        'redemption': 'print_on_redemption',
        'cycle_reward': 'print_on_cycle_reward'
    }[event];

    if (!filterColumn) {
        console.warn(`[print] Unknown event type: ${event}`);
        return { printed: 0, total: 0, errors: [] };
    }

    const { data: printers, error } = await supabase
        .from('printers')
        .select('*')
        .eq('is_active', true)
        .eq(filterColumn, true);

    if (error || !printers || printers.length === 0) {
        console.log(`[print] No active printers for event "${event}"`);
        return { printed: 0, total: 0, errors: [] };
    }

    const escposData = generateTicketESCPOS(ticketData);

    const results = await Promise.allSettled(
        printers.map(printer =>
            sendToPrinter(printer.ip_address, printer.port, escposData)
                .then(() => {
                    console.log(`[print] ✓ Sent to ${printer.name} (${printer.ip_address}:${printer.port})`);
                })
        )
    );

    const errors = results
        .map((r, i) => r.status === 'rejected' ? { printer: printers[i].name, error: r.reason.message } : null)
        .filter(Boolean);

    if (errors.length > 0) {
        console.warn('[print] Some printers failed:', errors);
    }

    return {
        printed: results.filter(r => r.status === 'fulfilled').length,
        total: printers.length,
        errors
    };
}

module.exports = {
    generateTicketESCPOS,
    sendToPrinter,
    printToAllPrinters
};
