/**
 * Migration 004: Create tier_change_history and cycle_rewards tables
 * 
 * - tier_change_history: audit log for tier changes (manual/system)
 * - cycle_rewards: records of cycle completions and rewards granted
 * 
 * Applied via Supabase MCP migration: create_tier_change_history_and_cycle_rewards
 */

const sql = `
-- Create tier_change_history table
CREATE TABLE tier_change_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id),
  previous_tier_id UUID REFERENCES loyalty_tiers(id),
  new_tier_id UUID NOT NULL REFERENCES loyalty_tiers(id),
  changed_by VARCHAR(100) NOT NULL,
  change_source VARCHAR(20) NOT NULL CHECK (change_source IN ('manual', 'system')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create cycle_rewards table
CREATE TABLE cycle_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id),
  cycle_number INTEGER NOT NULL,
  perk_id UUID REFERENCES perks(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add UNIQUE constraint on cycle_rewards (tenant_id, customer_id, cycle_number)
ALTER TABLE cycle_rewards
  ADD CONSTRAINT uq_cycle_rewards_tenant_customer_cycle UNIQUE (tenant_id, customer_id, cycle_number);

-- Create indexes for tier_change_history
CREATE INDEX idx_tier_change_history_tenant_customer ON tier_change_history(tenant_id, customer_id);
CREATE INDEX idx_tier_change_history_tenant_date ON tier_change_history(tenant_id, created_at);

-- Create indexes for cycle_rewards
CREATE INDEX idx_cycle_rewards_tenant_customer ON cycle_rewards(tenant_id, customer_id);
CREATE INDEX idx_cycle_rewards_tenant_date ON cycle_rewards(tenant_id, created_at);

-- Enable RLS on tier_change_history
ALTER TABLE tier_change_history ENABLE ROW LEVEL SECURITY;

-- Enable RLS on cycle_rewards
ALTER TABLE cycle_rewards ENABLE ROW LEVEL SECURITY;

-- Add service_role policy for tier_change_history
CREATE POLICY "service_role_all_tier_change_history" ON tier_change_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Add service_role policy for cycle_rewards
CREATE POLICY "service_role_all_cycle_rewards" ON cycle_rewards
  FOR ALL TO service_role USING (true) WITH CHECK (true);
`;

module.exports = { sql };
