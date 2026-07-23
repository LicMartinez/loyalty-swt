/**
 * Instala el Print Bridge como servicio de Windows.
 * Ejecutar UNA VEZ como administrador:
 *   node install-service.js
 * 
 * El servicio se llamará "PrintBridge" y se iniciará automáticamente.
 * No aparece ventana, no se puede cerrar por usuarios estándar.
 */

const path = require('path');
const { Service } = require('node-windows');

const svc = new Service({
    name: 'PrintBridge',
    description: 'Loyalty Print Bridge - Envía tickets a impresoras térmicas por TCP',
    script: path.join(__dirname, 'index.js'),
    env: [{
        name: 'PRINT_BRIDGE_PORT',
        value: '4001'
    }]
});

svc.on('install', () => {
    svc.start();
    console.log('✅ Servicio "PrintBridge" instalado e iniciado.');
    console.log('   - Se inicia automáticamente al encender el equipo');
    console.log('   - Corre en segundo plano (sin ventana)');
    console.log('   - Para ver estado: services.msc → PrintBridge');
});

svc.on('alreadyinstalled', () => {
    console.log('⚠️  El servicio ya está instalado. Usa uninstall-service.js para removerlo primero.');
});

svc.on('error', (err) => {
    console.error('❌ Error:', err);
});

svc.install();
