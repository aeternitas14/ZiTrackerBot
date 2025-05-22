const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') }); // Modify this line

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

async function removeTrackedAccountGlobally(instagramUsername) {
  console.log(`Attempting to globally remove ${instagramUsername} from tracked_accounts...`);
  const { data, error } = await supabase
    .from('tracked_accounts')
    .delete()
    .eq('instagram_username', instagramUsername);

  if (error) {
    console.error(`Error globally removing ${instagramUsername}:`, error);
    return { success: false, error };
  }

  if (data && data.length > 0) {
    console.log(`Successfully removed ${data.length} instance(s) of ${instagramUsername} from tracked_accounts.`);
  } else if (data && data.length === 0) {
    // This case might occur if the account was already removed by another process
    // or if the .eq match didn't find anything (which shouldn't happen if we are calling this after a check)
    console.log(`No instances of ${instagramUsername} found to remove. It might have been removed already.`);
  } else {
    // data is null or undefined, implies an issue if no error was thrown
    console.log(`Globally removed ${instagramUsername}. Response data was null/undefined, but no error reported.`);
  }
  return { success: true, count: data ? data.length : 0 };
}

module.exports = { supabase, getTrackedUsersAndAccounts, removeTrackedAccountGlobally }; // Export supabase client and the new function 