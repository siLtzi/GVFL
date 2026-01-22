const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const fs = require('fs');
const path = require('path');

// Load cookies if available
let cookies = '';
const cookiesPath = path.join(__dirname, 'cookies.json');
try {
  if (fs.existsSync(cookiesPath)) {
    const cookieData = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
    cookies = cookieData.map(c => `${c.name}=${c.value}`).join('; ');
  }
} catch (e) {
  console.warn('Could not load HLTV cookies:', e.message);
}

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.hltv.org/',
  'Origin': 'https://www.hltv.org',
  'Connection': 'keep-alive',
  ...(cookies ? { 'Cookie': cookies } : {}),
};

// Random delay to avoid rate limiting
const delay = (ms) => new Promise(r => setTimeout(r, ms));
const randomDelay = () => delay(1000 + Math.random() * 2000);

/*
Get league placements
 */
async function getLeaguePlacements(fantasyId, leagueId) {
  await randomDelay();
  const url = `https://www.hltv.org/fantasy/${fantasyId}/leagues/league/${leagueId}/json`;

  const res = await fetch(url, { headers: HEADERS });

  if (!res.ok) {
    throw new Error(`Failed to fetch league data: ${res.statusText}`);
  }

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
  await randomDelay();
  const url = `https://www.hltv.org/fantasy/${fantasyId}/overview/json`;

  const res = await fetch(url, { headers: HEADERS });

  if (!res.ok) {
    throw new Error(`Failed to fetch fantasy event: ${res.statusText}`);
  }

  const json = await res.json();
  return {
    eventName: json.eventName,
    isGameFinished: json.gameFinished === true,
  };
}

module.exports = {
  getLeaguePlacements,
  getFantasyLeagueStatus,
};
