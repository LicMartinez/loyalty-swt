/**
 * Desinstala el servicio PrintBridge de Windows.
 * Ejecutar como administrador:
 *   node uninstall-service.js
 */

const path = require('path');
const { Service } = require('node-windows');

const svc = new Service({
    name: 'PrintBridge',
    script: path.join(__dirname, 'index.js')
});

svc.on('uninstall', () => {
    console.log('✅ Servicio "PrintBridge" desinstalado.');
});

svc.on('error', (err) => {
    console.error('❌ Error:', err);
});

svc.uninstall();
