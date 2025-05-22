const { getInstagramHeaders } = require('./index.js');
const fs = require('fs');
const https = require('https');
const path = require('path');

/**
 * Fetches story media information (URLs, types, timestamps) for a given Instagram user.
 * This function currently only fetches the metadata and does NOT download the media files.
 *
 * @param {import('playwright').Page} page - The Playwright page object with an active Instagram session.
 * @param {string} igUserId - The Instagram user ID (numeric string).
 * @returns {Promise<Array<{url: string, type: 'image' | 'video', timestamp: number}>>}
 *          An array of story objects, or an empty array if no stories are found or an error occurs.
 */
async function downloadStories(page, igUserId) {
  if (!page || !igUserId) {
    console.error('[media_downloader] Page and igUserId are required for downloadStories.');
    return [];
  }

  try {
    const igHeaders = await getInstagramHeaders(page);
    if (!igHeaders) {
      console.error('[media_downloader] Failed to get Instagram headers.');
      return [];
    }

    // Using the API endpoint specified in the request
    const reelsApiUrl = `https://i.instagram.com/api/v1/feed/reels_media/?reel_ids=${igUserId}`;
    console.log(`[media_downloader] Fetching story media info from: ${reelsApiUrl} for user ${igUserId}`);

    const apiResponse = await page.evaluate(async ({ url, headers }) => {
      try {
        const response = await fetch(url, { headers });
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[media_downloader] API request failed in_page_evaluate with status ${response.status}: ${errorText.substring(0,500)}`);
          return { error: `API request failed: ${response.status}`, details: errorText };
        }
        return await response.json();
      } catch (e) {
        console.error('[media_downloader] Error during fetch in page.evaluate:', e.message);
        return { error: 'Fetch exception in evaluate', details: e.message };
      }
    }, { url: reelsApiUrl, headers: igHeaders });

    if (apiResponse.error) {
        console.error(`[media_downloader] Error fetching stories from API for user ${igUserId}: ${apiResponse.error}`, apiResponse.details ? apiResponse.details.substring(0,200) : '');
        return [];
    }

    const userReel = apiResponse.reels && apiResponse.reels[igUserId];
    if (!userReel || !userReel.items || userReel.items.length === 0) {
      console.log(`[media_downloader] No story items found for user ${igUserId} in API response or reels_media is empty.`);
      return [];
    }

    const stories = userReel.items.map(item => {
      let mediaUrl = null;
      let mediaType = null;

      // media_type: 1 for image, 2 for video
      if (item.media_type === 2 && item.video_versions && item.video_versions.length > 0) {
        mediaType = 'video';
        // Select the first (often highest quality) video version
        mediaUrl = item.video_versions[0].url;
      } else if (item.media_type === 1 && item.image_versions2 && item.image_versions2.candidates && item.image_versions2.candidates.length > 0) {
        mediaType = 'image';
        // Select the first (often highest resolution) image candidate
        mediaUrl = item.image_versions2.candidates[0].url;
      }

      if (mediaUrl && mediaType && typeof item.taken_at === 'number') {
        return {
          url: mediaUrl,
          type: mediaType,
          timestamp: item.taken_at,
          // id: item.pk // pk is the story's unique ID, can be useful later
        };
      }
      // Log if an item is malformed or doesn't have expected media
      // console.warn(`[media_downloader] Skipping story item for user ${igUserId} due to missing/malformed data:`, item.pk);
      return null;
    }).filter(story => story !== null); // Filter out any null entries from malformed items

    console.log(`[media_downloader] Successfully processed ${stories.length} story media items for user ${igUserId}.`);
    return stories;

  } catch (error) {
    console.error(`[media_downloader] Unexpected error in downloadStories for user ${igUserId}:`, error);
    return [];
  }
}

/**
 * Downloads media from a URL and saves it to the media/ directory.
 * Supports .mp4 (video) and .jpg (image).
 * @param {string} url - The media URL to download.
 * @param {'image'|'video'} type - The type of media ('image' or 'video').
 * @param {string} filename - The base filename (without extension).
 * @returns {Promise<string>} - Resolves with the full path of the saved file.
 */
function saveMedia(url, type, filename) {
  return new Promise((resolve, reject) => {
    if (!url || !type || !filename) {
      return reject(new Error('Missing url, type, or filename for saveMedia.'));
    }
    const ext = type === 'video' ? '.mp4' : '.jpg';
    const mediaDir = path.join(process.cwd(), 'media');
    const filePath = path.join(mediaDir, filename + ext);

    // Ensure media directory exists
    fs.mkdir(mediaDir, { recursive: true }, (err) => {
      if (err) return reject(err);
      const file = fs.createWriteStream(filePath);
      https.get(url, (response) => {
        if (response.statusCode !== 200) {
          file.close();
          fs.unlink(filePath, () => {}); // Clean up
          return reject(new Error(`Failed to download media: ${response.statusCode}`));
        }
        response.pipe(file);
        file.on('finish', () => {
          file.close(() => resolve(filePath));
        });
      }).on('error', (err) => {
        file.close();
        fs.unlink(filePath, () => {}); // Clean up
        reject(err);
      });
    });
  });
}

/**
 * Downloads and saves all media from the stories array.
 * @param {Array<{url: string, type: 'image'|'video', timestamp: number}>} stories
 * @param {string} igUserId
 * @returns {Promise<Array<{status: string, value?: string, reason?: any}>>}
 */
async function downloadAndSaveAll(stories, igUserId) {
  if (!Array.isArray(stories) || !igUserId) return [];
  const downloads = stories.map((story, idx) => {
    const baseFilename = `${igUserId}_${story.timestamp}_${idx}`;
    return saveMedia(story.url, story.type, baseFilename);
  });
  return Promise.allSettled(downloads);
}

module.exports = {
  downloadStories,
  saveMedia,
  downloadAndSaveAll,
}; 