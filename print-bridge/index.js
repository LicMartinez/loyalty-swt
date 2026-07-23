/**
 * Print Bridge — Servidor HTTPS local para impresión TCP
 * Corre en la PC del local. El iPad lo llama para enviar tickets a impresoras.
 * 
 * USO: node index.js
 * Puerto: 4001 (o PRINT_BRIDGE_PORT)
 */

const https = require('https');
const net = require('net');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PRINT_BRIDGE_PORT) || 4001;

// --- Generar o cargar certificado SSL ---
async function getCerts() {
    const certDir = path.join(__dirname, '.certs');
    const keyPath = path.join(certDir, 'key.pem');
    const certPath = path.join(certDir, 'cert.pem');

    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
        console.log('[cert] Usando certificado existente.');
        return { key: fs.readFileSync(keyPath, 'utf8'), cert: fs.readFileSync(certPath, 'utf8') };
    }

    if (!fs.existsSync(certDir)) fs.mkdirSync(certDir);

    const selfsigned = require('selfsigned');
    const attrs = [{ name: 'commonName', value: 'PrintBridge' }];
    const pems = await selfsigned.generate(attrs, { days: 365, keySize: 2048 });

    fs.writeFileSync(keyPath, pems.private);
    fs.writeFileSync(certPath, pems.cert);
    console.log('[cert] Certificado generado.');
    return { key: pems.private, cert: pems.cert };
}

// --- Enviar datos TCP a impresora ---
function sendToPrinter(ip, port, data) {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        client.setTimeout(5000);
        client.connect(port || 9100, ip, () => {
            client.write(data, 'binary', () => { client.end(); resolve(); });
        });
        client.on('error', err => { client.destroy(); reject(err); });
        client.on('timeout', () => { client.destroy(); reject(new Error('Timeout')); });
    });
}

// --- Arrancar ---
async function main() {
    const certs = await getCerts();

    const server = https.createServer(certs, (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

        if (req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'Print Bridge OK', port: PORT }));
            return;
        }

        if (req.method === 'POST' && req.url === '/print') {
            let body = '';
            req.on('data', c => { body += c; });
            req.on('end', async () => {
                try {
                    const { ip, port, data } = JSON.parse(body);
                    if (!ip || !data) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'IP y datos requeridos' }));
                        return;
                    }
                    await sendToPrinter(ip, port, data);
                    console.log(`[OK] → ${ip}:${port || 9100}`);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                } catch (err) {
                    console.error(`[ERR] ${err.message}`);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                }
            });
            return;
        }

        res.writeHead(404); res.end('Not found');
    });

    server.listen(PORT, '0.0.0.0', () => {
        console.log(`\n🖨  Print Bridge HTTPS en puerto ${PORT}`);
        const os = require('os');
        Object.values(os.networkInterfaces()).flat()
            .filter(i => i.family === 'IPv4' && !i.internal)
            .forEach(i => console.log(`   iPad: https://${i.address}:${PORT}/`));
        console.log(`\n   Paso 1: Abre https://<IP>:${PORT}/ en Safari del iPad y acepta el cert.\n`);
    });
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
