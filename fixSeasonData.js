/**
 * Fix season data issues:
 * 1. Update events with missing/wrong season to SPRING 2026
 * 2. Check for missing events
 * 
 * Run with: node fixSeasonData.js
 */

require('dotenv').config({ path: './bot/.env' });
const admin = require('firebase-admin');
const serviceAccount = require('./bot/firebase-service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function fix() {
  console.log("🔧 Fixing season data...\n");

  // Events that should be SPRING 2026
  const spring2026Events = [
    "BLAST Bounty 2026 Season 1 Finals",
    "BLAST Bounty 2026 Season 1 - Finals",
    "IEM Kraków 2026",
    "IEM Kraków 2026 Stage 1",
    "IEM Kraków 2026 Stage 2",
    "IEM Krakow 2026",
    "IEM Krakow 2026 Stage 1", 
    "IEM Krakow 2026 Stage 2",
    "IEM Krakow 2026 - Stage 1",
    "IEM Krakow 2026 - Stage 2",
  ];

  // Get all standings
  const standingsSnap = await db.collection('standings').get();
  
  console.log("📊 All events in standings:");
  console.log("─".repeat(60));
  
  for (const doc of standingsSnap.docs) {
    const data = doc.data();
    const eventName = doc.id;
    const season = data.season || 'unknown';
    const placements = data.placements || [];
    
    // Check if this is a 2026 event
    const is2026Event = eventName.includes('2026');
    const marker = is2026Event ? (season === 'SPRING 2026' ? '✅' : '❌') : '  ';
    
    console.log(`${marker} ${eventName}`);
    console.log(`   Season: ${season}, Placements: ${placements.length}`);
    
    if (placements.length > 0) {
      console.log(`   Top 3: ${placements.slice(0, 3).map(p => `${p.placement}. ${p.username}`).join(', ')}`);
    }
    console.log();
  }

  // Fix events that should be SPRING 2026
  console.log("\n🔧 Fixing SPRING 2026 events...\n");
  
  for (const doc of standingsSnap.docs) {
    const eventName = doc.id;
    const data = doc.data();
    
    // Check if this event should be SPRING 2026
    const shouldBeSpring2026 = eventName.includes('2026') && 
      (eventName.includes('BLAST Bounty') || eventName.includes('IEM') || eventName.includes('Krak'));
    
    if (shouldBeSpring2026 && data.season !== 'SPRING 2026') {
      console.log(`📝 Updating "${eventName}" season from "${data.season || 'unknown'}" to "SPRING 2026"`);
      await doc.ref.update({ season: 'SPRING 2026' });
    }
  }

  // Check users collection for tapi/tapinho mapping
  console.log("\n👤 Checking user mappings...\n");
  
  const usersSnap = await db.collection('users').get();
  let hasTapiMapping = false;
  
  usersSnap.forEach(doc => {
    const data = doc.data();
    console.log(`${doc.id}: hltvName="${data.hltvName}", preferredName="${data.preferredName}"`);
    if (data.hltvName === 'tapi' || data.preferredName === 'tapi' || doc.id === 'tapi') {
      hasTapiMapping = true;
    }
  });

  if (!hasTapiMapping) {
    console.log("\n⚠️  No mapping found for 'tapi'. You may need to add one:");
    console.log("   /user add preferred:tapinho hltv:tapi");
  }

  console.log("\n✨ Done! Now run: node rebuildAllTimeFromStandings.js");
}

fix().catch(err => {
  console.error("❌ Fix failed:", err);
  process.exit(1);
});
