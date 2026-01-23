
require('dotenv').config();
const db = require('./bot/utils/firebase');

const manualData = [
  { name: 'DeKksu', first: 5, second: 8, third: 5, fourth: 3, fifth: 4, sixth: 3 },
  { name: 'Goatchilla', first: 6, second: 1, third: 4, fourth: 5, fifth: 3, sixth: 5 },
  { name: 'Hexsa', first: 4, second: 4, third: 6, fourth: 5, fifth: 1, sixth: 5 },
  { name: 'Kirikoutsi', first: 0, second: 1, third: 0, fourth: 0, fifth: 0, sixth: 1 },
  { name: 'Kupetsi', first: 1, second: 1, third: 1, fourth: 0, fifth: 1, sixth: 0 },
  { name: 'jiibbb333', first: 3, second: 6, third: 5, fourth: 6, fifth: 4, sixth: 2 },
  { name: 'siltzi', first: 3, second: 2, third: 5, fourth: 3, fifth: 9, sixth: 6 },
  { name: 'tapinho', first: 6, second: 5, third: 2, fourth: 6, fifth: 6, sixth: 1 }
];

const POINTS_MAP = { 1: 10, 2: 6, 3: 4, 4: 3, 5: 2, 6: 1 };

function calculatePoints(stats) {
  return (stats.first * POINTS_MAP[1]) +
         (stats.second * POINTS_MAP[2]) +
         (stats.third * POINTS_MAP[3]) +
         (stats.fourth * POINTS_MAP[4]) +
         (stats.fifth * POINTS_MAP[5]) +
         (stats.sixth * POINTS_MAP[6]);
}

async function fixAllTimeStats() {
  console.log('🔧 Starting Manual Fix for All-Time Stats...');

  // Get all existing docs
  const snapshot = await db.collection('allTimeScores').get();
  
  // Create a map of lowercase name/id -> docId
  const userMap = new Map();
  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.username) userMap.set(data.username.toLowerCase(), doc.id);
    if (data.userId) userMap.set(data.userId.toLowerCase(), doc.id);
  });

  const batch = db.batch();
  let updateCount = 0;

  for (const entry of manualData) {
    const searchName = entry.name.toLowerCase();
    
    // Try to find existing doc
    let docId = userMap.get(searchName);
    
    // If not found, check if we can predict the manual ID (lowercase + underscores)
    if (!docId) {
        docId = searchName.replace(/\s+/g, '_');
        console.log(`⚠️ User ${entry.name} not found in scan, assuming ID: ${docId}`);
    } else {
        console.log(`✅ Found user ${entry.name} -> ID: ${docId}`);
    }

    const points = calculatePoints(entry);
    const ref = db.collection('allTimeScores').doc(docId);
    
    batch.set(ref, {
      userId: docId,
      username: entry.name, // Use the proper casing form data
      points: points,
      first: entry.first,
      second: entry.second,
      third: entry.third,
      fourth: entry.fourth,
      fifth: entry.fifth,
      sixth: entry.sixth,
      lastUpdated: new Date()
    }, { merge: true });

    updateCount++;
  }

  await batch.commit();
  console.log(`🎉 Successfully updated ${updateCount} records.`);
  process.exit(0);
}

fixAllTimeStats().catch(err => {
  console.error(err);
  process.exit(1);
});
