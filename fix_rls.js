const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const query = `
    ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users can view their own tenant_users link" ON tenant_users;
    CREATE POLICY "Users can view their own tenant_users link" ON tenant_users FOR SELECT USING (user_id = auth.uid());
    
    ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users can view their tenant" ON tenants;
    CREATE POLICY "Users can view their tenant" ON tenants FOR SELECT USING (id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()) OR subdominio_generico IS NOT NULL);
  `;
  // We can't execute raw SQL through supabase-js directly unless we use rpc.
  // We don't have an rpc for this. Wait, we can use the REST API? No, REST doesn't support DDL.
  console.log("Cannot run DDL from JS SDK.");
}
run().catch(console.error);
