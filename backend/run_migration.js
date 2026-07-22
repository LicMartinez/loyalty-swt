require('dotenv').config();

async function runMigration() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const sql = `
ALTER TABLE customers ADD COLUMN IF NOT EXISTS birthday DATE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

CREATE TABLE IF NOT EXISTS loyalty_config (
    id INTEGER PRIMARY KEY DEFAULT 1,
    points_per_visit INTEGER NOT NULL DEFAULT 10,
    program_name TEXT DEFAULT 'Loyalty PANEM',
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO loyalty_config (id, points_per_visit, program_name) 
VALUES (1, 10, 'Loyalty PANEM') 
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS promotions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL CHECK (type IN ('double_points', 'bonus_points', 'free_perk')),
    value INTEGER DEFAULT 0,
    perk_id UUID REFERENCES perks(id),
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN DEFAULT true,
    days_of_week INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS direct_gifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id),
    type TEXT NOT NULL CHECK (type IN ('points', 'perk')),
    points_amount INTEGER DEFAULT 0,
    perk_id UUID REFERENCES perks(id),
    reason TEXT,
    given_by TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_promotions_dates ON promotions(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_direct_gifts_customer ON direct_gifts(customer_id);
    `;

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
        // Try the pg_net approach or direct SQL via the management API
        console.log('rpc exec_sql not available, trying direct SQL endpoint...');
        
        // Use the Supabase SQL endpoint (available with service role key)
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
            console.log('URL: ' + url + '/project/angmhxtwcfbcpsozkuka/sql');
            console.log('\n' + sql);
            return;
        }
        const result = await sqlResponse.json();
        console.log('Migration result:', result);
    } else {
        console.log('Migration executed successfully!');
    }
}

runMigration();
