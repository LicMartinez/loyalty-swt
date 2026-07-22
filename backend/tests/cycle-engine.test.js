import { describe, it, expect, vi } from 'vitest';
import { validateCycleConfig, processCycleStep, getCycleProgress } from '../cycle-engine.js';

describe('cycle-engine', () => {
  describe('validateCycleConfig', () => {
    it('accepts valid config with cycle_visits_required = 2 (min)', () => {
      const result = validateCycleConfig({ cycle_visits_required: 2 });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('accepts valid config with cycle_visits_required = 50 (max)', () => {
      const result = validateCycleConfig({ cycle_visits_required: 50 });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('accepts valid config with cycle_visits_required = 10 (default)', () => {
      const result = validateCycleConfig({ cycle_visits_required: 10 });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects cycle_visits_required < 2', () => {
      const result = validateCycleConfig({ cycle_visits_required: 1 });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('rejects cycle_visits_required > 50', () => {
      const result = validateCycleConfig({ cycle_visits_required: 51 });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('rejects non-integer cycle_visits_required', () => {
      const result = validateCycleConfig({ cycle_visits_required: 5.5 });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('rejects null config', () => {
      const result = validateCycleConfig(null);
      expect(result.valid).toBe(false);
    });

    it('rejects undefined config', () => {
      const result = validateCycleConfig(undefined);
      expect(result.valid).toBe(false);
    });

    it('rejects missing cycle_visits_required', () => {
      const result = validateCycleConfig({});
      expect(result.valid).toBe(false);
    });
  });

  describe('processCycleStep', () => {
    function createMockSupabase(customer, perk = null, insertError = null) {
      const mockFrom = vi.fn((table) => {
        if (table === 'customers') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({
                  data: customer,
                  error: null
                })
              })
            }),
            update: () => ({
              eq: () => Promise.resolve({ error: null })
            })
          };
        }
        if (table === 'perks') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({
                  data: perk,
                  error: perk ? null : { message: 'not found' }
                })
              })
            })
          };
        }
        if (table === 'cycle_rewards') {
          return {
            insert: () => Promise.resolve({ error: insertError })
          };
        }
        return {};
      });
      return { from: mockFrom };
    }

    it('increments cycle count when not yet complete', async () => {
      const customer = { cycle_visits_count: 3, cycles_completed: 0, tenant_id: '00000000-0000-0000-0000-000000000000' };
      const supabase = createMockSupabase(customer);

      const result = await processCycleStep(supabase, 'cust-1', {
        cycle_visits_required: 10,
        cycle_reward_perk_id: null
      });

      expect(result.completed).toBe(false);
      expect(result.newCycleVisitsCount).toBe(4);
      expect(result.rewardName).toBeNull();
      expect(result.cycleNumber).toBeNull();
    });

    it('completes cycle when count reaches required', async () => {
      const customer = { cycle_visits_count: 9, cycles_completed: 2, tenant_id: '00000000-0000-0000-0000-000000000000' };
      const perk = { name: 'Café Gratis', is_active: true };
      const supabase = createMockSupabase(customer, perk);

      const result = await processCycleStep(supabase, 'cust-1', {
        cycle_visits_required: 10,
        cycle_reward_perk_id: 'perk-uuid'
      });

      expect(result.completed).toBe(true);
      expect(result.newCycleVisitsCount).toBe(0);
      expect(result.rewardName).toBe('Café Gratis');
      expect(result.cycleNumber).toBe(3);
    });

    it('completes cycle when count exceeds required (config reduced)', async () => {
      const customer = { cycle_visits_count: 8, cycles_completed: 1, tenant_id: '00000000-0000-0000-0000-000000000000' };
      const perk = { name: 'Café Gratis', is_active: true };
      const supabase = createMockSupabase(customer, perk);

      // Config was reduced to 5, customer already has 8
      const result = await processCycleStep(supabase, 'cust-1', {
        cycle_visits_required: 5,
        cycle_reward_perk_id: 'perk-uuid'
      });

      expect(result.completed).toBe(true);
      expect(result.newCycleVisitsCount).toBe(0);
      expect(result.rewardName).toBe('Café Gratis');
      expect(result.cycleNumber).toBe(2);
    });

    it('completes cycle without reward when no perk configured', async () => {
      const customer = { cycle_visits_count: 9, cycles_completed: 0, tenant_id: '00000000-0000-0000-0000-000000000000' };
      const supabase = createMockSupabase(customer);

      const result = await processCycleStep(supabase, 'cust-1', {
        cycle_visits_required: 10,
        cycle_reward_perk_id: null
      });

      expect(result.completed).toBe(true);
      expect(result.newCycleVisitsCount).toBe(0);
      expect(result.rewardName).toBeNull();
      expect(result.cycleNumber).toBe(1);
    });

    it('completes cycle without reward when configured perk is deleted', async () => {
      const customer = { cycle_visits_count: 9, cycles_completed: 0, tenant_id: '00000000-0000-0000-0000-000000000000' };
      // perk = null simulates deleted perk
      const supabase = createMockSupabase(customer, null);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await processCycleStep(supabase, 'cust-1', {
        cycle_visits_required: 10,
        cycle_reward_perk_id: 'deleted-perk-uuid'
      });

      expect(result.completed).toBe(true);
      expect(result.newCycleVisitsCount).toBe(0);
      expect(result.rewardName).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('throws when customer not found', async () => {
      const supabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: null, error: { message: 'not found' } })
            })
          })
        })
      };

      await expect(
        processCycleStep(supabase, 'nonexistent', { cycle_visits_required: 10, cycle_reward_perk_id: null })
      ).rejects.toThrow('Cliente no encontrado');
    });
  });

  describe('getCycleProgress', () => {
    function createMockSupabase(customer, perk = null) {
      return {
        from: (table) => {
          if (table === 'customers') {
            return {
              select: () => ({
                eq: () => ({
                  single: () => Promise.resolve({ data: customer, error: null })
                })
              })
            };
          }
          if (table === 'perks') {
            return {
              select: () => ({
                eq: () => ({
                  single: () => Promise.resolve({ data: perk, error: perk ? null : { message: 'not found' } })
                })
              })
            };
          }
          return {};
        }
      };
    }

    it('returns correct progress for mid-cycle customer', async () => {
      const customer = { cycle_visits_count: 4 };
      const perk = { name: 'Café Gratis' };
      const supabase = createMockSupabase(customer, perk);

      const result = await getCycleProgress(supabase, 'cust-1', {
        cycle_visits_required: 10,
        cycle_reward_perk_id: 'perk-uuid'
      });

      expect(result.visitsCompleted).toBe(4);
      expect(result.visitsRequired).toBe(10);
      expect(result.percentage).toBe(40);
      expect(result.rewardName).toBe('Café Gratis');
    });

    it('returns 0% for a customer at the start of a cycle', async () => {
      const customer = { cycle_visits_count: 0 };
      const supabase = createMockSupabase(customer);

      const result = await getCycleProgress(supabase, 'cust-1', {
        cycle_visits_required: 10,
        cycle_reward_perk_id: null
      });

      expect(result.visitsCompleted).toBe(0);
      expect(result.visitsRequired).toBe(10);
      expect(result.percentage).toBe(0);
      expect(result.rewardName).toBeNull();
    });

    it('returns null rewardName when no perk configured', async () => {
      const customer = { cycle_visits_count: 7 };
      const supabase = createMockSupabase(customer);

      const result = await getCycleProgress(supabase, 'cust-1', {
        cycle_visits_required: 10,
        cycle_reward_perk_id: null
      });

      expect(result.rewardName).toBeNull();
    });

    it('uses floor for percentage calculation', async () => {
      const customer = { cycle_visits_count: 1 };
      const supabase = createMockSupabase(customer, { name: 'Reward' });

      const result = await getCycleProgress(supabase, 'cust-1', {
        cycle_visits_required: 3,
        cycle_reward_perk_id: 'perk-uuid'
      });

      // 1/3 * 100 = 33.33 → floor → 33
      expect(result.percentage).toBe(33);
    });

    it('throws when customer not found', async () => {
      const supabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: null, error: { message: 'not found' } })
            })
          })
        })
      };

      await expect(
        getCycleProgress(supabase, 'nonexistent', { cycle_visits_required: 10, cycle_reward_perk_id: null })
      ).rejects.toThrow('Cliente no encontrado');
    });
  });
});
