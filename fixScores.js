/**
 * Fix scores to match the actual season standings from screenshots
 */

require('dotenv').config();
const db = require('./bot/utils/firebase');

const NEW_POINTS_MAP = { 1: 10, 2: 6, 3: 4 };

// Data from screenshots
const SPRING_2025 = {
  '.deksu': { first: 3, second: 3, third: 2 },
  'tonssedel': { first: 3, second: 1, third: 4 },
  'jiibe': { first: 1, second: 4, third: 3 },
  'tapi': { first: 4, second: 1, third: 0 },
  'hexsa88': { first: 1, second: 3, third: 3 },
  'siltzi': { first: 2, second: 1, third: 2 },
  'Kirikoutsi': { first: 0, second: 1, third: 0 },
};

const FALL_2025 = {
  '.deksu': { first: 4, second: 8, third: 4 },
  'hexsa88': { first: 5, second: 2, third: 4 },
  'tapi': { first: 4, second: 4, third: 2 },
  'jiibe': { first: 2, second: 5, third: 4 },
  'tonssedel': { first: 4, second: 0, third: 3 },
  'siltzi': { first: 1, second: 1, third: 3 },
  'Kupetsi': { first: 1, second: 1, third: 1 },
};

function calcPoints(data) {
  return (data.first * NEW_POINTS_MAP[1]) + 
         (data.second * NEW_POINTS_MAP[2]) + 
         (data.third * NEW_POINTS_MAP[3]);
}

async function fixScores(dryRun = false) {
  console.log(`\n🔧 Fixing scores to match screenshots${dryRun ? ' (DRY RUN)' : ''}...\n`);

  // Delete all existing scores first
  console.log('🗑️ Clearing existing scores...');
  const existingScores = await db.collectionGroup('scores').get();
  if (!dryRun) {
    for (const doc of existingScores.docs) {
      await doc.ref.delete();
    }
  }
  console.log(`   Deleted ${existingScores.size} documents\n`);

  // Add SPRING 2025
  console.log('📅 SPRING 2025:');
  for (const [username, data] of Object.entries(SPRING_2025)) {
    const key = username.toLowerCase().replace(/\s+/g, '_');
    const points = calcPoints(data);
    console.log(`   ${username}: ${points} pts | 🥇${data.first} 🥈${data.second} 🥉${data.third}`);
    
    if (!dryRun) {
      await db.collection('seasons/SPRING 2025/scores').doc(key).set({
        userId: key,
        username,
        points,
        first: data.first,
        second: data.second,
        third: data.third,
        fourth: 0,
        fifth: 0,
        sixth: 0,
      });
    }
  }

  // Add FALL 2025
  console.log('\n📅 FALL 2025:');
  for (const [username, data] of Object.entries(FALL_2025)) {
    const key = username.toLowerCase().replace(/\s+/g, '_');
    const points = calcPoints(data);
    console.log(`   ${username}: ${points} pts | 🥇${data.first} 🥈${data.second} 🥉${data.third}`);
    
    if (!dryRun) {
      await db.collection('seasons/FALL 2025/scores').doc(key).set({
        userId: key,
        username,
        points,
        first: data.first,
        second: data.second,
        third: data.third,
        fourth: 0,
        fifth: 0,
        sixth: 0,
      });
    }
  }

  // Calculate all-time totals
  console.log('\n📊 ALL-TIME TOTALS:');
  const allUsers = {};
  
  for (const [username, data] of Object.entries(SPRING_2025)) {
    if (!allUsers[username]) {
      allUsers[username] = { points: 0, first: 0, second: 0, third: 0 };
    }
    allUsers[username].points += calcPoints(data);
    allUsers[username].first += data.first;
    allUsers[username].second += data.second;
    allUsers[username].third += data.third;
  }
  
  for (const [username, data] of Object.entries(FALL_2025)) {
    if (!allUsers[username]) {
      allUsers[username] = { points: 0, first: 0, second: 0, third: 0 };
    }
    allUsers[username].points += calcPoints(data);
    allUsers[username].first += data.first;
    allUsers[username].second += data.second;
    allUsers[username].third += data.third;
  }

  Object.entries(allUsers)
    .sort((a, b) => b[1].points - a[1].points)
    .forEach(([username, data], i) => {
      console.log(`   #${i + 1} ${username}: ${data.points} pts | 🥇${data.first} 🥈${data.second} 🥉${data.third}`);
    });

  if (dryRun) {
    console.log('\n🔍 DRY RUN - No changes made.');
  } else {
    console.log('\n✅ Done!');
  }
}

const dryRun = process.argv.includes('--dry-run');
fixScores(dryRun).then(() => process.exit(0));
