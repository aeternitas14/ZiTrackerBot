const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '../../../.env' }); // Adjusted path for .env

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase URL or Key is missing. Make sure .env is configured correctly.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function getTrackedUsersAndAccounts() {
  console.log('Fetching tracked accounts and associated user Telegram IDs...');
  const { data, error } = await supabase
    .from('tracked_accounts')
    .select(`
      instagram_username,
      users ( telegram_id )
    `);

  if (error) {
    console.error('Error fetching tracked accounts:', error);
    return [];
  }
  // The data will be like: [{ instagram_username: 'xxx', users: { telegram_id: '123' } }, ...]
  // We need to handle cases where users might be null if the join fails or RLS prevents access, though with current setup it should be fine.
  return data.filter(item => item.users).map(item => ({ // Ensure users object is not null
    instagramUsername: item.instagram_username,
    telegramId: item.users.telegram_id
  }));
}

module.exports = { supabase, getTrackedUsersAndAccounts }; // Export supabase client and the new function 