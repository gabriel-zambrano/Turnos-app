const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data: citas } = await supabase.from('citas').select('id, tenant_id').limit(5);
  console.log("CITAS:", citas);
  const { data: users } = await supabase.auth.admin.listUsers();
  console.log("USERS:", users.users.map(u => u.id));
  const { data: tenants } = await supabase.from('tenants').select('*');
  console.log("TENANTS:", tenants);
  const { data: tenantUsers } = await supabase.from('tenant_users').select('*');
  console.log("TENANT_USERS:", tenantUsers);
}
run().catch(console.error);
