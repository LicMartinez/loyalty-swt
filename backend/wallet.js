const { auth } = require('google-auth-library');
const jwt = require('jsonwebtoken');

const ISSUER_ID = process.env.GOOGLE_ISSUER_ID;
const CLASS_ID = process.env.GOOGLE_CLASS_ID;

// Cargar credenciales JSON de GCP (desde archivo o variable de entorno)
let credentials;
if (process.env.GCP_SERVICE_ACCOUNT_JSON) {
    credentials = JSON.parse(process.env.GCP_SERVICE_ACCOUNT_JSON);
} else {
    try {
        credentials = require('./gcp-service-account.json');
    } catch (e) {
        console.error("No se encontró GCP credentials. Configura GCP_SERVICE_ACCOUNT_JSON como variable de entorno.");
    }
}

// Inicializar cliente de Google Auth
const client = auth.fromJSON(credentials);
client.scopes = ['https://www.googleapis.com/auth/wallet_object.issuer'];

/**
 * Asegura que la Loyalty Class existe. Si no existe, la crea.
 */
let classVerified = false;
async function ensureLoyaltyClassExists() {
    if (classVerified) return;
    
    const url = `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass/${CLASS_ID}`;
    
    try {
        await client.request({ url, method: 'GET' });
        console.log(`Loyalty Class ${CLASS_ID} verificada correctamente.`);
        classVerified = true;
    } catch (error) {
        if (error.response?.status === 404) {
            // La clase no existe, la creamos
            console.log(`Loyalty Class ${CLASS_ID} no existe. Creándola...`);
            const createUrl = 'https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass';
            const classData = {
                id: CLASS_ID,
                issuerName: 'PANEM',
                programName: 'Loyalty PANEM',
                programLogo: {
                    sourceUri: {
                        uri: 'https://storage.googleapis.com/wallet-lab-tools-codelab-artifacts-public/pass_google_logo.jpg'
                    },
                    contentDescription: {
                        defaultValue: {
                            language: 'es-MX',
                            value: 'PANEM Logo'
                        }
                    }
                },
                reviewStatus: 'UNDER_REVIEW',
                countryCode: 'MX',
                hexBackgroundColor: '#1a1a2e',
                accountNameLabel: 'Nombre',
                accountIdLabel: 'ID Cliente'
            };
            
            try {
                await client.request({ url: createUrl, method: 'POST', data: classData });
                console.log(`Loyalty Class ${CLASS_ID} creada exitosamente.`);
                classVerified = true;
            } catch (createError) {
                console.error('Error creando Loyalty Class:', createError.response?.data || createError.message);
                throw createError;
            }
        } else {
            console.error('Error verificando Loyalty Class:', error.response?.data || error.message);
            throw error;
        }
    }
}

/**
 * Crea un pase genérico para un nuevo cliente
 * @param {string} customerId - Supabase customer ID
 * @param {string} customerName - Customer name
 */
async function createWalletPass(customerId, customerName) {
    // Asegurar que la clase existe
    await ensureLoyaltyClassExists();
    
    const objectId = `${ISSUER_ID}.${customerId}`;
    
    const loyaltyObject = {
        id: objectId,
        classId: CLASS_ID,
        state: 'ACTIVE',
        accountId: customerId,
        accountName: customerName,
        loyaltyPoints: {
            label: 'Puntos',
            balance: {
                int: 0
            }
        },
        barcode: {
            type: 'QR_CODE',
            value: customerId, // El QR mostrará el UUID del cliente para leerlo en el bar
            alternateText: customerId
        },
        textModulesData: [
            {
                header: 'Visitas',
                body: '0',
                id: 'visits'
            },
            {
                header: 'Puntos',
                body: '0',
                id: 'points'
            }
        ]
    };

    const url = 'https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject';
    
    try {
        await client.request({
            url,
            method: 'POST',
            data: loyaltyObject
        });
    } catch (error) {
        // Si el objeto ya existe (409 Conflict), continuamos para generar el saveUrl
        if (error.response?.status !== 409) {
            console.error('Error al crear Wallet Pass:', error.response?.data || error.message);
            throw error;
        }
        console.log(`Wallet pass ${objectId} ya existe, generando saveUrl...`);
    }

    // Generar enlace "Add to Google Wallet"
    const jwtPayload = {
        iss: credentials.client_email,
        aud: 'google',
        typ: 'savetowallet',
        iat: Math.floor(Date.now() / 1000),
        payload: {
            loyaltyObjects: [
                { id: objectId, classId: CLASS_ID }
            ]
        }
    };

    const jwtToken = jwt.sign(jwtPayload, credentials.private_key, { algorithm: 'RS256' });
    const saveUrl = `https://pay.google.com/gp/v/save/${jwtToken}`;

    return { objectId, saveUrl };
}

/**
 * Retry helper: ejecuta fn con reintentos (inmediato, 5s, 30s, abandonar)
 * @param {Function} fn - Async function to execute
 * @param {number} maxRetries - Maximum number of attempts (default 3)
 */
async function updateWithRetry(fn, maxRetries = 3) {
    const delays = [0, 5000, 30000]; // immediate, 5s, 30s
    for (let i = 0; i < maxRetries; i++) {
        try {
            if (delays[i] > 0) await new Promise(r => setTimeout(r, delays[i]));
            await fn();
            return;
        } catch (err) {
            if (i === maxRetries - 1) {
                console.error('[wallet] Update failed after all retries:', err.message);
            }
        }
    }
}

/**
 * Actualiza los puntos, visitas, nivel y progreso de ciclo en un pase existente.
 * Se ejecuta como fire-and-forget con estrategia de reintento.
 * @param {string} customerId - Supabase customer ID
 * @param {number} visits - Total de visitas del cliente
 * @param {number} points - Puntos totales acumulados
 * @param {Array<string>} benefits - Lista de beneficios pendientes
 * @param {string} tierName - Nombre del nivel actual (e.g., "Oro")
 * @param {{ visitsCompleted: number, visitsRequired: number }} cycleProgress - Progreso del ciclo actual
 */
function updateWalletPass(customerId, visits, points, benefits, tierName, cycleProgress) {
    // Omitir si el cliente no tiene wallet pass
    if (!customerId) {
        console.log(`[wallet] Customer has no ID, skipping wallet update.`);
        return;
    }

    const objectId = `${ISSUER_ID}.${customerId}`;
    const url = `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${objectId}`;

    // URL base del portal del cliente
    const clientPortalUrl = process.env.CLIENT_PORTAL_URL || 'https://loyalty-staff.vercel.app';

    const patchBody = {
        loyaltyPoints: {
            label: 'Puntos',
            balance: {
                int: points
            }
        },
        secondaryLoyaltyPoints: {
            label: 'Visitas',
            balance: {
                double: cycleProgress
                    ? cycleProgress.visitsCompleted
                    : visits
            }
        },
        textModulesData: [
            { header: 'Nivel', body: tierName || 'Bronce', id: 'tier' },
            {
                header: 'Progreso',
                body: cycleProgress
                    ? `${cycleProgress.visitsCompleted}/${cycleProgress.visitsRequired} visitas para tu recompensa`
                    : `${visits} visitas`,
                id: 'visits'
            }
        ],
        linksModuleData: {
            uris: [
                {
                    uri: `${clientPortalUrl}/benefits/${customerId}`,
                    description: 'Ver mis beneficios disponibles',
                    id: 'benefits_link'
                }
            ]
        }
    };

    // Si hay beneficios pendientes, agregar un módulo de texto adicional
    if (benefits && benefits.length > 0) {
        patchBody.textModulesData.push({
            header: 'Beneficios Disponibles',
            body: benefits.map(b => `• ${b}`).join('\n'),
            id: 'benefits'
        });
    }

    // Fire-and-forget con reintentos (no bloquea el flujo principal)
    updateWithRetry(async () => {
        await client.request({ url, method: 'PATCH', data: patchBody });
        console.log(`[wallet] Pass updated for customer ${customerId}: ${tierName}, ${cycleProgress?.visitsCompleted}/${cycleProgress?.visitsRequired} visitas, ${points} pts`);
    }).catch(() => {
        // Silenciar - updateWithRetry ya logea el error final
    });
}

/**
 * Actualiza el wallet pass al cambiar de nivel (fire-and-forget con retry).
 * Se invoca cuando un admin cambia el nivel del cliente.
 * @param {string} customerId - Supabase customer ID
 * @param {string} walletPassId - Wallet object ID del cliente (null si no tiene)
 * @param {string} tierName - Nombre del nuevo nivel
 * @param {{ visitsCompleted: number, visitsRequired: number }} cycleProgress - Progreso del ciclo actual
 */
function updateWalletPassOnTierChange(customerId, walletPassId, tierName, cycleProgress) {
    if (!walletPassId) {
        console.log(`[wallet] Customer ${customerId} has no wallet pass, skipping update.`);
        return;
    }

    const objectId = `${ISSUER_ID}.${customerId}`;
    const url = `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${objectId}`;

    const patchBody = {
        textModulesData: [
            { header: 'Nivel', body: tierName, id: 'tier' },
            {
                header: 'Visitas',
                body: cycleProgress
                    ? `${cycleProgress.visitsCompleted}/${cycleProgress.visitsRequired} visitas`
                    : '0',
                id: 'visits'
            }
        ]
    };

    // Fire-and-forget con reintentos
    updateWithRetry(async () => {
        await client.request({ url, method: 'PATCH', data: patchBody });
    }).catch(() => {
        // Silenciar - updateWithRetry ya logea el error final
    });
}

/**
 * Crea un pase para un nuevo cliente.
 * Primero asegura que la clase existe, luego genera el JWT con el objeto completo.
 */
async function createWalletPassJWT(customerId, customerName) {
    // Asegurar que la clase existe antes de crear el objeto
    await ensureLoyaltyClassExists();
    
    const objectId = `${ISSUER_ID}.${customerId}`;
    
    const loyaltyObject = {
        id: objectId,
        classId: CLASS_ID,
        state: 'ACTIVE',
        accountId: customerId,
        accountName: customerName,
        loyaltyPoints: {
            label: 'Puntos',
            balance: {
                int: 0
            }
        },
        secondaryLoyaltyPoints: {
            label: 'Visitas',
            balance: {
                double: 0
            }
        },
        barcode: {
            type: 'QR_CODE',
            value: customerId,
            alternateText: customerId
        },
        textModulesData: [
            {
                header: 'Nivel',
                body: 'Bronce',
                id: 'tier'
            },
            {
                header: 'Progreso',
                body: '0/10 visitas para tu recompensa',
                id: 'visits'
            }
        ],
        linksModuleData: {
            uris: [
                {
                    uri: `${process.env.CLIENT_PORTAL_URL || 'https://loyalty-staff.vercel.app'}/benefits/${customerId}`,
                    description: 'Ver mis beneficios disponibles',
                    id: 'benefits_link'
                }
            ]
        }
    };

    // Fat JWT approach: incluir el objeto completo en el JWT
    // Esto crea el objeto al momento de que el usuario lo guarda en su Wallet
    const jwtPayload = {
        iss: credentials.client_email,
        aud: 'google',
        typ: 'savetowallet',
        iat: Math.floor(Date.now() / 1000),
        origins: ['http://localhost:3000'],
        payload: {
            loyaltyObjects: [loyaltyObject]
        }
    };

    const jwtToken = jwt.sign(jwtPayload, credentials.private_key, { algorithm: 'RS256' });
    const saveUrl = `https://pay.google.com/gp/v/save/${jwtToken}`;

    return { objectId, saveUrl };
}

/**
 * Verifica el estado de la configuración de Google Wallet
 */
async function checkStatus() {
    const result = {
        issuerId: ISSUER_ID,
        classId: CLASS_ID,
        serviceAccountEmail: credentials?.client_email || 'NO CONFIGURADO',
        classExists: false,
        classDetails: null,
        error: null
    };

    try {
        const url = `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass/${CLASS_ID}`;
        const response = await client.request({ url, method: 'GET' });
        result.classExists = true;
        result.classDetails = {
            programName: response.data.programName,
            issuerName: response.data.issuerName,
            reviewStatus: response.data.reviewStatus,
            state: response.data.state || 'N/A'
        };
    } catch (error) {
        result.error = error.response?.data || error.message;
        if (error.response?.status === 404) {
            result.error = `La clase ${CLASS_ID} NO EXISTE. Se creará automáticamente al generar el primer pase.`;
        }
    }

    return result;
}

module.exports = {
    createWalletPass,
    createWalletPassJWT,
    updateWalletPass,
    updateWalletPassOnTierChange,
    updateWithRetry,
    checkStatus,
    ensureLoyaltyClassExists
};
