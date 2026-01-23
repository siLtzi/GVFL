require('dotenv').config();
const db = require('./bot/utils/firebase');

async function rebuildAllTimeStats() {
  console.log('🚀 Starting All-Time Stats Rebuild...');

  // 1. Clear existing allTimeScores to ensure clean slate (optional but cleaner)
  // Or just overwrite. Overwriting is fine since we are re-aggregating everything.
  // Actually, let's delete strictly to remove users who might have been deleted from history but stuck in all-time.
  // But for now, just overwrite is safer/faster.

  // 1. Fetch all score documents from all seasons
  const snapshot = await db.collectionGroup('scores').get();
  
  if (snapshot.empty) {
    console.log('❌ No score documents found.');
    return;
  }

  console.log(`📊 Found ${snapshot.size} season score records.`);

  const allTimeMap = new Map();

  // 2. Aggregate data
  snapshot.forEach(doc => {
    const data = doc.data();
    const userId = data.userId; 

    if (!userId) return;

    if (!allTimeMap.has(userId)) {
      allTimeMap.set(userId, {
        userId: userId,
        username: data.username || 'Unknown',
        points: 0,
        first: 0,
        second: 0,
        third: 0,
        fourth: 0,
        fifth: 0,
        sixth: 0
      });
    }

    const stats = allTimeMap.get(userId);
    
    // Prefer a username that isn't derived from an ID if possible, 
    // but just updating it ensures we get a reasonably recent one.
    if (data.username) stats.username = data.username;

    stats.points += (data.points || 0);
    stats.first += (data.first || 0);
    stats.second += (data.second || 0);
    stats.third += (data.third || 0);
    stats.fourth += (data.fourth || 0);
    stats.fifth += (data.fifth || 0);
    stats.sixth += (data.sixth || 0);
  });

  console.log(`🧩 Aggregated into ${allTimeMap.size} unique users.`);

  // 3. Write to allTimeScores collection
  const batchSize = 400; // Firebase batch limit is 500
  let batch = db.batch();
  let count = 0;
  let totalCommitted = 0;

  for (const [userId, stats] of allTimeMap) {
    const ref = db.collection('allTimeScores').doc(userId);
    batch.set(ref, {
        ...stats,
        lastUpdated: new Date()
    });
    count++;

    if (count >= batchSize) {
      await batch.commit();
      totalCommitted += count;
      console.log(`💾 Saved ${totalCommitted} records...`);
      batch = db.batch();
      count = 0;
    }
  }

  if (count > 0) {
    await batch.commit();
    totalCommitted += count;
  }

  console.log(`✅ All-Time Stats Rebuild Complete! Saved ${totalCommitted} user records.`);
  process.exit(0);
}

rebuildAllTimeStats().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
