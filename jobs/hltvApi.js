const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

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

/**
 * Fetch JSON using curl (bypasses Cloudflare better than node-fetch)
 */
function fetchWithCurl(url) {
  const cookieHeader = loadCookieHeader();
  
  // Build curl command
  const curlArgs = [
    'curl',
    '-s', // silent
    '-S', // show errors
    '-L', // follow redirects
    '--max-time', '30',
    '-H', '"Accept: application/json"',
    '-H', '"User-Agent: curl/8.12.1"',
  ];
  
  if (cookieHeader) {
    // Escape quotes in cookie header
    const escapedCookie = cookieHeader.replace(/"/g, '\\"');
    curlArgs.push('-H', `"Cookie: ${escapedCookie}"`);
  }
  
  curlArgs.push(`"${url}"`);
  
  const command = curlArgs.join(' ');
  
  try {
    const output = execSync(command, { 
      encoding: 'utf8',
      timeout: 35000,
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });
    
    return JSON.parse(output);
  } catch (err) {
    if (err.stdout) {
      // Check if stdout contains valid JSON despite error
      try {
        return JSON.parse(err.stdout);
      } catch (parseErr) {
        // Not valid JSON
      }
    }
    throw new Error(`Curl failed: ${err.message}`);
  }
}

async function fetchJsonWithFallback(url, { ttlMs } = {}) {
  const cached = getCached(url);
  if (cached) return cached;

  let lastError;
  const maxAttempts = 3;
  
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      console.log(`📡 Fetching with curl: ${url} (attempt ${attempt + 1})`);
      const json = fetchWithCurl(url);
      setCached(url, json, ttlMs);
      return json;
    } catch (err) {
      lastError = err;
      console.warn(`⚠️ Curl attempt ${attempt + 1} failed: ${err.message}`);
      
      if (err.message.includes('Access denied') || err.message.includes('403')) {
        break; // Don't retry on explicit blocks
      }
      
      await delay(1000 * (attempt + 1)); // Simple backoff
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
