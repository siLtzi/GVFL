/**
 * Add 4th-6th placements to existing scores from standings data
 */

require('dotenv').config();
const db = require('./bot/utils/firebase');

const USERNAME_MAPPINGS = {
  'hexsa': 'hexsa88',
  'jiibbb333': 'jiibe',
  'dekksu': '.deksu',
  'tapinho': 'tapi',
  'siltzi': 'siltzi',
  'goatchilla': 'tonssedel',
  'kupetsi': 'Kupetsi',
  'kirikoutsi': 'Kirikoutsi',
};

const SPRING_2025_EVENTS = [
  'ESL Pro League Season 22 Stage 1',
  'ESL Pro League Season 22',
  'Thunderpick World Championship 2025',
  'PGL Masters Bucharest 2025',
  'IEM Chengdu 2025',
  'BLAST Rivals 2025 Season 1',
  'BLAST Rivals 2025 Season 2',
  'StarLadder Budapest Major 2025 Stage 1',
  'StarLadder Budapest Major 2025 Stage 2',
  'StarLadder Budapest Major 2025',
  'BLAST.tv Austin Major 2025 Europe Regional Qualifier',
  'BLAST.tv Austin Major 2025 Stage 1',
  'BLAST.tv Austin Major 2025 Stage 2',
  'BLAST.tv Austin Major 2025',
];

const FALL_2025_EVENTS = [
  'IEM Cologne 2025 Stage 1',
  'IEM Cologne 2025',
  'Esports World Cup 2025',
  'FISSURE Playground 2',
  'IEM Dallas 2025',
  'IEM Melbourne 2025',
  'PGL Astana 2025',
  'PGL Bucharest 2025',
  'BLAST Open London 2025',
  'BLAST Open London 2025 Finals',
  'BLAST Bounty 2025 Season 2 Finals',
];

function normalizeUsername(username) {
  const lower = username.toLowerCase();
  return USERNAME_MAPPINGS[lower] || username;
}

function getEventSeason(eventName) {
  if (SPRING_2025_EVENTS.includes(eventName)) return 'SPRING 2025';
  if (FALL_2025_EVENTS.includes(eventName)) return 'FALL 2025';
  return null;
}

async function add456Placements() {
  console.log('\n📊 Counting 4th-6th placements from standings...\n');
  
  const standingsSnap = await db.collection('standings').get();
  console.log(`Found ${standingsSnap.size} events in standings\n`);
  
  // Count 4th-6th by user and season
  const seasonCounts = {
    'SPRING 2025': {},
    'FALL 2025': {},
  };
  
  standingsSnap.forEach(doc => {
    const data = doc.data();
    const eventName = doc.id;
    const season = getEventSeason(eventName);
    
    if (!season || !data.placements) return;
    
    data.placements.forEach(p => {
      if (p.placement >= 4 && p.placement <= 6) {
        const normalized = normalizeUsername(p.username);
        const key = normalized.toLowerCase().replace(/\s+/g, '_');
        
        if (!seasonCounts[season][key]) {
          seasonCounts[season][key] = { username: normalized, fourth: 0, fifth: 0, sixth: 0 };
        }
        
        if (p.placement === 4) seasonCounts[season][key].fourth++;
        if (p.placement === 5) seasonCounts[season][key].fifth++;
        if (p.placement === 6) seasonCounts[season][key].sixth++;
      }
    });
  });

  // Display counts
  for (const [season, users] of Object.entries(seasonCounts)) {
    console.log(`📅 ${season}:`);
    for (const [key, data] of Object.entries(users)) {
      console.log(`   ${data.username}: 4th:${data.fourth} 5th:${data.fifth} 6th:${data.sixth}`);
    }
    console.log('');
  }

  // Update database
  console.log('💾 Updating scores with 4th-6th placements...\n');
  
  for (const [season, users] of Object.entries(seasonCounts)) {
    for (const [key, data] of Object.entries(users)) {
      const docRef = db.collection(`seasons/${season}/scores`).doc(key);
      const doc = await docRef.get();
      
      if (doc.exists) {
        const current = doc.data();
        const additionalPoints = (data.fourth * 3) + (data.fifth * 2) + (data.sixth * 1);
        
        await docRef.update({
          fourth: data.fourth,
          fifth: data.fifth,
          sixth: data.sixth,
          points: current.points + additionalPoints,
        });
        
        console.log(`✅ ${season} - ${data.username}: +${additionalPoints} pts (4th:${data.fourth} 5th:${data.fifth} 6th:${data.sixth})`);
      } else {
        console.log(`⚠️ ${season} - ${data.username}: No existing score doc found`);
      }
    }
  }

  console.log('\n✅ Done!');
}

add456Placements().then(() => process.exit(0));
