require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function migrate() {
    console.log('Running migrations...');

    // Check if birthday column exists
    const { data, error: testErr } = await supabase
        .from('customers')
        .select('birthday')
        .limit(1);
    
    if (testErr && testErr.message.includes('birthday')) {
        console.log('❌ birthday column missing');
    } else {
        console.log('✅ birthday column exists');
    }

    // Check if loyalty_config exists
    const { error: configErr } = await supabase.from('loyalty_config').select('*').limit(1);
    if (configErr) {
        console.log('❌ loyalty_config table missing');
    } else {
        console.log('✅ loyalty_config table exists');
    }

    // Check if promotions exists
    const { error: promoErr } = await supabase.from('promotions').select('*').limit(1);
    if (promoErr) {
        console.log('❌ promotions table missing');
    } else {
        console.log('✅ promotions table exists');
    }

    // Check if direct_gifts exists
    const { error: giftsErr } = await supabase.from('direct_gifts').select('*').limit(1);
    if (giftsErr) {
        console.log('❌ direct_gifts table missing');
    } else {
        console.log('✅ direct_gifts table exists');
    }

    // Check if admin_sessions exists
    const { error: sessErr } = await supabase.from('admin_sessions').select('*').limit(1);
    if (sessErr) {
        console.log('❌ admin_sessions table missing');
    } else {
        console.log('✅ admin_sessions table exists');
    }

    console.log('\n--- SQL to run in Supabase Dashboard SQL Editor ---\n');
    console.log(`
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
    days_of_week INTEGER[] DEFAULT '{}'::INTEGER[],
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
    `);
}

migrate();
