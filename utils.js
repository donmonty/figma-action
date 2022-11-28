require('dotenv').config();
const supabase = require('@supabase/supabase-js');

module.exports.getSupaServiceClient = async function () {
  return supabase.createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
  );
};