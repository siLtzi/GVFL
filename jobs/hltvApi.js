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
let browserQueue = Promise.resolve();

const CACHE_TTL_PLACEMENTS_MS = 1000 * 60 * 5; // 5 min
const CACHE_TTL_STATUS_MS = 1000 * 60 * 2; // 2 min
const cache = new Map();

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function getCached(url) {
  const entry = cache.get(url);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(url);
    return null;
  }
  return entry.value;
}

function setCached(url, value, ttlMs) {
  if (!ttlMs) return;
  cache.set(url, { value, expiresAt: Date.now() + ttlMs });
}

function isCloudflareBlock(text = '') {
  const lower = text.toLowerCase();
  return (
    lower.includes('cloudflare') ||
    lower.includes('access denied') ||
    lower.includes('just a moment')
  );
}

async function getBrowser() {
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

  return browserPromise;
}

async function openBrowserPage() {
  const browser = await getBrowser();
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
}

function runBrowserTask(task) {
  const run = browserQueue.then(task, task);
  browserQueue = run.catch(() => undefined);
  return run;
}

async function fetchJsonViaBrowser(url) {
  let lastErr;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const page = await openBrowserPage();

    try {
      // Hit base domain first to complete any Cloudflare checks
      await page.goto('https://www.hltv.org/', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(3000);

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
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
    } catch (err) {
      lastErr = err;
      if (!String(err?.message || '').includes('net::ERR_ABORTED')) {
        break;
      }
      await delay(1000 + Math.random() * 2000);
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  throw lastErr;
}

async function fetchJsonWithFallback(url, { ttlMs } = {}) {
  const cached = getCached(url);
  if (cached) return cached;

  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(url, { headers: HEADERS });

      if (res.ok) {
        const json = await res.json();
        setCached(url, json, ttlMs);
        return json;
      }

      const text = await res.text();
      if (res.status === 403 || isCloudflareBlock(text)) {
        break;
      }

      throw new Error(`Failed to fetch: ${res.status} ${res.statusText}`);
    } catch (err) {
      lastError = err;
      await delay(1000 + Math.random() * 2000);
    }
  }

  try {
    const json = await runBrowserTask(() => fetchJsonViaBrowser(url));
    setCached(url, json, ttlMs);
    return json;
  } catch (err) {
    throw lastError || err;
  }
}

/*
Get league placements
 */
async function getLeaguePlacements(fantasyId, leagueId) {
  const url = `https://www.hltv.org/fantasy/${fantasyId}/leagues/league/${leagueId}/json`;

  const json = await fetchJsonWithFallback(url, { ttlMs: CACHE_TTL_PLACEMENTS_MS });
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

  const json = await fetchJsonWithFallback(url, { ttlMs: CACHE_TTL_STATUS_MS });
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
