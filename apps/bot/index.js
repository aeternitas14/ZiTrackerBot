require('dotenv').config({ path: '../../.env' });
const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

// Bot token from @BotFather
const token = process.env.TELEGRAM_BOT_TOKEN;

// Supabase credentials
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Create a bot instance
const bot = new TelegramBot(token, { polling: true });

// Handle /start command
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id.toString(); // Convert to string for consistency
  
  try {
    // Check if user exists
    const { data: existingUser, error: fetchError } = await supabase
      .from('users')
      .select()
      .eq('telegram_id', telegramId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 means no rows found
      console.error('Error checking user:', fetchError);
      throw fetchError;
    }

    // If user doesn't exist, create them
    if (!existingUser) {
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert({ telegram_id: telegramId })
        .select()
        .single();

      if (insertError) {
        console.error('Error creating user:', insertError);
        throw insertError;
      }

      console.log('New user created:', newUser);
    } else {
      console.log('Existing user found:', existingUser);
    }

    const welcomeMessage = `
Welcome to Instagram Story Tracker Bot! 🎉

I can help you track Instagram stories and notify you when new ones are posted.

Available commands:
/track <username> - Start tracking an Instagram account
/untrack <username> - Stop tracking an account
/list - Show all accounts you're tracking

To get started, use /track followed by an Instagram username.
Example: /track instagram
    `;
    
    bot.sendMessage(chatId, welcomeMessage);

  } catch (error) {
    console.error('Error in /start command:', error);
    bot.sendMessage(chatId, 'Sorry, something went wrong. Please try again later.');
  }
});

// Improved /track command: handle missing/invalid username
bot.onText(/\/track(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id.toString();
  const igUsername = match[1] && match[1].trim();

  console.log('/track command received:', { from: telegramId, igUsername }); // Debug log

  // Instagram usernames: 1-30 chars, letters, numbers, underscores, dots
  const validUsername = igUsername && /^[a-zA-Z0-9._]{1,30}$/.test(igUsername);
  if (!validUsername) {
    bot.sendMessage(chatId, 'Please provide a valid Instagram username.\nExample: /track instagram');
    return;
  }

  try {
    // Get user from Supabase
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_id', telegramId)
      .single();
    if (userError || !user) {
      bot.sendMessage(chatId, 'User not found. Please send /start first.');
      return;
    }

    // Insert tracked account
    const { error: insertError } = await supabase
      .from('tracked_accounts')
      .insert({ user_id: user.id, instagram_username: igUsername });
    if (insertError) {
      if (insertError.message && insertError.message.includes('duplicate key')) {
        bot.sendMessage(chatId, `You are already tracking @${igUsername}.`);
      } else {
        bot.sendMessage(chatId, 'Failed to add tracked account.');
        console.error('Insert error:', insertError);
      }
      return;
    }

    bot.sendMessage(chatId, `Now tracking @${igUsername} for you!`);
  } catch (err) {
    console.error('Error in /track:', err);
    bot.sendMessage(chatId, 'Something went wrong. Please try again.');
  }
});

// Improved /untrack command: handle missing/invalid username
bot.onText(/\/untrack(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id.toString();
  const igUsername = match[1] && match[1].trim();

  // Instagram usernames: 1-30 chars, letters, numbers, underscores, dots
  const validUsername = igUsername && /^[a-zA-Z0-9._]{1,30}$/.test(igUsername);
  if (!validUsername) {
    bot.sendMessage(chatId, 'Please provide a valid Instagram username.\nExample: /untrack instagram');
    return;
  }

  try {
    // Get user from Supabase
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_id', telegramId)
      .single();
    if (userError || !user) {
      bot.sendMessage(chatId, 'User not found. Please send /start first.');
      return;
    }

    // Delete tracked account
    const { data, error: deleteError } = await supabase
      .from('tracked_accounts')
      .delete()
      .eq('user_id', user.id)
      .eq('instagram_username', igUsername);
    if (deleteError) {
      bot.sendMessage(chatId, 'Failed to remove tracked account.');
      console.error('Delete error:', deleteError);
      return;
    }
    if (data.length === 0) {
      bot.sendMessage(chatId, `You are not tracking @${igUsername}.`);
      return;
    }
    bot.sendMessage(chatId, `Stopped tracking @${igUsername}.`);
  } catch (err) {
    console.error('Error in /untrack:', err);
    bot.sendMessage(chatId, 'Something went wrong. Please try again.');
  }
});

// Handle /list command
bot.onText(/\/list/, async (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id.toString();

  console.log('/list command received:', { from: telegramId }); // Debug log

  try {
    // Get user from Supabase
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_id', telegramId)
      .single();

    if (userError || !user) {
      bot.sendMessage(chatId, 'User not found. Please send /start first.');
      return;
    }

    // Get tracked accounts for the user
    const { data: trackedAccounts, error: trackedAccountsError } = await supabase
      .from('tracked_accounts')
      .select('instagram_username')
      .eq('user_id', user.id);

    if (trackedAccountsError) {
      console.error('Error fetching tracked accounts:', trackedAccountsError);
      bot.sendMessage(chatId, 'Could not retrieve your tracked accounts. Please try again.');
      return;
    }

    if (!trackedAccounts || trackedAccounts.length === 0) {
      bot.sendMessage(chatId, 'You are not tracking any accounts yet. Use /track <username> to start.');
      return;
    }

    const accountList = trackedAccounts.map(acc => `@${acc.instagram_username}`).join('\n');
    bot.sendMessage(chatId, `You are currently tracking:\n${accountList}`);

  } catch (err) {
    console.error('Error in /list:', err);
    bot.sendMessage(chatId, 'Something went wrong. Please try again.');
  }
});

// Log when bot is ready
console.log('Bot is running...'); 