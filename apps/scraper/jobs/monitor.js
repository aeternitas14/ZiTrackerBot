// apps/scraper/jobs/monitor.js
console.log('Monitor job loaded'); 

const { getTrackedUsersAndAccounts, removeTrackedAccountGlobally } = require('../services/supabase');
const { sendTelegramNotification } = require('../services/telegram');
// We will import checkUserStories & getInstagramHeaders from index.js, which now exports them
// This creates a slight circular dependency if monitor.js is imported by index.js at the top level before index.js exports are ready.
// We'll manage this by ensuring index.js calls startMonitoring after its own setup.

const MONITORING_INTERVAL_MS = 2 * 60 * 1000; // Check every 2 minutes
const processedStoryIds = new Set(); // In-memory set to track notified stories (clears on restart)

// For tracking consecutive failures for invalid/inaccessible users
const consecutiveFailureCounts = {};
const MAX_CONSECUTIVE_FAILURES = 3; // Remove after 3 consecutive "user not found" errors

let igPage = null;
let checkUserStoriesFn = null;
let getInstagramHeadersFn = null;

async function runChecks() {
  if (!igPage || igPage.isClosed()) {
    console.error('Instagram page is not available or closed. Monitoring paused.');
    // Optionally, try to re-login or signal main process to handle
    return;
  }

  console.log(`[${new Date().toISOString()}] Running story checks...`);
  let trackedItems = await getTrackedUsersAndAccounts();

  if (!trackedItems || trackedItems.length === 0) {
    console.log('No accounts currently tracked. Skipping checks.');
    return;
  }

  // Group by instagramUsername to avoid checking the same profile multiple times if tracked by multiple users
  const accountsToFetch = {};
  for (const item of trackedItems) {
    if (!accountsToFetch[item.instagramUsername]) {
      accountsToFetch[item.instagramUsername] = [];
    }
    accountsToFetch[item.instagramUsername].push(item.telegramId);
  }

  for (const username in accountsToFetch) {
    console.log(`Checking stories for ${username}...`);
    try {
      const storyResult = await checkUserStoriesFn(igPage, username);

      // Handle "User not found or profile inaccessible" error from checkUserStories
      if (storyResult.error && storyResult.error.includes('User not found or profile inaccessible')) {
        consecutiveFailureCounts[username] = (consecutiveFailureCounts[username] || 0) + 1;
        console.warn(`User ${username} not found (attempt ${consecutiveFailureCounts[username]}/${MAX_CONSECUTIVE_FAILURES}).`);

        if (consecutiveFailureCounts[username] >= MAX_CONSECUTIVE_FAILURES) {
          console.log(`User ${username} has failed ${MAX_CONSECUTIVE_FAILURES} consecutive checks. Attempting global removal...`);
          const removalResult = await removeTrackedAccountGlobally(username);
          if (removalResult.success) {
            console.log(`Successfully initiated global removal for ${username}. ${removalResult.count} entries targeted.`);
            // No longer need to track failures for this user as it should be gone
            delete consecutiveFailureCounts[username];
            // Remove from current accountsToFetch to avoid further processing this cycle
            delete accountsToFetch[username]; 
            // Optionally, re-fetch trackedItems or filter it here to reflect immediate removal
            // For simplicity, we'll let it be naturally excluded in the next full runChecks cycle
          } else {
            console.error(`Failed to globally remove ${username}. It will be retried. Error: ${removalResult.error}`);
            // Keep in consecutiveFailureCounts to retry removal
          }
        }
        continue; // Skip to the next username
      } else if (storyResult.error) {
        // Some other error occurred during checkUserStories
        console.error(`An error occurred checking stories for ${username} (not a user-not-found issue): ${storyResult.error}`);
        // Reset failure count for this specific error type, as it might be transient (e.g. network glitch)
        consecutiveFailureCounts[username] = 0; 
      } else {
        // Successfully checked (even if no stories), reset failure count
        consecutiveFailureCounts[username] = 0;
      }
      
      if (storyResult.hasStories && storyResult.items.length > 0) {
        for (const story of storyResult.items) {
          const storyId = `${username}_${story.id}`; // Use unique story ID from Instagram
          
          if (!processedStoryIds.has(storyId)) {
            console.log(`New story found for ${username}: Story ID ${story.id}`);
            const subscribers = accountsToFetch[username];
            
            // TODO: Task #14: Download story media
            // TODO: Task #15: Upload to file storage
            // TODO: Task #16: Add story log entry to Supabase (for persistence across restarts)

            // Sarcastic notification message
            const storyTimestamp = new Date(story.timestamp * 1000);
            const storyTime = storyTimestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute:'2-digit', hour12: true });
            const storyDate = storyTimestamp.toLocaleDateString('en-US');

            const message = `Psst! Your "target" @${username} just did something utterly predictable: they posted a story. 🙄\nIt's a ${story.type}, posted around ${storyTime} on ${storyDate}.\nDon't you have anything better to do than wait for this? Well, anyway, there's your "intel".`;
            // Add media URL once downloaded & uploaded: \n[View Story](${story.url}) - direct link for now, will be storage link

            for (const telegramId of subscribers) {
              console.log(`Notifying user ${telegramId} about new story from ${username} (Story ID: ${story.id})`);
              await sendTelegramNotification(telegramId, message, { parse_mode: 'Markdown' });
            }
            processedStoryIds.add(storyId); // Mark as processed for this session
          } else {
            // console.log(`Story ID ${storyId} for ${username} already processed this session.`);
          }
        }
      } else if (!storyResult.error) { // Only log "no new stories" if there wasn't an error already handled
        // console.log(`No new stories for ${username}.`);
      }
    } catch (error) {
      console.error(`Critical error during story check loop for ${username}:`, error);
       // Reset failure count as this is a loop error, not specific to user validity
      consecutiveFailureCounts[username] = 0; 
    }
    // Only delay if the account was processed (not skipped due to removal queue)
    if (accountsToFetch[username]) {
        await igPage.waitForTimeout(Math.random() * 2000 + 1000); // Small delay between checking different profiles
    }
  }
  console.log('Finished current round of story checks.');
}

async function startMonitoring(page, checkUserStoriesFunction, getInstagramHeadersFunction) {
  console.log('Initializing monitor...');
  igPage = page;
  checkUserStoriesFn = checkUserStoriesFunction;
  getInstagramHeadersFn = getInstagramHeadersFunction; // Though not directly used in monitor.js, it's part of the core fns

  if (!igPage || typeof checkUserStoriesFn !== 'function') {
    console.error('Monitor cannot start: Instagram page or checkUserStories function not provided.');
    return;
  }

  console.log(`Monitoring started. Checks will run every ${MONITORING_INTERVAL_MS / 1000 / 60} minutes.`);
  
  // Initial check
  await runChecks();
  
  // Schedule subsequent checks
  setInterval(runChecks, MONITORING_INTERVAL_MS);

  // Graceful shutdown handling (basic example)
  process.on('SIGINT', async () => {
    console.log('SIGINT received. Shutting down monitor and browser...');
    if (igPage && igPage.browser()) {
        await igPage.browser().close();
    }
    process.exit(0);
  });
}

module.exports = { startMonitoring }; 