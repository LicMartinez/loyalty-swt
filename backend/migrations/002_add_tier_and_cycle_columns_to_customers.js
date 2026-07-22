require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000000';

const sql = `
-- Step 1: Add columns to customers table
-- tier_id is initially NULLABLE so we can backfill existing rows
ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS tier_id UUID,
    ADD COLUMN IF NOT EXISTS cycle_visits_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cycles_completed INTEGER NOT NULL DEFAULT 0;

-- Add CHECK constraints for non-negative values
ALTER TABLE customers
    ADD CONSTRAINT chk_cycle_visits_count_non_negative CHECK (cycle_visits_count >= 0),
    ADD CONSTRAINT chk_cycles_completed_non_negative CHECK (cycles_completed >= 0);

-- Step 2: Backfill tier_id with the default Bronze tier
UPDATE customers
SET tier_id = (
    SELECT id FROM loyalty_tiers
    WHERE is_default = true
    AND tenant_id = '${DEFAULT_TENANT_ID}'
    LIMIT 1
)
WHERE tier_id IS NULL;

-- Step 3: Set tier_id to NOT NULL after backfill
ALTER TABLE customers
    ALTER COLUMN tier_id SET NOT NULL;

-- Step 4: Add FK constraint tier_id → loyalty_tiers(id)
ALTER TABLE customers
    ADD CONSTRAINT fk_customers_tier_id
    FOREIGN KEY (tier_id) REFERENCES loyalty_tiers(id);

-- Step 5: Add INDEX on customers(tier_id)
CREATE INDEX IF NOT EXISTS idx_customers_tier ON customers(tier_id);
`;

async function runMigration() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
        console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
        process.exit(1);
    }

    console.log('Running migration: 002_add_tier_and_cycle_columns_to_customers...');

    try {
        const response = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': key,
                'Authorization': `Bearer ${key}`
            },
            body: JSON.stringify({ sql })
        });

        if (!response.ok) {
            console.log('rpc exec_sql not available, trying direct SQL endpoint...');

            const sqlResponse = await fetch(`${url}/pg`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': key,
                    'Authorization': `Bearer ${key}`
                },
                body: JSON.stringify({ query: sql })
            });

            if (!sqlResponse.ok) {
                console.log('Direct SQL also not available.');
                console.log('Please run the following SQL in your Supabase Dashboard SQL Editor:');
                console.log('\n' + sql);
                return;
            }
            const result = await sqlResponse.json();
            console.log('✅ Migration 002_add_tier_and_cycle_columns_to_customers executed successfully!');
            console.log('Result:', result);
        } else {
            console.log('✅ Migration 002_add_tier_and_cycle_columns_to_customers executed successfully!');
        }
    } catch (err) {
        console.error('⚠️  Could not connect to Supabase:', err.cause?.code || err.message);
        console.log('\nPlease run the following SQL manually in your Supabase Dashboard SQL Editor:');
        console.log('\n' + sql);
    }
}

runMigration();
