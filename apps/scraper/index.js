require('dotenv').config({ path: '../../.env' });
const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

const INSTAGRAM_USERNAME = process.env.INSTAGRAM_USERNAME;
const INSTAGRAM_PASSWORD = process.env.INSTAGRAM_PASSWORD;
const TARGET_PROFILE_URL = 'https://www.instagram.com/instagram/'; // Example target profile

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
      console.log(`Selector ${selector} not found, trying next...`);
    }
  }
  
  throw new Error('Could not confirm successful login with any known selectors');
}

async function handlePostLoginDialogs(page) {
  const dialogs = [
    {
      type: 'Save Login Info',
      detect: async () => page.url().includes('/accounts/onetap/'),
      handle: async () => {
        console.log('Handling "Save Login Info" dialog...');
        try {
          // Try "Not Now" first as it's less likely to trigger additional security checks
          const notNowButton = page.locator('button:has-text("Not Now")').first();
          if (await notNowButton.isVisible()) {
            await notNowButton.click();
            return true;
          }
        } catch (e) {
          console.log('Could not find "Not Now" button:', e.message);
        }
        return false;
      }
    },
    {
      type: 'Turn On Notifications',
      detect: async () => page.locator('div[role="dialog"] button:has-text("Not Now")').isVisible(),
      handle: async () => {
        console.log('Handling "Turn On Notifications" dialog...');
        try {
          await page.locator('div[role="dialog"] button:has-text("Not Now")').click();
          return true;
        } catch (e) {
          console.log('Could not handle notifications dialog:', e.message);
          return false;
        }
      }
    }
  ];

  for (const dialog of dialogs) {
    if (await dialog.detect()) {
      console.log(`Detected ${dialog.type} dialog`);
      await dialog.handle();
      // Wait a bit for any animations to complete
      await page.waitForTimeout(1000);
    }
  }
}

async function getInstagramHeaders(page) {
  console.log('Getting Instagram headers...');
  const cookies = await page.context().cookies();
  const cookieString = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
  
  const xIgAppId = await page.evaluate(() => {
    const appIdMeta = document.querySelector('meta[property="al:ios:app_store_id"]');
    return appIdMeta ? appIdMeta.content : '936619743392459';
  });

  return {
    'accept': '*/*',
    'accept-language': 'en-US,en;q=0.9',
    'origin': 'https://www.instagram.com',
    'referer': 'https://www.instagram.com/',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
    'user-agent': await page.evaluate(() => navigator.userAgent),
    'x-ig-app-id': xIgAppId,
    'cookie': cookieString
  };
}

async function checkUserStories(page, username) {
  console.log(`Checking stories for user: ${username}`);
  
  try {
    const userInfoResponse = await page.evaluate(async (username) => {
      const response = await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`, {
        headers: {
          'accept': '*/*',
          'x-ig-app-id': document.querySelector('meta[property="al:ios:app_store_id"]')?.content || '936619743392459'
        }
      });
      return await response.json();
    }, username);

    if (!userInfoResponse.data?.user?.id) {
      throw new Error('Could not find user ID. User might be private or not exist.');
    }

    const userId = userInfoResponse.data.user.id;
    console.log(`Found user ID: ${userId}`);

    const storiesResponse = await page.evaluate(async (userId) => {
      const response = await fetch(`https://www.instagram.com/api/v1/feed/user/${userId}/story/`, {
        headers: {
          'accept': '*/*',
          'x-ig-app-id': document.querySelector('meta[property="al:ios:app_store_id"]')?.content || '936619743392459'
        }
      });
      return await response.json();
    }, userId);

    if (storiesResponse.reel && storiesResponse.reel.items && storiesResponse.reel.items.length > 0) {
      console.log(`Found ${storiesResponse.reel.items.length} stories!`);
      return {
        hasStories: true,
        count: storiesResponse.reel.items.length,
        items: storiesResponse.reel.items.map(item => ({
          type: item.media_type === 2 ? 'video' : 'photo',
          url: item.media_type === 2 ? item.video_versions[0].url : item.image_versions2.candidates[0].url,
          timestamp: item.taken_at,
          expiringAt: item.expiring_at
        }))
      };
    } else {
      console.log('No active stories found');
      return {
        hasStories: false,
        count: 0,
        items: []
      };
    }
  } catch (error) {
    console.error('Error checking stories:', error);
    return {
      hasStories: false,
      count: 0,
      items: [],
      error: error.message
    };
  }
}

async function main() {
  let browser;
  try {
    console.log('Launching browser...');
    browser = await chromium.launch({ 
      headless: false,
      args: ['--disable-blink-features=AutomationControlled']
    });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
      viewport: { width: 1280, height: 800 }
    });
    const page = await context.newPage();

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
    await page.waitForURL(url => url !== 'https://www.instagram.com/accounts/login/', { timeout: 30000 });
    console.log('URL changed after login:', page.url());

    if (page.url().includes('challenge') || page.url().includes('suspicious_login')) {
      throw new Error('Login triggered a security checkpoint. Manual intervention required.');
    }

    await handlePostLoginDialogs(page);
    await waitForSuccessfulLogin(page);
    console.log('Successfully logged in to Instagram!');

    // Extract username from target profile URL
    const targetUsername = TARGET_PROFILE_URL.split('/').filter(Boolean).pop();
    if (!targetUsername) {
      throw new Error(`Could not extract username from TARGET_PROFILE_URL: ${TARGET_PROFILE_URL}`);
    }
    console.log(`Target username extracted: ${targetUsername}`);

    // Check stories for target user
    const storiesResult = await checkUserStories(page, targetUsername);

    if (storiesResult.hasStories) {
      console.log(`Found ${storiesResult.count} stories for ${targetUsername}:`);
      for (const story of storiesResult.items) {
        console.log(`- Type: ${story.type}`);
        console.log(`  URL: ${story.url}`);
        console.log(`  Posted: ${new Date(story.timestamp * 1000).toLocaleString()}`);
        console.log(`  Expires: ${new Date(story.expiringAt * 1000).toLocaleString()}`);
      }
    } else {
      console.log(`No active stories found for ${targetUsername}`);
      if (storiesResult.error) {
        console.error(`Error details from checkUserStories: ${storiesResult.error}`);
      }
    }

    console.log('Script completed successfully. Browser will remain open for 10 seconds for inspection...');
    await page.waitForTimeout(10000);
  } catch (error) {
    console.error('An error occurred during the scraping process:', error.message);
    if (browser) {
      const page = (await browser.pages())[0];
      if (page) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const screenshotPath = `error_screenshot_${timestamp}.png`;
        await page.screenshot({ path: screenshotPath });
        console.log('Screenshot of error page saved to', screenshotPath);
      }
    }
  } finally {
    if (browser) {
      console.log('Closing browser (will close in 5s)...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      await browser.close();
      console.log('Browser closed.');
    }
  }
}

main().catch(console.error); 