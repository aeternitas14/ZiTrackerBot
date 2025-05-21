const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

// ========== Constants & Configuration ==========
const BOT_MESSAGES = {
  WELCOME: `
🎪 Step right up, step right up to the Greatest Stalking Show on Earth! 🎭

*adjusts clown nose* 🤡 Ah, another specimen joining our circus of Instagram surveillance!

Your ringmaster of ceremonies presents the commands:
🎭 /track <username> - Add another act to your stalking circus
🎪 /untrack <username> - Drop an act from your show
🤹 /list - See your entire circus of tracked accounts
🎭 /help - When you inevitably get confused (and you will)

Example for the particularly challenged performers: 
/track instagram

Now don't disappoint me, you absolute circus act! 🎪
  `,
  INVALID_USERNAME: "🤡 HONK HONK! That username is as real as my red nose!\n🎪 Try again, you circus amateur: /track instagram",
  NO_START: "🎭 Ladies and gentlemen, we have a clown who hasn't done /start yet! The greatest joke in our circus! 🤡",
  ALREADY_TRACKING: (username) => `🤹‍♂️ Juggling the same account twice, are we? You're ALREADY tracking @${username}.\n🎪 What's next in your circus act?`,
  TRACK_ERROR: "🎭 OOPSIE! The circus tent is falling! Try that trick again, you magnificent disaster! 🤡",
  TRACK_SUCCESS: (username) => `🎪 *throws confetti sarcastically* Congratulations! @${username} is now part of your creepy little circus! 🤡`,
  UNTRACK_SUCCESS: (username) => `🎭 *dramatic circus music* @${username} has escaped your big top of stalking! Freedom at last! 🎪`,
  NOT_TRACKING: (username) => `🤡 HONK HONK! You're trying to untrack @${username} when they weren't even in your circus? That's peak clownery! 🎭`,
  LIST_EMPTY: "🎪 Your circus ring is empty! How refreshingly non-creepy!\n🤡 Use /track when you're ready to start your next act of obsession!",
  LIST_HEADER: "🎭 *drumroll intensifies* 🥁\nPresenting your circus of stalking:\n",
  LIST_FOOTER: "\n🤡 What a show! Your parents must be so proud! 🎪",
  GENERIC_ERROR: "🎭 WHOOPS! Dropped my juggling balls! Try that again, you magnificent disaster! 🤡"
};

// ========== Utility Functions ==========
const logError = (context, error) => {
  console.error(`🎭 Error in ${context}:`, error);
};

const sendBotMessage = async (bot, chatId, message, options = {}) => {
  try {
    return await bot.sendMessage(chatId, message, { parse_mode: 'Markdown', ...options });
  } catch (error) {
    logError('sendBotMessage', error);
    return await bot.sendMessage(chatId, BOT_MESSAGES.GENERIC_ERROR);
  }
};

// ========== Database Operations ==========
const getUserFromDb = async (supabase, telegramId) => {
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('telegram_id', telegramId)
    .single();
  
  if (error && error.code !== 'PGRST116') {
    throw error;
  }
  return { data, error };
};

const createUserInDb = async (supabase, telegramId) => {
  return await supabase
    .from('users')
    .insert({ telegram_id: telegramId })
    .select()
    .single();
};

// ========== Command Handlers ==========
const handleStart = async (bot, msg, supabase) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id.toString();
  
  try {
    const { data: existingUser } = await getUserFromDb(supabase, telegramId);

    if (!existingUser) {
      const { error: insertError } = await createUserInDb(supabase, telegramId);
      if (insertError) throw insertError;
    }

    await sendBotMessage(bot, chatId, BOT_MESSAGES.WELCOME);
  } catch (error) {
    logError('/start', error);
    await sendBotMessage(bot, chatId, BOT_MESSAGES.GENERIC_ERROR);
  }
};

const handleTrack = async (bot, msg, match, supabase) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id.toString();
  const igUsername = match[1]?.trim();

  if (!igUsername || !/^[a-zA-Z0-9._]{1,30}$/.test(igUsername)) {
    await sendBotMessage(bot, chatId, BOT_MESSAGES.INVALID_USERNAME);
    return;
  }

  try {
    const { data: user, error: userError } = await getUserFromDb(supabase, telegramId);
    if (userError || !user) {
      await sendBotMessage(bot, chatId, BOT_MESSAGES.NO_START);
      return;
    }

    const { error: insertError } = await supabase
      .from('tracked_accounts')
      .insert({ user_id: user.id, instagram_username: igUsername });

    if (insertError) {
      if (insertError.message?.includes('duplicate key')) {
        await sendBotMessage(bot, chatId, BOT_MESSAGES.ALREADY_TRACKING(igUsername));
      } else {
        logError('track insert', insertError);
        await sendBotMessage(bot, chatId, BOT_MESSAGES.TRACK_ERROR);
      }
      return;
    }

    await sendBotMessage(bot, chatId, BOT_MESSAGES.TRACK_SUCCESS(igUsername));
  } catch (error) {
    logError('/track', error);
    await sendBotMessage(bot, chatId, BOT_MESSAGES.GENERIC_ERROR);
  }
};

const handleUntrack = async (bot, msg, match, supabase) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id.toString();
  const igUsername = match[1]?.trim();

  if (!igUsername || !/^[a-zA-Z0-9._]{1,30}$/.test(igUsername)) {
    await sendBotMessage(bot, chatId, BOT_MESSAGES.INVALID_USERNAME);
    return;
  }

  try {
    const { data: user, error: userError } = await getUserFromDb(supabase, telegramId);
    if (userError || !user) {
      await sendBotMessage(bot, chatId, BOT_MESSAGES.NO_START);
      return;
    }

    const { data, error: deleteError } = await supabase
      .from('tracked_accounts')
      .delete()
      .eq('user_id', user.id)
      .eq('instagram_username', igUsername);

    if (deleteError) throw deleteError;
    
    if (!data?.length) {
      await sendBotMessage(bot, chatId, BOT_MESSAGES.NOT_TRACKING(igUsername));
      return;
    }

    await sendBotMessage(bot, chatId, BOT_MESSAGES.UNTRACK_SUCCESS(igUsername));
  } catch (error) {
    logError('/untrack', error);
    await sendBotMessage(bot, chatId, BOT_MESSAGES.GENERIC_ERROR);
  }
};

const handleList = async (bot, msg, supabase) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id.toString();

  try {
    const { data: user, error: userError } = await getUserFromDb(supabase, telegramId);
    if (userError || !user) {
      await sendBotMessage(bot, chatId, BOT_MESSAGES.NO_START);
      return;
    }

    const { data: trackedAccounts, error: listError } = await supabase
      .from('tracked_accounts')
      .select('instagram_username')
      .eq('user_id', user.id);

    if (listError) throw listError;

    if (!trackedAccounts?.length) {
      await sendBotMessage(bot, chatId, BOT_MESSAGES.LIST_EMPTY);
      return;
    }

    const accountList = trackedAccounts.map(acc => `🎭 @${acc.instagram_username}`).join('\n');
    const fullMessage = BOT_MESSAGES.LIST_HEADER + accountList + BOT_MESSAGES.LIST_FOOTER;
    await sendBotMessage(bot, chatId, fullMessage);
  } catch (error) {
    logError('/list', error);
    await sendBotMessage(bot, chatId, BOT_MESSAGES.GENERIC_ERROR);
  }
};

// ========== Bot Initialization ==========
const token = process.env.TELEGRAM_BOT_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
const bot = new TelegramBot(token, { polling: true });

// ========== Command Registration ==========
bot.onText(/\/start/, msg => handleStart(bot, msg, supabase));
bot.onText(/\/track(?:\s+(.+))?/, (msg, match) => handleTrack(bot, msg, match, supabase));
bot.onText(/\/untrack(?:\s+(.+))?/, (msg, match) => handleUntrack(bot, msg, match, supabase));
bot.onText(/\/list/, msg => handleList(bot, msg, supabase));

// ========== Future Features (Placeholders) ==========
// TODO: Add /settings command for user preferences
// TODO: Add /notify command to customize notification preferences
// TODO: Add /stats command to show tracking statistics
// TODO: Add /premium command for future premium features
// TODO: Add rate limiting for commands
// TODO: Add user activity logging
// TODO: Add admin commands for monitoring

console.log('🎪 The Greatest Stalking Show on Earth is now running! 🎭'); 