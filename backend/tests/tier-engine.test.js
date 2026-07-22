import { describe, it, expect, vi } from 'vitest';
import {
    getDefaultTiers,
    validateTierConfig,
    getTierForCustomer,
    calculatePoints,
    DEFAULT_TENANT_ID,
} from '../tier-engine.js';

describe('tier-engine', () => {
    describe('getDefaultTiers()', () => {
        it('retorna exactamente 4 niveles', () => {
            const tiers = getDefaultTiers();
            expect(tiers).toHaveLength(4);
        });

        it('el primer nivel es Bronce con 3 pts y is_default=true', () => {
            const tiers = getDefaultTiers();
            expect(tiers[0]).toEqual({
                name: 'Bronce',
                points_per_visit: 3,
                benefit_description: null,
                sort_order: 0,
                is_default: true,
            });
        });

        it('Plata tiene 5 pts, sort_order=1', () => {
            const tiers = getDefaultTiers();
            expect(tiers[1].name).toBe('Plata');
            expect(tiers[1].points_per_visit).toBe(5);
            expect(tiers[1].sort_order).toBe(1);
        });

        it('Oro tiene 10 pts, sort_order=2', () => {
            const tiers = getDefaultTiers();
            expect(tiers[2].name).toBe('Oro');
            expect(tiers[2].points_per_visit).toBe(10);
            expect(tiers[2].sort_order).toBe(2);
        });

        it('Platino tiene 10 pts, benefit_description="regalo por visita", sort_order=3', () => {
            const tiers = getDefaultTiers();
            expect(tiers[3]).toEqual({
                name: 'Platino',
                points_per_visit: 10,
                benefit_description: 'regalo por visita',
                sort_order: 3,
                is_default: false,
            });
        });

        it('solo Bronce tiene is_default=true', () => {
            const tiers = getDefaultTiers();
            const defaults = tiers.filter(t => t.is_default);
            expect(defaults).toHaveLength(1);
            expect(defaults[0].name).toBe('Bronce');
        });
    });

    describe('validateTierConfig()', () => {
        it('acepta la configuración predeterminada como válida', () => {
            const result = validateTierConfig(getDefaultTiers());
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('rechaza entrada que no es arreglo', () => {
            const result = validateTierConfig('not an array');
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('arreglo');
        });

        it('rechaza arreglo vacío', () => {
            const result = validateTierConfig([]);
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('entre 1 y 10');
        });

        it('rechaza más de 10 niveles', () => {
            const tiers = Array.from({ length: 11 }, (_, i) => ({
                name: `Nivel ${i}`,
                points_per_visit: 5,
            }));
            const result = validateTierConfig(tiers);
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('entre 1 y 10');
        });

        it('rechaza nombre vacío', () => {
            const result = validateTierConfig([{ name: '', points_per_visit: 5 }]);
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('vacío'))).toBe(true);
        });

        it('rechaza nombre con solo espacios', () => {
            const result = validateTierConfig([{ name: '   ', points_per_visit: 5 }]);
            expect(result.valid).toBe(false);
        });

        it('rechaza nombre mayor a 50 caracteres', () => {
            const result = validateTierConfig([{
                name: 'A'.repeat(51),
                points_per_visit: 5,
            }]);
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('50 caracteres'))).toBe(true);
        });

        it('rechaza nombres duplicados (case-insensitive)', () => {
            const result = validateTierConfig([
                { name: 'Oro', points_per_visit: 10 },
                { name: 'oro', points_per_visit: 5 },
            ]);
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('duplicado'))).toBe(true);
        });

        it('rechaza points_per_visit menor a 1', () => {
            const result = validateTierConfig([{ name: 'Test', points_per_visit: 0 }]);
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('1 y 1000'))).toBe(true);
        });

        it('rechaza points_per_visit mayor a 1000', () => {
            const result = validateTierConfig([{ name: 'Test', points_per_visit: 1001 }]);
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('1 y 1000'))).toBe(true);
        });

        it('rechaza points_per_visit no entero', () => {
            const result = validateTierConfig([{ name: 'Test', points_per_visit: 5.5 }]);
            expect(result.valid).toBe(false);
        });

        it('rechaza points_per_visit ausente', () => {
            const result = validateTierConfig([{ name: 'Test' }]);
            expect(result.valid).toBe(false);
        });

        it('acepta un solo nivel válido', () => {
            const result = validateTierConfig([{ name: 'Único', points_per_visit: 1 }]);
            expect(result.valid).toBe(true);
        });

        it('acepta exactamente 10 niveles válidos', () => {
            const tiers = Array.from({ length: 10 }, (_, i) => ({
                name: `Nivel ${i + 1}`,
                points_per_visit: (i + 1) * 100,
            }));
            const result = validateTierConfig(tiers);
            expect(result.valid).toBe(true);
        });
    });

    describe('calculatePoints()', () => {
        it('retorna points_per_visit del nivel', () => {
            expect(calculatePoints({ points_per_visit: 10 })).toBe(10);
            expect(calculatePoints({ points_per_visit: 3 })).toBe(3);
            expect(calculatePoints({ points_per_visit: 1000 })).toBe(1000);
        });

        it('retorna 3 (Bronce default) si tier es null', () => {
            expect(calculatePoints(null)).toBe(3);
        });

        it('retorna 3 (Bronce default) si tier no tiene points_per_visit', () => {
            expect(calculatePoints({})).toBe(3);
            expect(calculatePoints({ name: 'Test' })).toBe(3);
        });
    });

    describe('getTierForCustomer()', () => {
        function createMockSupabase(customerData, tierData, defaultTierData) {
            const mockChain = (data, error = null) => {
                const chain = {
                    select: () => chain,
                    eq: () => chain,
                    order: () => chain,
                    limit: () => chain,
                    single: () => Promise.resolve({ data, error }),
                };
                return chain;
            };

            return {
                from: (table) => {
                    if (table === 'customers') {
                        return mockChain(customerData);
                    }
                    if (table === 'loyalty_tiers') {
                        // We need more nuanced mock for multiple calls
                        let callCount = 0;
                        const chain = {
                            select: () => chain,
                            eq: (col, val) => {
                                if (col === 'id' && tierData) {
                                    // Looking up specific tier by id
                                    return {
                                        ...chain,
                                        single: () => Promise.resolve({ data: tierData, error: null }),
                                    };
                                }
                                if (col === 'is_default' && val === true) {
                                    return {
                                        ...chain,
                                        single: () => Promise.resolve({
                                            data: defaultTierData || null,
                                            error: defaultTierData ? null : { message: 'not found' },
                                        }),
                                    };
                                }
                                return chain;
                            },
                            order: () => chain,
                            limit: () => chain,
                            single: () => Promise.resolve({ data: tierData, error: tierData ? null : { message: 'not found' } }),
                        };
                        return chain;
                    }
                    return mockChain(null, { message: 'unknown table' });
                },
            };
        }

        it('retorna el nivel del cliente cuando es válido', async () => {
            const tierObj = { id: 'tier-1', name: 'Oro', points_per_visit: 10 };
            const supabase = {
                from: (table) => {
                    const chain = {
                        select: () => chain,
                        eq: (col, val) => {
                            if (table === 'customers' && col === 'id') {
                                return { ...chain, single: () => Promise.resolve({ data: { tier_id: 'tier-1', tenant_id: DEFAULT_TENANT_ID }, error: null }) };
                            }
                            if (table === 'loyalty_tiers' && col === 'id' && val === 'tier-1') {
                                return { ...chain, single: () => Promise.resolve({ data: tierObj, error: null }) };
                            }
                            return chain;
                        },
                        single: () => Promise.resolve({ data: null, error: null }),
                    };
                    return chain;
                },
            };

            const result = await getTierForCustomer(supabase, 'customer-1');
            expect(result.tier).toEqual(tierObj);
            expect(result.fallback).toBe(false);
        });

        it('usa fallback al default tier cuando tier_id es inválido', async () => {
            const defaultTier = { id: 'tier-default', name: 'Bronce', points_per_visit: 3, is_default: true };
            const supabase = {
                from: (table) => {
                    const chain = {
                        select: () => chain,
                        eq: (col, val) => {
                            if (table === 'customers' && col === 'id') {
                                return { ...chain, single: () => Promise.resolve({ data: { tier_id: 'invalid-tier', tenant_id: DEFAULT_TENANT_ID }, error: null }) };
                            }
                            if (table === 'loyalty_tiers' && col === 'id' && val === 'invalid-tier') {
                                return { ...chain, single: () => Promise.resolve({ data: null, error: { message: 'not found' } }) };
                            }
                            if (table === 'loyalty_tiers' && col === 'is_default' && val === true) {
                                return { ...chain, single: () => Promise.resolve({ data: defaultTier, error: null }) };
                            }
                            return chain;
                        },
                        order: () => chain,
                        limit: () => chain,
                        single: () => Promise.resolve({ data: null, error: { message: 'not found' } }),
                    };
                    return chain;
                },
            };

            const result = await getTierForCustomer(supabase, 'customer-1');
            expect(result.tier).toEqual(defaultTier);
            expect(result.fallback).toBe(true);
        });

        it('lanza error si el cliente no existe', async () => {
            const supabase = {
                from: () => {
                    const chain = {
                        select: () => chain,
                        eq: () => ({ ...chain, single: () => Promise.resolve({ data: null, error: { message: 'not found' } }) }),
                        single: () => Promise.resolve({ data: null, error: { message: 'not found' } }),
                    };
                    return chain;
                },
            };

            await expect(getTierForCustomer(supabase, 'nonexistent')).rejects.toThrow('Cliente no encontrado');
        });
    });
});
