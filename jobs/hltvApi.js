const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const fs = require('fs');
const path = require('path');

const BASE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.hltv.org/',
  'Origin': 'https://www.hltv.org',
  'Connection': 'keep-alive',
};

const cookiesPath = path.join(__dirname, 'cookies.json');
const FETCHER_BASE = process.env.HLTV_FETCHER_URL
  ? process.env.HLTV_FETCHER_URL.replace(/\/+$/, '')
  : '';

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

function loadCookieHeader() {
  if (process.env.HLTV_COOKIE && process.env.HLTV_COOKIE.trim()) {
    return process.env.HLTV_COOKIE.trim();
  }

  if (!fs.existsSync(cookiesPath)) return '';

  try {
    const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
    if (!Array.isArray(cookies)) return '';
    return cookies.map(c => `${c.name}=${c.value}`).join('; ');
  } catch (err) {
    console.warn('Could not read HLTV cookies:', err.message);
    return '';
  }
}

async function fetchJsonWithFallback(url, { ttlMs } = {}) {
  const cached = getCached(url);
  if (cached) return cached;

  if (FETCHER_BASE) {
    const fetcherUrl = `${FETCHER_BASE}/raw?url=${encodeURIComponent(url)}`;
    const res = await fetch(fetcherUrl, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      throw new Error(`Fetcher failed: ${res.status} ${res.statusText}`);
    }
    const json = await res.json();
    setCached(url, json, ttlMs);
    return json;
  }

  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const cookieHeader = loadCookieHeader();
      const headers = cookieHeader
        ? { ...BASE_HEADERS, Cookie: cookieHeader }
        : { ...BASE_HEADERS };

      const res = await fetch(url, { headers });

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

  throw lastError;
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
  fetchJsonWithFallback,
};
