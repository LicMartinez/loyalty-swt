'use strict';

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Validates cycle configuration values.
 * @param {object} config - The cycle configuration to validate
 * @param {number} config.cycle_visits_required - Visits needed per cycle (must be integer 2-50)
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateCycleConfig(config) {
  const errors = [];

  if (config === null || config === undefined || typeof config !== 'object') {
    return { valid: false, errors: ['La configuración es requerida'] };
  }

  const value = config.cycle_visits_required;

  if (value === null || value === undefined) {
    errors.push('cycle_visits_required es requerido');
  } else if (!Number.isInteger(value)) {
    errors.push('cycle_visits_required debe ser un número entero');
  } else if (value < 2) {
    errors.push('cycle_visits_required debe ser al menos 2');
  } else if (value > 50) {
    errors.push('cycle_visits_required no puede ser mayor a 50');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Processes a cycle step during check-in.
 * Increments cycle_visits_count, detects completion, creates cycle_reward, and resets count.
 *
 * @param {object} supabase - Supabase client instance
 * @param {string} customerId - Customer UUID
 * @param {object} cycleConfig - Cycle configuration from loyalty_config
 * @param {number} cycleConfig.cycle_visits_required - Visits required to complete a cycle
 * @param {string|null} cycleConfig.cycle_reward_perk_id - UUID of the reward perk, or null
 * @returns {Promise<{ completed: boolean, rewardName: string|null, cycleNumber: number|null, newCycleVisitsCount: number }>}
 */
async function processCycleStep(supabase, customerId, cycleConfig) {
  const { cycle_visits_required, cycle_reward_perk_id } = cycleConfig;

  // Get current customer cycle state
  const { data: customer, error: fetchError } = await supabase
    .from('customers')
    .select('cycle_visits_count, cycles_completed')
    .eq('id', customerId)
    .single();

  if (fetchError || !customer) {
    throw new Error('Cliente no encontrado');
  }

  const newCycleVisitsCount = customer.cycle_visits_count + 1;

  // Check if cycle is completed (also handles edge case where config was reduced)
  if (newCycleVisitsCount >= cycle_visits_required) {
    // Cycle completed
    const newCyclesCompleted = customer.cycles_completed + 1;
    const cycleNumber = newCyclesCompleted;

    // Determine reward
    let rewardName = null;

    if (cycle_reward_perk_id) {
      // Check if the reward perk still exists
      const { data: perk, error: perkError } = await supabase
        .from('perks')
        .select('name, is_active')
        .eq('id', cycle_reward_perk_id)
        .single();

      if (perkError || !perk) {
        // Edge case: perk was deleted - log error, skip reward
        console.error(
          `[cycle-engine] Perk configurado (${cycle_reward_perk_id}) no encontrado para customer ${customerId}. Se omite recompensa.`
        );
      } else {
        rewardName = perk.name;
      }
    }
    // If cycle_reward_perk_id is null → no reward configured, just reset count

    // Reset cycle count and increment cycles_completed
    const { error: updateError } = await supabase
      .from('customers')
      .update({
        cycle_visits_count: 0,
        cycles_completed: newCyclesCompleted
      })
      .eq('id', customerId);

    if (updateError) {
      throw new Error('Error al actualizar conteo de ciclo del cliente');
    }

    // Create cycle_reward record (even if no perk, to track cycle completion)
    const { error: rewardError } = await supabase
      .from('cycle_rewards')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        customer_id: customerId,
        cycle_number: cycleNumber,
        perk_id: rewardName ? cycle_reward_perk_id : null
      });

    if (rewardError) {
      console.error('[cycle-engine] Error al crear cycle_reward:', rewardError.message);
    }

    return {
      completed: true,
      rewardName,
      cycleNumber,
      newCycleVisitsCount: 0
    };
  }

  // Cycle not yet completed - just increment count
  const { error: updateError } = await supabase
    .from('customers')
    .update({ cycle_visits_count: newCycleVisitsCount })
    .eq('id', customerId);

  if (updateError) {
    throw new Error('Error al incrementar conteo de visitas del ciclo');
  }

  return {
    completed: false,
    rewardName: null,
    cycleNumber: null,
    newCycleVisitsCount
  };
}

/**
 * Gets the current cycle progress for a customer.
 *
 * @param {object} supabase - Supabase client instance
 * @param {string} customerId - Customer UUID
 * @param {object} cycleConfig - Cycle configuration from loyalty_config
 * @param {number} cycleConfig.cycle_visits_required - Visits required to complete a cycle
 * @param {string|null} cycleConfig.cycle_reward_perk_id - UUID of the reward perk, or null
 * @returns {Promise<{ visitsCompleted: number, visitsRequired: number, percentage: number, rewardName: string|null }>}
 */
async function getCycleProgress(supabase, customerId, cycleConfig) {
  const { cycle_visits_required, cycle_reward_perk_id } = cycleConfig;

  // Get customer's current cycle visits count
  const { data: customer, error: fetchError } = await supabase
    .from('customers')
    .select('cycle_visits_count')
    .eq('id', customerId)
    .single();

  if (fetchError || !customer) {
    throw new Error('Cliente no encontrado');
  }

  const visitsCompleted = customer.cycle_visits_count;
  const visitsRequired = cycle_visits_required;
  const percentage = Math.floor((visitsCompleted / visitsRequired) * 100);

  // Get reward name if configured
  let rewardName = null;
  if (cycle_reward_perk_id) {
    const { data: perk } = await supabase
      .from('perks')
      .select('name')
      .eq('id', cycle_reward_perk_id)
      .single();

    rewardName = perk?.name || null;
  }

  return {
    visitsCompleted,
    visitsRequired,
    percentage,
    rewardName
  };
}

module.exports = {
  processCycleStep,
  getCycleProgress,
  validateCycleConfig,
  DEFAULT_TENANT_ID
};
