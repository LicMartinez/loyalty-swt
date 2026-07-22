'use strict';

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Retorna los 4 niveles predeterminados para un tenant nuevo.
 * @returns {Array} Arreglo de objetos de configuración de nivel
 */
function getDefaultTiers() {
    return [
        {
            name: 'Bronce',
            points_per_visit: 3,
            benefit_description: null,
            sort_order: 0,
            is_default: true,
        },
        {
            name: 'Plata',
            points_per_visit: 5,
            benefit_description: null,
            sort_order: 1,
            is_default: false,
        },
        {
            name: 'Oro',
            points_per_visit: 10,
            benefit_description: null,
            sort_order: 2,
            is_default: false,
        },
        {
            name: 'Platino',
            points_per_visit: 10,
            benefit_description: 'regalo por visita',
            sort_order: 3,
            is_default: false,
        },
    ];
}

/**
 * Valida un arreglo de configuraciones de nivel para un tenant.
 * Reglas:
 * - El arreglo debe tener entre 1 y 10 niveles
 * - Cada nombre debe ser no vacío, máximo 50 caracteres
 * - Los nombres deben ser únicos (case-insensitive) dentro del arreglo
 * - Cada points_per_visit debe ser un entero entre 1 y 1000
 *
 * @param {Array} tierData - Arreglo de objetos con { name, points_per_visit, ... }
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateTierConfig(tierData) {
    const errors = [];

    if (!Array.isArray(tierData)) {
        return { valid: false, errors: ['tierData debe ser un arreglo'] };
    }

    if (tierData.length < 1 || tierData.length > 10) {
        errors.push('La cantidad de niveles debe ser entre 1 y 10');
    }

    const seenNames = new Set();

    for (let i = 0; i < tierData.length; i++) {
        const tier = tierData[i];

        // Validar nombre
        if (!tier.name || typeof tier.name !== 'string' || tier.name.trim().length === 0) {
            errors.push(`Nivel ${i + 1}: el nombre no puede estar vacío`);
        } else if (tier.name.trim().length > 50) {
            errors.push(`Nivel ${i + 1}: el nombre no puede exceder 50 caracteres`);
        } else {
            const normalizedName = tier.name.trim().toLowerCase();
            if (seenNames.has(normalizedName)) {
                errors.push(`Nivel ${i + 1}: el nombre "${tier.name.trim()}" está duplicado`);
            }
            seenNames.add(normalizedName);
        }

        // Validar points_per_visit
        const points = tier.points_per_visit;
        if (points === undefined || points === null) {
            errors.push(`Nivel ${i + 1}: points_per_visit es requerido`);
        } else if (!Number.isInteger(points) || points < 1 || points > 1000) {
            errors.push(`Nivel ${i + 1}: points_per_visit debe ser un entero entre 1 y 1000`);
        }
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Obtiene la configuración del nivel actual de un cliente.
 * Si el nivel del cliente es inválido o no existe, retorna el nivel por defecto (Bronce)
 * y registra la anomalía.
 *
 * @param {object} supabase - Cliente de Supabase
 * @param {string} customerId - UUID del cliente
 * @returns {Promise<{ tier: object, fallback: boolean }>}
 */
async function getTierForCustomer(supabase, customerId) {
    // Obtener cliente con su tier_id
    const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('tier_id')
        .eq('id', customerId)
        .single();

    if (customerError || !customer) {
        throw new Error('Cliente no encontrado');
    }

    const tenantId = DEFAULT_TENANT_ID;

    // Si el cliente tiene tier_id, buscar ese nivel
    if (customer.tier_id) {
        const { data: tier, error: tierError } = await supabase
            .from('loyalty_tiers')
            .select('*')
            .eq('id', customer.tier_id)
            .single();

        if (!tierError && tier) {
            return { tier, fallback: false };
        }

        // El tier_id del cliente apunta a un nivel que no existe — anomalía
        console.warn(
            `[ANOMALY] Customer ${customerId} has invalid tier_id ${customer.tier_id}. Falling back to default tier.`
        );
    }

    // Fallback: buscar el nivel por defecto (is_default=true) del tenant
    const { data: defaultTier, error: defaultError } = await supabase
        .from('loyalty_tiers')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_default', true)
        .single();

    if (defaultError || !defaultTier) {
        // Último recurso: buscar Bronce por nombre
        const { data: bronceTier } = await supabase
            .from('loyalty_tiers')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('name', 'Bronce')
            .single();

        if (bronceTier) {
            return { tier: bronceTier, fallback: true };
        }

        // Si ni siquiera existe Bronce, tomar el primer nivel del tenant por sort_order
        const { data: firstTier } = await supabase
            .from('loyalty_tiers')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('sort_order', { ascending: true })
            .limit(1)
            .single();

        if (firstTier) {
            return { tier: firstTier, fallback: true };
        }

        throw new Error('No se encontró ningún nivel configurado para el tenant');
    }

    return { tier: defaultTier, fallback: true };
}

/**
 * Calcula los puntos a otorgar para un nivel dado.
 * @param {object} tier - Objeto de configuración del nivel (debe tener points_per_visit)
 * @returns {number} Puntos por visita del nivel
 */
function calculatePoints(tier) {
    if (!tier || typeof tier.points_per_visit !== 'number') {
        // Fallback seguro: retornar el valor de Bronce por defecto
        return 3;
    }
    return tier.points_per_visit;
}

module.exports = {
    getDefaultTiers,
    validateTierConfig,
    getTierForCustomer,
    calculatePoints,
    DEFAULT_TENANT_ID,
};
