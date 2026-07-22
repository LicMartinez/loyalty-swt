require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const sql = `
-- Add cycle configuration columns to loyalty_config
ALTER TABLE public.loyalty_config
  ADD COLUMN IF NOT EXISTS cycle_visits_required INTEGER NOT NULL DEFAULT 10
    CONSTRAINT chk_cycle_visits_required CHECK (cycle_visits_required >= 2 AND cycle_visits_required <= 50),
  ADD COLUMN IF NOT EXISTS cycle_reward_perk_id UUID NULL
    CONSTRAINT fk_cycle_reward_perk REFERENCES public.perks(id) ON DELETE SET NULL;
`;

async function runMigration() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
        console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
        process.exit(1);
    }

    console.log('Running migration: 003_add_cycle_config_to_loyalty_config...');

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
            console.log('✅ Migration 003_add_cycle_config_to_loyalty_config executed successfully!');
            console.log('Result:', result);
        } else {
            console.log('✅ Migration 003_add_cycle_config_to_loyalty_config executed successfully!');
        }
    } catch (err) {
        console.error('⚠️  Could not connect to Supabase:', err.cause?.code || err.message);
        console.log('\nPlease run the following SQL manually in your Supabase Dashboard SQL Editor:');
        console.log('\n' + sql);
    }
}

runMigration();
