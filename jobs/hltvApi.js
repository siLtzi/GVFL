const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.hltv.org/',
  'Origin': 'https://www.hltv.org',
  'Connection': 'keep-alive',
};

const cookiesPath = path.join(__dirname, 'cookies.json');
let browserPromise = null;
let pagePromise = null;

function isCloudflareBlock(text = '') {
  const lower = text.toLowerCase();
  return (
    lower.includes('cloudflare') ||
    lower.includes('access denied') ||
    lower.includes('just a moment')
  );
}

async function getBrowserPage() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
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
  }

  if (!pagePromise) {
    pagePromise = (async () => {
      const browser = await browserPromise;
      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent(HEADERS['User-Agent']);

      if (fs.existsSync(cookiesPath)) {
        try {
          const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
          if (Array.isArray(cookies) && cookies.length) {
            await page.setCookie(...cookies);
          }
        } catch (err) {
          console.warn('Could not load HLTV cookies:', err.message);
        }
      }

      return page;
    })();
  }

  return pagePromise;
}

async function fetchJsonViaBrowser(url) {
  const page = await getBrowserPage();

  // Hit base domain first to complete any Cloudflare checks
  await page.goto('https://www.hltv.org/', { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForTimeout(3000);

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForTimeout(1500);

  const bodyText = await page.evaluate(() => document.body.innerText || '');
  if (isCloudflareBlock(bodyText)) {
    await page.waitForTimeout(8000);
    const retryText = await page.evaluate(() => document.body.innerText || '');
    if (isCloudflareBlock(retryText)) {
      throw new Error('Blocked by Cloudflare (headless)');
    }
  }

  const json = JSON.parse(bodyText);

  try {
    const cookies = await page.cookies();
    fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
  } catch (err) {
    console.warn('Failed to save HLTV cookies:', err.message);
  }

  return json;
}

async function fetchJsonWithFallback(url) {
  const res = await fetch(url, { headers: HEADERS });

  if (res.ok) {
    return res.json();
  }

  const text = await res.text();
  if (res.status === 403 || isCloudflareBlock(text)) {
    return fetchJsonViaBrowser(url);
  }

  throw new Error(`Failed to fetch: ${res.status} ${res.statusText}`);
}

/*
Get league placements
 */
async function getLeaguePlacements(fantasyId, leagueId) {
  const url = `https://www.hltv.org/fantasy/${fantasyId}/leagues/league/${leagueId}/json`;

  const json = await fetchJsonWithFallback(url);
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

  const json = await fetchJsonWithFallback(url);
  return {
    eventName: json.eventName,
    isGameStarted: json.gameStarted === true,
    isGameFinished: json.gameFinished === true,
  };
}

module.exports = {
  getLeaguePlacements,
  getFantasyLeagueStatus,
};
