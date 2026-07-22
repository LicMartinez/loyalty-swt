require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000000';

const sql = `
-- Create loyalty_tiers table
CREATE TABLE IF NOT EXISTS loyalty_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    name VARCHAR(50) NOT NULL,
    points_per_visit INTEGER NOT NULL,
    benefit_description VARCHAR(200),
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT chk_points_per_visit CHECK (points_per_visit >= 1 AND points_per_visit <= 1000),
    CONSTRAINT uq_loyalty_tiers_tenant_name UNIQUE (tenant_id, name)
);

-- Create index on tenant_id for efficient lookups
CREATE INDEX IF NOT EXISTS idx_loyalty_tiers_tenant ON loyalty_tiers(tenant_id);

-- Seed default tiers for the single-tenant case
INSERT INTO loyalty_tiers (tenant_id, name, points_per_visit, benefit_description, sort_order, is_default)
VALUES
    ('00000000-0000-0000-0000-000000000000', 'Bronce', 3, NULL, 0, true),
    ('00000000-0000-0000-0000-000000000000', 'Plata', 5, NULL, 1, false),
    ('00000000-0000-0000-0000-000000000000', 'Oro', 10, NULL, 2, false),
    ('00000000-0000-0000-0000-000000000000', 'Platino', 10, 'regalo por visita', 3, false)
ON CONFLICT (tenant_id, name) DO NOTHING;
`;

async function runMigration() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
        console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
        process.exit(1);
    }

    console.log('Running migration: 001_create_loyalty_tiers...');

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
            console.log('✅ Migration 001_create_loyalty_tiers executed successfully!');
            console.log('Result:', result);
        } else {
            console.log('✅ Migration 001_create_loyalty_tiers executed successfully!');
        }
    } catch (err) {
        console.error('⚠️  Could not connect to Supabase:', err.cause?.code || err.message);
        console.log('\nPlease run the following SQL manually in your Supabase Dashboard SQL Editor:');
        console.log('\n' + sql);
    }
}

runMigration();
