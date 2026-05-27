const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data: tu } = await supabase.from('tenant_users').select('*');
  console.log("tenant_users count:", tu?.length);
  
  // Create a client with the anon key and simulate the user login to see what TenantContext sees
  const userClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  // Actually we can't easily login without a password, but we can check if RLS is enabled on tenant_users
  
  const { data: tables } = await supabase.rpc('query_rls').catch(() => ({}));
  console.log("If RPC failed, we just check manually in Supabase. The user says: arreglemos que se haya perdido ningun dato en supabse. este error cuando voy a agenda");
}
run().catch(console.error);
