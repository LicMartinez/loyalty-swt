require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const sql = `
-- Productos de cover (boletos de acceso) y media del kiosco por tenant

CREATE TABLE IF NOT EXISTS public.cover_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cover_products_tenant ON public.cover_products(tenant_id);

CREATE TABLE IF NOT EXISTS public.cover_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.cover_products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  printed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cover_tickets_tenant ON public.cover_tickets(tenant_id);

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS kiosk_media JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.cover_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cover_tickets ENABLE ROW LEVEL SECURITY;
`;

async function runMigration() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
        console.log(sql);
        process.exit(1);
    }
    console.log('Running migration: 006_cover_products_and_kiosk_media...');
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
        console.log('Migration 006 executed successfully.');
    } catch (err) {
        console.error('Could not connect:', err.message);
        console.log('\nPlease run this SQL in the Supabase Dashboard:');
        console.log('\n' + sql);
    }
}

runMigration();
