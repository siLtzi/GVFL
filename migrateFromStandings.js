/**
 * Migration script to recalculate ALL points from standings data
 * This uses the actual placement history to rebuild scores with the new points system
 * 
 * Run with: node migrateFromStandings.js
 * Add --dry-run to preview changes without saving
 */

require('dotenv').config();
const db = require('./bot/utils/firebase');

const NEW_POINTS_MAP = { 1: 10, 2: 6, 3: 4, 4: 3, 5: 2, 6: 1 };

// Map usernames from standings to their normalized IDs/names
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

// Assign events to seasons
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

// Skip 2026 events
const SKIP_EVENTS = [
  'BLAST Bounty 2026 Season 1 Finals',
];

function getEventSeason(eventName) {
  if (SKIP_EVENTS.includes(eventName)) return null;
  if (SPRING_2025_EVENTS.includes(eventName)) return 'SPRING 2025';
  if (FALL_2025_EVENTS.includes(eventName)) return 'FALL 2025';
  console.warn(`⚠️ Unknown event: ${eventName} - skipping`);
  return null;
}

function normalizeUsername(username) {
  const lower = username.toLowerCase();
  return USERNAME_MAPPINGS[lower] || username;
}

async function migrateFromStandings(dryRun = false) {
  console.log(`\n🔄 Recalculating all points from standings data${dryRun ? ' (DRY RUN)' : ''}...\n`);
  
  // Get all standings
  const standingsSnap = await db.collection('standings').get();
  
  if (standingsSnap.empty) {
    console.log('No standings found.');
    return;
  }

  // Aggregate all placements by user AND season
  const seasonStats = {
    'SPRING 2025': {},
    'FALL 2025': {},
  };
  
  standingsSnap.forEach(doc => {
    const data = doc.data();
    const eventName = doc.id;
    const season = getEventSeason(eventName);
    
    if (!season || !data.placements) return;
    
    data.placements.forEach(p => {
      if (p.placement > 6) return; // Only count top 6
      
      const normalizedName = normalizeUsername(p.username);
      const key = normalizedName.toLowerCase().replace(/\s+/g, '_');
      
      if (!seasonStats[season][key]) {
        seasonStats[season][key] = {
          username: normalizedName,
          points: 0,
          first: 0,
          second: 0,
          third: 0,
          fourth: 0,
          fifth: 0,
          sixth: 0,
          events: []
        };
      }
      
      const points = NEW_POINTS_MAP[p.placement] || 0;
      seasonStats[season][key].points += points;
      
      if (p.placement === 1) seasonStats[season][key].first++;
      else if (p.placement === 2) seasonStats[season][key].second++;
      else if (p.placement === 3) seasonStats[season][key].third++;
      else if (p.placement === 4) seasonStats[season][key].fourth++;
      else if (p.placement === 5) seasonStats[season][key].fifth++;
      else if (p.placement === 6) seasonStats[season][key].sixth++;
      
      seasonStats[season][key].events.push({ event: eventName, placement: p.placement, points });
    });
  });

  // Display stats by season
  for (const [season, users] of Object.entries(seasonStats)) {
    console.log(`\n📅 ${season}\n${'='.repeat(40)}`);
    
    const sorted = Object.entries(users).sort((a, b) => b[1].points - a[1].points);
    
    for (const [key, stats] of sorted) {
      console.log(`👤 ${stats.username}: ${stats.points} pts`);
      console.log(`   🥇${stats.first} 🥈${stats.second} 🥉${stats.third} | 4th:${stats.fourth} 5th:${stats.fifth} 6th:${stats.sixth}`);
    }
  }

  // Calculate totals
  console.log(`\n📊 ALL-TIME TOTALS\n${'='.repeat(40)}`);
  const allUsers = {};
  for (const users of Object.values(seasonStats)) {
    for (const [key, stats] of Object.entries(users)) {
      if (!allUsers[key]) {
        allUsers[key] = { username: stats.username, points: 0, first: 0, second: 0, third: 0, fourth: 0, fifth: 0, sixth: 0 };
      }
      allUsers[key].points += stats.points;
      allUsers[key].first += stats.first;
      allUsers[key].second += stats.second;
      allUsers[key].third += stats.third;
      allUsers[key].fourth += stats.fourth;
      allUsers[key].fifth += stats.fifth;
      allUsers[key].sixth += stats.sixth;
    }
  }
  
  const sortedAll = Object.entries(allUsers).sort((a, b) => b[1].points - a[1].points);
  for (const [key, stats] of sortedAll) {
    console.log(`#${sortedAll.indexOf([key, stats]) + 1} ${stats.username}: ${stats.points} pts | 🥇${stats.first} 🥈${stats.second} 🥉${stats.third}`);
  }

  if (dryRun) {
    console.log('\n🔍 DRY RUN - No changes were made.');
    console.log('Run without --dry-run to apply changes.\n');
    return;
  }

  // Update the database
  console.log('\n💾 Updating database...\n');
  
  for (const [season, users] of Object.entries(seasonStats)) {
    console.log(`📅 Updating ${season}...`);
    
    for (const [key, stats] of Object.entries(users)) {
      const userRef = db.collection(`seasons/${season}/scores`).doc(key);
      
      await userRef.set({
        userId: key,
        username: stats.username,
        points: stats.points,
        first: stats.first,
        second: stats.second,
        third: stats.third,
        fourth: stats.fourth,
        fifth: stats.fifth,
        sixth: stats.sixth,
      });
      
      console.log(`   ✅ ${stats.username}: ${stats.points} pts`);
    }
  }

  console.log(`\n🎉 Migration complete!`);
}

// Check for --dry-run flag
const dryRun = process.argv.includes('--dry-run');

migrateFromStandings(dryRun)
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  });
