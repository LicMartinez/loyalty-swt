/**
 * Print Bridge — Mini-servidor local para impresión por TCP
 * 
 * Corre en una PC dentro de la red del local.
 * El Staff Portal (iPad) llama a este servidor para enviar tickets
 * a las impresoras térmicas por TCP.
 * 
 * USO:
 *   node index.js
 *   
 * El servidor escucha en el puerto 3001 (configurable).
 * Accesible desde: http://{IP_DE_LA_PC}:3001/print
 * 
 * El iPad envía: POST http://192.168.0.XXX:3001/print
 *   Body: { ip: "192.168.0.10", port: 9100, data: "ESC/POS commands" }
 */

const http = require('http');
const net = require('net');

const PORT = process.env.PRINT_BRIDGE_PORT || 3001;

const server = http.createServer((req, res) => {
    // CORS headers — permite requests desde cualquier origen (el iPad)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Health check
    if (req.method === 'GET' && req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'Print Bridge running', port: PORT }));
        return;
    }

    // Print endpoint
    if (req.method === 'POST' && req.url === '/print') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const { ip, port, data } = JSON.parse(body);

                if (!ip || !data) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'IP y datos requeridos' }));
                    return;
                }

                const client = new net.Socket();
                const timeout = 5000;

                client.setTimeout(timeout);

                client.connect(port || 9100, ip, () => {
                    client.write(data, 'binary', () => {
                        client.end();
                        console.log(`[✓] Printed to ${ip}:${port || 9100}`);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true }));
                    });
                });

                client.on('error', (err) => {
                    client.destroy();
                    console.error(`[✗] Error printing to ${ip}: ${err.message}`);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: `No se pudo conectar a ${ip}:${port || 9100}` }));
                });

                client.on('timeout', () => {
                    client.destroy();
                    console.error(`[✗] Timeout printing to ${ip}`);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: `Timeout conectando a ${ip}:${port || 9100}` }));
                });
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'JSON inválido' }));
            }
        });
        return;
    }

    res.writeHead(404);
    res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🖨  Print Bridge corriendo en puerto ${PORT}`);
    console.log(`   Accesible en: http://0.0.0.0:${PORT}`);
    console.log(`   Health check: GET /`);
    console.log(`   Imprimir:     POST /print { ip, port, data }\n`);
    
    // Mostrar IPs locales
    const os = require('os');
    const interfaces = os.networkInterfaces();
    Object.values(interfaces).flat().filter(i => i.family === 'IPv4' && !i.internal).forEach(i => {
        console.log(`   Desde iPad: http://${i.address}:${PORT}/print`);
    });
    console.log('');
});
