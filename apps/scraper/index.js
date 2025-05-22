require('dotenv').config({ path: '../../.env' });
console.log('Password loaded from .env:', process.env.INSTAGRAM_PASSWORD); // Temporary debug line
const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');
const { startMonitoring } = require('./jobs/monitor'); // Import the monitor

const INSTAGRAM_USERNAME = process.env.INSTAGRAM_USERNAME;
const INSTAGRAM_PASSWORD = process.env.INSTAGRAM_PASSWORD;
// const TARGET_PROFILE_URL = 'https://www.instagram.com/instagram/'; // No longer needed for single profile

let browser; // Make browser instance accessible
let page;    // Make page instance accessible

// START OF FUNCTION DEFINITIONS

async function waitForSuccessfulLogin(page) {
  console.log('Checking for successful login...');
  
  // Wait for any of these selectors that indicate successful login
  const successSelectors = [
    'svg[aria-label="Search"]',
    'svg[aria-label="Home"]',
    'a[href="/direct/inbox/"]',
    '[aria-label="Home"][role="link"]',
    'a[href="/explore/"]' // Added another common selector
  ];
  
  for (const selector of successSelectors) {
    try {
      await page.waitForSelector(selector, { timeout: 5000 });
      console.log(`Login confirmed via selector: ${selector}`);
      return true;
    } catch (e) {
      // console.log(`Selector ${selector} not found, trying next...`); // Too noisy for general use
    }
  }
  console.error('Could not confirm successful login with any known selectors. Current URL:', page.url());
  throw new Error('Could not confirm successful login with any known selectors');
}

async function handlePostLoginDialogs(page) {
  const dialogs = [
    {
      type: 'Save Login Info',
      detect: async () => {
        const onetapVisible = page.url().includes('/onetap/');
        // Using text-matches for case-insensitive matching and broader text
        const buttonSaveInfoVisible = await page.locator('button:text-matches("Save", "i")') 
                                           .or(page.locator('div[role="button"]:text-matches("Save Info", "i")'))
                                           .first().isVisible({ timeout: 3500 });
        // Check for a common dialog structure as a fallback, looking for a dialog with "Not Now" and "Save" type buttons
        const dialogWrapperVisible = await page.locator('div[role="dialog"]:has(button:text-matches("Not Now", "i"))')
                                           .and(page.locator('div[role="dialog"]:has(button:text-matches("Save", "i"))'))
                                           .isVisible({timeout: 3500});
        console.log(`Save Info Dialog Detection: onetapURL=${onetapVisible}, saveButtonVisible=${buttonSaveInfoVisible}, dialogWrapperVisible=${dialogWrapperVisible}`);
        return onetapVisible || buttonSaveInfoVisible || dialogWrapperVisible;
      },
      handle: async () => {
        console.log('Handling "Save Login Info" dialog...');
        try {
          // Try various selectors for "Not Now", case-insensitive and as a div role button
          const notNowButton = page.locator('button:text-matches("Not Now", "i")')
                                 .or(page.locator('div[role="button"]:text-matches("Not Now", "i")'))
                                 .or(page.locator('button:has-text("Not now")')) // Common alternative casing
                                 .first(); // Take the first one found

          if (await notNowButton.isVisible({ timeout: 3000 })) {
            console.log('"Not Now" button found for Save Info, attempting click...');
            await notNowButton.click({ force: true, timeout: 5000 }); // Added force and timeout to click
            console.log('Clicked "Not Now" on Save Info dialog.');
            await page.waitForTimeout(1500); // Increased wait after click
            return true;
          } else {
            console.log('"Not Now" button for Save Info dialog was not found or not visible within timeout.');
            // As a last resort, if we detected the dialog but can't click "Not Now", we could try to press Escape
            console.log('Attempting to press Escape key to dismiss dialog.');
            await page.keyboard.press('Escape');
            await page.waitForTimeout(1000); // Increased wait
            // Check if URL changed away from onetap, indicating success
            if (!page.url().includes('/onetap/')) {
                console.log('Escape key likely dismissed the dialog.');
                return true;
            } else {
                console.warn('Escape key did not seem to dismiss the onetap dialog.');
                return false; // Indicate failure if escape didn't navigate away
            }
          }
        } catch (e) {
          console.error('Error clicking "Not Now" for Save Info or pressing Escape:', e.message);
          // Take a screenshot if we fail to handle it
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const screenshotPath = `error_handleSaveInfo_${timestamp}.png`;
          try { 
            await page.screenshot({ path: screenshotPath }); 
            console.log('Screenshot on SaveInfo handle error:', screenshotPath); 
          } catch (ssError) { 
            console.error('Failed to take screenshot on SaveInfo handle error:', ssError);
          }
        }
        return false;
      }
    },
    {
      type: 'Turn On Notifications',
      detect: async () => page.locator('div[role="dialog"] button:has-text("Not Now")').or(page.locator('div[role="dialog"] button:has-text("Turn On")')).isVisible({ timeout: 3000 }),
      handle: async () => {
        console.log('Handling "Turn On Notifications" dialog...');
        try {
          const notNowButton = page.locator('div[role="dialog"] button:has-text("Not Now")');
           if (await notNowButton.first().isVisible({timeout:2000})){
            await notNowButton.first().click();
            console.log('Clicked "Not Now" on Notifications dialog.');
            return true;
           } else {
            console.log('"Not Now" button not found for Notifications dialog.');
           }
        } catch (e) {
          console.log('Could not handle notifications dialog:', e.message);
          return false;
        }
      }
    }
  ];

  for (const dialog of dialogs) {
    try {
        if (await dialog.detect()) {
            console.log(`Detected ${dialog.type} dialog`);
            await dialog.handle();
            await page.waitForTimeout(1000); // Wait for dialog to clear
        }
    } catch(e) {
        // console.log(`Error during ${dialog.type} detection/handling: ${e.message}`); // Can be noisy
    }
  }
}

async function getInstagramHeaders(page) {
  console.log('Getting Instagram headers...');
  const cookies = await page.context().cookies();
  const cookieString = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
  
  // const xIgAppId = await page.evaluate(() => {
  //   const appIdMeta = document.querySelector('meta[property="al:ios:app_store_id"]');
  //   return appIdMeta ? appIdMeta.content : '936619743392459'; // Default fallback
  // });

  return {
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'origin': 'https://www.instagram.com',
    'referer': 'https://www.instagram.com/',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
    'x-asbd-id': '129477', // Common header, can be kept or reviewed
    'x-csrftoken': cookies.find(c => c.name === 'csrftoken')?.value || '',
    'x-ig-app-id': '936619743392459', // Hardcoded as per suggestion
    'x-ig-www-claim': await page.evaluate(() => (window._sharedData?.rollout_hash || Math.random().toString())),
    'x-requested-with': 'XMLHttpRequest',
    'cookie': cookieString
  };
}

async function checkUserStories(currentPage, username) { // Renamed page to currentPage to avoid conflict
  console.log(`Checking stories for user: ${username} using page: ${currentPage.url()}`);
  
  try {
    // Ensure we are on a valid Instagram page, not login page
    if (currentPage.url().includes('/login/')) {
        console.warn('Attempted to check stories while on login page. Login might have failed or session expired.');
        // Attempt a soft navigation to home to see if it auto-logs-in or redirect correctly
        await currentPage.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 15000 });
        if (currentPage.url().includes('/login/')) {
            throw new Error('Still on login page after attempting to navigate away. Login required.');
        }
    }

    const igHeaders = await getInstagramHeaders(currentPage);

    // Get User ID first
    const userInfoApiUrl = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`;
    console.log('Fetching user info from:', userInfoApiUrl);
    const userInfoResponse = await currentPage.evaluate(async ({url, headers}) => {
        const response = await fetch(url, { headers });
        const text = await response.text(); // Get response as text first
        try {
            return JSON.parse(text); // Try to parse as JSON
        } catch (e) {
            // If JSON parsing fails, it might be an HTML page (e.g., user not found)
            // Return an object indicating this, so the calling code can handle it
            return { error: 'Failed to parse JSON. Might be HTML.', htmlContent: text.substring(0, 200) }; 
        }
    }, { url: userInfoApiUrl, headers: igHeaders });

    // Check if we got an error object from evaluate (meaning JSON parsing failed)
    if (userInfoResponse.error) {
        console.warn(`Failed to get valid JSON for ${username}. Instagram might have returned HTML (e.g., user not found or page requires login). Details: ${userInfoResponse.error} - HTML starts: ${userInfoResponse.htmlContent}`);
        // Return a specific structure indicating user not found or error, so monitor can skip
        return {
            hasStories: false,
            count: 0,
            items: [],
            error: `User ${username} not found or profile inaccessible.`
        };
    }

    if (!userInfoResponse.data?.user?.id) {
      console.error('User ID not found in API response for', username, 'Response:', userInfoResponse);
      throw new Error(`Could not find user ID for ${username}. User might be private, not exist, or API structure changed.`);
    }
    const userId = userInfoResponse.data.user.id;
    console.log(`Found user ID for ${username}: ${userId}`);

    // Get Stories using User ID
    const storiesApiUrl = `https://www.instagram.com/api/v1/feed/reels_media/?reel_ids=${userId}`;
    // Alternative endpoint: `https://www.instagram.com/api/v1/feed/user/${userId}/story/`
    console.log('Fetching stories from:', storiesApiUrl);
    const storiesResponse = await currentPage.evaluate(async ({url, headers}) => {
        const response = await fetch(url, { headers });
        return response.json();
    }, { url: storiesApiUrl, headers: igHeaders });

    // The new endpoint returns stories in `reels_media` array, each item is a reel
    const reel = storiesResponse.reels_media && storiesResponse.reels_media[0];

    if (reel && reel.items && reel.items.length > 0) {
      console.log(`Found ${reel.items.length} stories for ${username}!`);
      return {
        hasStories: true,
        count: reel.items.length,
        items: reel.items.map(item => ({
          id: item.id, // Story ID
          type: item.media_type === 2 ? 'video' : 'photo',
          url: item.media_type === 2 ? item.video_versions[0].url : item.image_versions2.candidates[0].url,
          timestamp: item.taken_at,
          expiringAt: item.expiring_at,
          user: {
            id: reel.user.pk,
            username: reel.user.username
          }
        }))
      };
    } else {
      console.log('No active stories found for', username, 'Response:', storiesResponse);
      return {
        hasStories: false,
        count: 0,
        items: []
      };
    }
  } catch (error) {
    console.error(`Error checking stories for ${username}:`, error);
    // Try to take a screenshot if page is available
    if (currentPage && !currentPage.isClosed()) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const screenshotPath = `error_checkUserStories_${username}_${timestamp}.png`;
        try {
            await currentPage.screenshot({ path: screenshotPath });
            console.log('Screenshot during checkUserStories error saved to', screenshotPath);
        } catch (ssError) {
            console.error('Failed to take screenshot during checkUserStories error:', ssError);
        }
    }
    return {
      hasStories: false,
      count: 0,
      items: [],
      error: error.message
    };
  }
}

async function loginToInstagram() {
  if (page && !page.isClosed()) {
    console.log('Already logged in and page is active.');
    try {
      // Quick check to see if session is still valid by navigating to a known page
      await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 10000 });
      if (page.url().includes('login')) {
        console.log('Session expired or logged out, re-logging in.');
      } else {
        return page; // Session is good
      }
    } catch (e) {
      console.warn('Error checking current session, attempting to re-login:', e.message);
      // Fall through to re-login if page.goto fails
    }
  }

  console.log('Launching browser for login...');
  browser = await chromium.launch({ 
    headless: false, // Set to false for visual browser
    args: ['--disable-blink-features=AutomationControlled']
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });
  page = await context.newPage();

  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
  });

  console.log('Navigating to Instagram login page...');
  await page.goto('https://www.instagram.com/accounts/login/', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });
  console.log('Successfully loaded login page:', page.url());

  const selectors = {
    username: 'input[name="username"]',
    password: 'input[name="password"]',
    submitButton: 'button[type="submit"]'
  };

  for (const [name, selector] of Object.entries(selectors)) {
    await page.waitForSelector(selector, { timeout: 15000 });
    console.log(`Found ${name} field`);
  }

  await page.waitForTimeout(Math.random() * 1000 + 500);
  console.log('Filling in login credentials...');
  await page.fill(selectors.username, INSTAGRAM_USERNAME, { delay: 100 });
  await page.waitForTimeout(Math.random() * 500 + 200);
  await page.fill(selectors.password, INSTAGRAM_PASSWORD, { delay: 100 });
  await page.waitForTimeout(Math.random() * 1000 + 500);

  console.log('Submitting login form...');
  await page.click(selectors.submitButton);
  
  // Wait for the navigation triggered by the click to complete
  console.log('Waiting for navigation after login submission...');
  try {
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    console.error('Error during page.waitForNavigation:', e.message, 'Current URL:', page.url());
    // If it times out, let's check the URL anyway, maybe it landed somewhere useful or problematic
    if (!page.url().includes('instagram.com')) { // If not even on instagram.com, probably a bigger issue
        throw new Error(`Navigation failed or timed out, and not on a recognized Instagram page. Error: ${e.message}`);
    }
    // If it timed out but IS on an instagram page, log it and proceed cautiously
    console.warn('waitForNavigation timed out, but proceeding to check current page state.');
  }
  
  console.log('URL after login navigation attempt:', page.url());

  if (page.url().includes('challenge') || page.url().includes('suspicious_login')) {
    console.error('Login redirected to a challenge page:', page.url());
    throw new Error('Login triggered a security checkpoint. Manual intervention required or improve challenge handling.');
  }

  // Then handle common dialogs like 'Save Info' or 'Turn on Notifications'
  await handlePostLoginDialogs(page);
  
  // Finally, verify that we are properly logged in by looking for key UI elements
  await waitForSuccessfulLogin(page);
  console.log('Successfully logged in to Instagram!');
  return page;
}

// END OF FUNCTION DEFINITIONS

async function main() {
  try {
    const loggedInPage = await loginToInstagram();
    if (loggedInPage) {
        // The old single profile check is removed.
        // The monitor job will handle checking multiple profiles.
        console.log('Login successful. Starting monitor job...');
        await startMonitoring(loggedInPage, checkUserStories, getInstagramHeaders); // Pass the page and necessary functions
    } else {
        throw new Error('Failed to login to Instagram or obtain a page object.');
    }

    // Keep the main process alive for the monitoring interval
    // This is a simplistic way; a more robust solution might use a library like node-cron
    // or run the monitor in a separate, long-lived process.
    console.log('Main function will now idle while monitor job runs in background...');
    // No explicit close for browser/page here, monitor will manage or a shutdown signal will handle it.
    // For testing, you might want a timeout to close it after a while.
    // await new Promise(resolve => setTimeout(resolve, 300000)); // e.g., run for 5 mins then exit

  } catch (error) {
    console.error('An error occurred in the main execution block:', error.message);
    if (page && !page.isClosed()) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const screenshotPath = `error_main_${timestamp}.png`;
        await page.screenshot({ path: screenshotPath });
        console.log('Screenshot of error page saved to', screenshotPath);
    }
  } finally {
    // Browser is not closed here anymore, as the monitor job might be using it.
    // A proper shutdown mechanism should be implemented for the monitor job
    // to close the browser gracefully when the application exits.
    // console.log('Main function finished. If monitor is not detached, browser might still be open.');
  }
}

// Make checkUserStories and getInstagramHeaders available for the monitor
module.exports = { loginToInstagram, checkUserStories, getInstagramHeaders, main }; 

if (require.main === module) {
    main().catch(console.error);
} 