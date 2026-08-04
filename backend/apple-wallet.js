'use strict';

const { PKPass } = require('passkit-generator');
const path = require('path');
const fs = require('fs');

const PASS_TYPE_ID = 'pass.com.sw-pos.loyalty';
const TEAM_ID = process.env.APPLE_TEAM_ID || '7S87DS9Z82';

// Cargar certificados
const certsDir = path.join(__dirname, 'certs');

let signerCert, signerKey, wwdr;
try {
    signerCert = fs.readFileSync(path.join(certsDir, 'signerCert.pem'), 'utf8');
    signerKey = fs.readFileSync(path.join(certsDir, 'signerKey.pem'), 'utf8');
    wwdr = fs.readFileSync(path.join(certsDir, 'wwdr.pem'), 'utf8');
    console.log('[apple-wallet] Certificados cargados correctamente.');
} catch (e) {
    console.warn('[apple-wallet] Certificados no encontrados:', e.message);
}

/**
 * Genera un pase .pkpass para Apple Wallet
 */
async function createApplePass({ customerId, customerName, tenant }) {
    if (!signerCert || !signerKey || !wwdr) {
        throw new Error('Apple Wallet no configurado: certificados faltantes');
    }

    const programName = tenant?.wallet_program_name || 'Loyalty';
    const bgColor = tenant?.wallet_bg_color || '#1a1a2e';
    const orgName = tenant?.wallet_issuer_name || tenant?.name || 'Loyalty';

    // Convertir hex color a rgb
    const hexToRgb = (hex) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgb(${r}, ${g}, ${b})`;
    };

    // Icon requerido por Apple
    const iconPath = path.join(certsDir, 'icon.png');
    const iconBuffer = fs.existsSync(iconPath) ? fs.readFileSync(iconPath) : null;

    const pass = new PKPass(
        iconBuffer ? { 'icon.png': iconBuffer } : {},
        {
            signerCert,
            signerKey,
            wwdr,
            signerKeyPassphrase: 'loyalty2024',
        },
        {
            serialNumber: customerId,
            description: `${programName} - Tarjeta de Lealtad`,
            organizationName: orgName,
            passTypeIdentifier: PASS_TYPE_ID,
            teamIdentifier: TEAM_ID,
            foregroundColor: 'rgb(255, 255, 255)',
            backgroundColor: hexToRgb(bgColor),
            labelColor: 'rgb(200, 200, 200)',
            logoText: programName,
        }
    );

    pass.type = 'storeCard';

    pass.headerFields.push({
        key: 'points',
        label: 'PUNTOS',
        value: 0,
    });

    pass.primaryFields.push({
        key: 'name',
        label: 'CLIENTE',
        value: customerName,
    });

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

    pass.setBarcodes({
        format: 'PKBarcodeFormatQR',
        message: customerId,
        messageEncoding: 'iso-8859-1',
        altText: customerId,
    });

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

    const buffer = pass.getAsBuffer();
    return buffer;
}

function isAppleWalletEnabled() {
    return !!(signerCert && signerKey && wwdr);
}

module.exports = {
    createApplePass,
    isAppleWalletEnabled,
    PASS_TYPE_ID,
};
