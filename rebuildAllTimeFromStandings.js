/**
 * Rebuild allTimeScores from standings collection
 * 
 * This reads all completed events from standings and aggregates:
 * - Total points
 * - Placement counts (1st, 2nd, 3rd, etc.)
 * 
 * Run with: node rebuildAllTimeFromStandings.js
 */

require('dotenv').config({ path: './bot/.env' });
const admin = require('firebase-admin');
const serviceAccount = require('./bot/firebase-service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const POINTS_MAP = { 1: 10, 2: 6, 3: 4, 4: 3, 5: 2, 6: 1 };

async function rebuild() {
  console.log("🚀 Rebuilding allTimeScores from standings...\n");

  // Get all standings documents
  const standingsSnap = await db.collection('standings').get();
  
  if (standingsSnap.empty) {
    console.log("❌ No standings found!");
    process.exit(1);
  }

  console.log(`📊 Found ${standingsSnap.size} events in standings\n`);

  // Aggregate scores per user
  const userScores = {};

  for (const doc of standingsSnap.docs) {
    const data = doc.data();
    const eventName = data.eventName || doc.id;
    const placements = data.placements || [];

    // Skip ongoing events
    if (data.ongoing === true) {
      console.log(`⏳ Skipping ongoing event: ${eventName}`);
      continue;
    }

    console.log(`📋 Processing: ${eventName} (${placements.length} placements)`);

    for (const p of placements) {
      const username = p.username;
      const placement = p.placement;
      const points = POINTS_MAP[placement] || 0;

      if (!username) continue;

      if (!userScores[username]) {
        userScores[username] = {
          username,
          points: 0,
          first: 0,
          second: 0,
          third: 0,
          fourth: 0,
          fifth: 0,
          sixth: 0,
          events: 0,
        };
      }

      userScores[username].points += points;
      userScores[username].events += 1;

      if (placement === 1) userScores[username].first += 1;
      if (placement === 2) userScores[username].second += 1;
      if (placement === 3) userScores[username].third += 1;
      if (placement === 4) userScores[username].fourth += 1;
      if (placement === 5) userScores[username].fifth += 1;
      if (placement === 6) userScores[username].sixth += 1;
    }
  }

  console.log("\n📊 Aggregated scores:");
  console.log("─".repeat(50));

  // Sort by points descending
  const sorted = Object.values(userScores).sort((a, b) => b.points - a.points);

  for (const user of sorted) {
    console.log(`${user.username}: ${user.points} pts (🥇${user.first} 🥈${user.second} 🥉${user.third}) - ${user.events} events`);
  }

  console.log("\n💾 Writing to allTimeScores...");

  // Clear existing allTimeScores
  const existingSnap = await db.collection('allTimeScores').get();
  const batch = db.batch();
  
  for (const doc of existingSnap.docs) {
    batch.delete(doc.ref);
  }
  await batch.commit();
  console.log(`🗑️  Cleared ${existingSnap.size} existing documents`);

  // Write new scores
  for (const user of sorted) {
    await db.collection('allTimeScores').doc(user.username).set({
      username: user.username,
      points: user.points,
      first: user.first,
      second: user.second,
      third: user.third,
      fourth: user.fourth,
      fifth: user.fifth,
      sixth: user.sixth,
      events: user.events,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`✅ Saved: ${user.username}`);
  }

  console.log("\n✨ allTimeScores rebuilt successfully!");
  process.exit(0);
}

rebuild().catch(err => {
  console.error("❌ Rebuild failed:", err);
  process.exit(1);
});
