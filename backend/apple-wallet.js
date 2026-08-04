'use strict';

const { PKPass } = require('passkit-generator');
const path = require('path');
const fs = require('fs');

const PASS_TYPE_ID = 'pass.com.sw-pos.loyalty';
const TEAM_ID = process.env.APPLE_TEAM_ID || '7S87DS9Z82';

// Certificados
const certsDir = path.join(__dirname, 'certs');
const signerCert = fs.existsSync(path.join(certsDir, 'pass.p12'))
    ? fs.readFileSync(path.join(certsDir, 'pass.p12'))
    : null;
const wwdr = fs.existsSync(path.join(certsDir, 'AppleWWDRCAG4.cer'))
    ? fs.readFileSync(path.join(certsDir, 'AppleWWDRCAG4.cer'))
    : null;

if (!signerCert || !wwdr) {
    console.warn('[apple-wallet] Certificados no encontrados en backend/certs/. Apple Wallet deshabilitado.');
}

/**
 * Genera un pase .pkpass para Apple Wallet
 * @param {object} params
 * @param {string} params.customerId - UUID del cliente
 * @param {string} params.customerName - Nombre del cliente
 * @param {object} params.tenant - Config del tenant (name, wallet_program_name, wallet_bg_color, wallet_logo_url)
 * @returns {Promise<Buffer>} - Buffer del archivo .pkpass
 */
async function createApplePass({ customerId, customerName, tenant }) {
    if (!signerCert || !wwdr) {
        throw new Error('Apple Wallet no configurado: certificados faltantes');
    }

    const programName = tenant?.wallet_program_name || 'Loyalty';
    const bgColor = tenant?.wallet_bg_color || '#1a1a2e';
    const orgName = tenant?.wallet_issuer_name || tenant?.name || 'Loyalty';

    const pass = new PKPass({},
        {
            signerCert,
            signerKey: signerCert, // p12 contiene ambos
            wwdr,
            signerKeyPassphrase: '', // sin contraseña
        },
        {
            serialNumber: customerId,
            description: `${programName} - Tarjeta de Lealtad`,
            organizationName: orgName,
            passTypeIdentifier: PASS_TYPE_ID,
            teamIdentifier: TEAM_ID,
            foregroundColor: 'rgb(255, 255, 255)',
            backgroundColor: bgColor,
            labelColor: 'rgb(200, 200, 200)',
            logoText: programName,
        }
    );

    // Tipo: Generic pass (storeCard para loyalty)
    pass.type = 'storeCard';

    // Header fields
    pass.headerFields.push({
        key: 'points',
        label: 'PUNTOS',
        value: 0,
    });

    // Primary fields
    pass.primaryFields.push({
        key: 'name',
        label: 'CLIENTE',
        value: customerName,
    });

    // Secondary fields
    pass.secondaryFields.push(
        {
            key: 'tier',
            label: 'NIVEL',
            value: 'Bronce',
        },
        {
            key: 'visits',
            label: 'VISITAS',
            value: '0/10',
        }
    );

    // Barcode (QR con el customerId)
    pass.setBarcodes({
        format: 'PKBarcodeFormatQR',
        message: customerId,
        messageEncoding: 'iso-8859-1',
        altText: customerId,
    });

    // Back fields (detalle)
    pass.backFields.push(
        {
            key: 'memberId',
            label: 'ID de Membresía',
            value: customerId,
        },
        {
            key: 'program',
            label: 'Programa',
            value: programName,
        },
        {
            key: 'benefits_url',
            label: 'Mis Beneficios',
            value: `${process.env.CLIENT_PORTAL_URL || 'https://loyalty-staff.vercel.app'}/benefits/${customerId}`,
        }
    );

    // Generar el buffer del .pkpass
    const buffer = pass.getAsBuffer();
    return buffer;
}

/**
 * Verifica si Apple Wallet está disponible (certificados presentes)
 */
function isAppleWalletEnabled() {
    return !!(signerCert && wwdr && TEAM_ID);
}

module.exports = {
    createApplePass,
    isAppleWalletEnabled,
    PASS_TYPE_ID,
};
