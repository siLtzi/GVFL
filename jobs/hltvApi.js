const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const cookiesPath = path.join(__dirname, 'cookies.json');
let cookiesRefreshedAt = 0;
const COOKIE_REFRESH_INTERVAL = 1000 * 60 * 60; // Refresh every hour if needed

// Load cookies from file
function loadCookies() {
  try {
    if (fs.existsSync(cookiesPath)) {
      const cookieData = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
      return cookieData.map(c => `${c.name}=${c.value}`).join('; ');
    }
  } catch (e) {
    console.warn('Could not load HLTV cookies:', e.message);
  }
  return '';
}

function getHeaders() {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.hltv.org/',
    'Origin': 'https://www.hltv.org',
    'Connection': 'keep-alive',
    'Cookie': loadCookies(),
  };
}

// Random delay to avoid rate limiting
const delay = (ms) => new Promise(r => setTimeout(r, ms));
const randomDelay = () => delay(1000 + Math.random() * 2000);

// Refresh cookies using headless puppeteer with stealth
async function refreshCookies() {
  console.log('🔄 Refreshing HLTV cookies with stealth browser...');
  
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Navigate to HLTV and wait for Cloudflare to pass
    await page.goto('https://www.hltv.org/', { 
      waitUntil: 'networkidle2',
      timeout: 60000 
    });

    // Wait a bit for any challenges to complete
    await delay(5000);

    // Check if we're on the actual site
    const title = await page.title();
    if (title.includes('Just a moment') || title.includes('Cloudflare')) {
      // Still on challenge page, wait longer
      await delay(10000);
    }

    // Get cookies
    const cookies = await page.cookies();
    
    if (cookies.length > 0) {
      fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
      cookiesRefreshedAt = Date.now();
      console.log(`✅ Saved ${cookies.length} cookies to ${cookiesPath}`);
    } else {
      console.warn('⚠️ No cookies retrieved');
    }

    await browser.close();
    return cookies.length > 0;
  } catch (err) {
    console.error('❌ Failed to refresh cookies:', err.message);
    if (browser) await browser.close();
    return false;
  }
}

// Fetch with automatic cookie refresh on failure
async function fetchWithRetry(url, retried = false) {
  await randomDelay();
  
  const res = await fetch(url, { headers: getHeaders() });
  
  // Check if blocked by Cloudflare
  if (!res.ok || res.status === 403) {
    const text = await res.text();
    
    if ((text.includes('Cloudflare') || text.includes('Access denied') || res.status === 403) && !retried) {
      console.log('🚫 Blocked by Cloudflare, refreshing cookies...');
      
      // Only refresh if we haven't recently
      const timeSinceRefresh = Date.now() - cookiesRefreshedAt;
      if (timeSinceRefresh > COOKIE_REFRESH_INTERVAL) {
        const success = await refreshCookies();
        if (success) {
          // Retry with new cookies
          return fetchWithRetry(url, true);
        }
      }
      
      throw new Error('Blocked by Cloudflare - cookie refresh failed');
    }
    
    throw new Error(`Failed to fetch: ${res.status} ${res.statusText}`);
  }
  
  return res;
}

/*
Get league placements
 */
async function getLeaguePlacements(fantasyId, leagueId) {
  const url = `https://www.hltv.org/fantasy/${fantasyId}/leagues/league/${leagueId}/json`;
  
  const res = await fetchWithRetry(url);
  const json = await res.json();
  const teams = json?.phaseOverviews?.[0]?.leaderBoardData?.teams || [];

  return teams.map(t => ({
    placement: t.placement,
    teamName: t.teamName,
    username: t.username,
    totalPoints: Number(t.totalPoints),
  }));
}

/*
Check if fantasy game is finished
 */
async function getFantasyLeagueStatus(fantasyId) {
  const url = `https://www.hltv.org/fantasy/${fantasyId}/overview/json`;
  
  const res = await fetchWithRetry(url);
  const json = await res.json();
  
  return {
    eventName: json.eventName,
    isGameStarted: json.gameStarted === true,
    isGameFinished: json.gameFinished === true,
  };
}

module.exports = {
  getLeaguePlacements,
  getFantasyLeagueStatus,
  refreshCookies,
};
