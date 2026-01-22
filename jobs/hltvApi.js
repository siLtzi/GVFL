const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.hltv.org/',
  'Origin': 'https://www.hltv.org',
  'Connection': 'keep-alive',
};

/*
Get league placements
 */
async function getLeaguePlacements(fantasyId, leagueId) {
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
  const url = `https://www.hltv.org/fantasy/${fantasyId}/overview/json`;

  const res = await fetch(url, { headers: HEADERS });

  if (!res.ok) {
    throw new Error(`Failed to fetch fantasy event: ${res.statusText}`);
  }

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
};
