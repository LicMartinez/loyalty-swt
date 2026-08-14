'use strict';

const { PKPass } = require('passkit-generator');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');

const PASS_TYPE_ID = 'pass.com.sw-pos.loyalty';
const TEAM_ID = process.env.APPLE_TEAM_ID || '7S87DS9Z82';
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;

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

function parseHex(hex) {
    const raw = String(hex || '').trim();
    const m = raw.match(/^#?([0-9a-fA-F]{6})$/);
    if (!m) return { r: 26, g: 26, b: 46 };
    return {
        r: parseInt(m[1].slice(0, 2), 16),
        g: parseInt(m[1].slice(2, 4), 16),
        b: parseInt(m[1].slice(4, 6), 16),
    };
}

function hexToRgb(hex) {
    const { r, g, b } = parseHex(hex);
    return `rgb(${r}, ${g}, ${b})`;
}

function relativeLuminance(hex) {
    const { r, g, b } = parseHex(hex);
    const lin = (c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastColors(bgHex, fgOverride, labelOverride) {
    const lightBg = relativeLuminance(bgHex) > 0.45;
    return {
        foregroundColor: fgOverride ? hexToRgb(fgOverride) : (lightBg ? 'rgb(15, 23, 42)' : 'rgb(255, 255, 255)'),
        labelColor: labelOverride ? hexToRgb(labelOverride) : (lightBg ? 'rgb(71, 85, 105)' : 'rgb(203, 213, 225)'),
    };
}

function crc32(buf) {
    let c = ~0;
    for (let i = 0; i < buf.length; i++) {
        c ^= buf[i];
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    return (~c) >>> 0;
}

function pngChunk(type, data) {
    const typeBuf = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/**
 * PNG de franja (strip) con degradado vertical a partir del color de marca.
 * Tamaño @2x de storeCard: 750×246.
 */
function createGradientStripPng(hex, width = 750, height = 246) {
    const { r, g, b } = parseHex(hex);
    const raw = Buffer.alloc(height * (1 + width * 3));
    for (let y = 0; y < height; y++) {
        const t = y / Math.max(height - 1, 1);
        const factor = 0.42 + 0.58 * t;
        const row = y * (1 + width * 3);
        raw[row] = 0;
        const rr = Math.round(r * factor);
        const gg = Math.round(g * factor);
        const bb = Math.round(b * factor);
        for (let x = 0; x < width; x++) {
            const i = row + 1 + x * 3;
            raw[i] = rr;
            raw[i + 1] = gg;
            raw[i + 2] = bb;
        }
    }

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    const idat = zlib.deflateSync(raw);
    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        pngChunk('IHDR', ihdr),
        pngChunk('IDAT', idat),
        pngChunk('IEND', Buffer.alloc(0)),
    ]);
}

async function fetchImageBuffer(url) {
    if (!url || typeof url !== 'string') return null;
    if (!/^https?:\/\//i.test(url.trim())) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
        const res = await fetch(url.trim(), { signal: controller.signal, redirect: 'follow' });
        if (!res.ok) return null;
        const ctype = (res.headers.get('content-type') || '').toLowerCase();
        const looksImage = ctype.includes('png') || ctype.includes('jpeg') || ctype.includes('jpg')
            || ctype.includes('octet-stream') || /\.(png|jpe?g)(\?|$)/i.test(url);
        if (!looksImage) return null;

        const ab = await res.arrayBuffer();
        if (ab.byteLength < 24 || ab.byteLength > MAX_IMAGE_BYTES) return null;
        const buf = Buffer.from(ab);
        const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
        const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
        if (!isPng && !isJpg) return null;
        return buf;
    } catch (err) {
        console.warn('[apple-wallet] No se pudo descargar imagen:', url, err.message);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

function addImageSet(buffers, name, buffer) {
    if (!buffer) return;
    buffers[`${name}.png`] = buffer;
    buffers[`${name}@2x.png`] = buffer;
    buffers[`${name}@3x.png`] = buffer;
}

function shortMemberId(customerId) {
    const id = String(customerId || '');
    if (id.length <= 12) return id;
    return id.slice(0, 8).toUpperCase();
}

/**
 * Genera un pase .pkpass para Apple Wallet con branding del tenant.
 */
async function createApplePass({
    customerId,
    customerName,
    tenant,
    points = 0,
    visitsProgress = '0/10',
    tierName = 'Bronce',
}) {
    if (!signerCert || !signerKey || !wwdr) {
        throw new Error('Apple Wallet no configurado: certificados faltantes');
    }

    const programName = tenant?.wallet_program_name || tenant?.name || 'Loyalty';
    const bgColor = tenant?.wallet_bg_color || '#1a1a2e';
    const orgName = tenant?.wallet_issuer_name || tenant?.name || 'Loyalty';
    const colors = contrastColors(bgColor, tenant?.wallet_fg_color, tenant?.wallet_label_color);

    const fallbackIconPath = path.join(certsDir, 'icon.png');
    const fallbackIcon = fs.existsSync(fallbackIconPath) ? fs.readFileSync(fallbackIconPath) : null;

    const [logoBuf, stripBuf, iconBuf] = await Promise.all([
        fetchImageBuffer(tenant?.wallet_logo_url),
        fetchImageBuffer(tenant?.wallet_strip_url),
        fetchImageBuffer(tenant?.wallet_icon_url || tenant?.wallet_logo_url),
    ]);

    const buffers = {};
    addImageSet(buffers, 'icon', iconBuf || fallbackIcon);
    addImageSet(buffers, 'logo', logoBuf || iconBuf || fallbackIcon);
    addImageSet(buffers, 'strip', stripBuf || createGradientStripPng(bgColor));

    const pass = new PKPass(
        buffers,
        {
            signerCert,
            signerKey,
            wwdr,
            signerKeyPassphrase: 'loyalty2024',
        },
        {
            serialNumber: customerId,
            description: `${programName} — Tarjeta de lealtad`,
            organizationName: orgName,
            passTypeIdentifier: PASS_TYPE_ID,
            teamIdentifier: TEAM_ID,
            foregroundColor: colors.foregroundColor,
            backgroundColor: hexToRgb(bgColor),
            labelColor: colors.labelColor,
            logoText: programName,
            groupingIdentifier: tenant?.slug || orgName,
        }
    );

    pass.type = 'storeCard';

    pass.headerFields.push({
        key: 'points',
        label: 'PUNTOS',
        value: Number.isFinite(Number(points)) ? Number(points) : 0,
    });

    pass.primaryFields.push({
        key: 'name',
        label: 'CLIENTE',
        value: customerName || 'Socio',
    });

    pass.secondaryFields.push(
        {
            key: 'tier',
            label: 'NIVEL',
            value: tierName || '—',
        },
        {
            key: 'visits',
            label: 'VISITAS',
            value: visitsProgress || '0/10',
        }
    );

    pass.setBarcodes({
        format: 'PKBarcodeFormatQR',
        message: customerId,
        messageEncoding: 'iso-8859-1',
        altText: shortMemberId(customerId),
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
            key: 'issuer',
            label: 'Marca',
            value: orgName,
        },
        {
            key: 'benefits_url',
            label: 'Mis Beneficios',
            value: `${process.env.CLIENT_PORTAL_URL || 'https://loyalty-staff.vercel.app'}/benefits/${customerId}`,
        }
    );

    return pass.getAsBuffer();
}

function isAppleWalletEnabled() {
    return !!(signerCert && signerKey && wwdr);
}

module.exports = {
    createApplePass,
    isAppleWalletEnabled,
    PASS_TYPE_ID,
    parseHex,
    hexToRgb,
    contrastColors,
    createGradientStripPng,
    fetchImageBuffer,
    shortMemberId,
};
