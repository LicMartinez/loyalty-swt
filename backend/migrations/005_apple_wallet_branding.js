require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const sql = `
-- Branding visual de Apple/Google Wallet por tenant
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS wallet_strip_url TEXT,
  ADD COLUMN IF NOT EXISTS wallet_icon_url TEXT,
  ADD COLUMN IF NOT EXISTS wallet_fg_color VARCHAR(10),
  ADD COLUMN IF NOT EXISTS wallet_label_color VARCHAR(10);

-- Bucket público para logos/banners de marca (idempotente)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tenant-branding',
  'tenant-branding',
  true,
  2097152,
  ARRAY['image/png', 'image/jpeg']
)
ON CONFLICT (id) DO NOTHING;
`;

async function runMigration() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
        console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
        process.exit(1);
    }

    console.log('Running migration: 005_apple_wallet_branding...');

    try {
        const response = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                apikey: key,
                Authorization: `Bearer ${key}`,
            },
            body: JSON.stringify({ sql }),
        });

        if (!response.ok) {
            console.log('rpc exec_sql not available.');
            console.log('Please run the following SQL in your Supabase Dashboard SQL Editor:');
            console.log('\n' + sql);
            return;
        }
        console.log('✅ Migration 005_apple_wallet_branding executed successfully!');
    } catch (err) {
        console.error('⚠️  Could not connect to Supabase:', err.cause?.code || err.message);
        console.log('\nPlease run the following SQL manually in your Supabase Dashboard SQL Editor:');
        console.log('\n' + sql);
    }
}

runMigration();
