// apps/scraper/services/telegram.js
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config({ path: '../../../.env' }); // Adjusted path for .env

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error('Telegram Bot Token is missing. Make sure .env is configured correctly.');
  process.exit(1);
}

// Initialize bot instance for sending messages (no polling needed for scraper)
const bot = new TelegramBot(token);

async function sendTelegramNotification(chatId, message, options = {}) {
  try {
    await bot.sendMessage(chatId, message, options);
    console.log(`Notification sent to chat ID ${chatId}`);
  } catch (error) {
    console.error(`Failed to send notification to chat ID ${chatId}:`, error.message);
  }
}

module.exports = { sendTelegramNotification }; 