require('dotenv').config();
const db = require('./bot/utils/firebase');
const { Timestamp } = require('firebase-admin/firestore');

async function migrateSeasonDates() {
  console.log('🗓️  Starting Season Date Migration...');

  const seasonsSnap = await db.collection('seasons').get();
  
  if (seasonsSnap.empty) {
    console.log('No seasons found.');
    return;
  }

  const logsSnap = await db.collection('logs')
    .where('type', '==', 'endseason')
    .get();

  const endDates = {};
  logsSnap.forEach(doc => {
    const data = doc.data();
    if (data.season && data.timestamp) {
      // If multiple endseason logs exist, the latest one is probably the "real" one
      // (though usually you only end it once).
      // We'll trust the first one we find or just overwrite.
      // Logs are usually chronological? Firestore query wasn't ordered, so let's check dates.
      
      const ts = data.timestamp;
      // Convert to JS Date if it's a Firestore Timestamp
      const date = ts.toDate ? ts.toDate() : new Date(ts);

      if (!endDates[data.season] || date > endDates[data.season]) {
         endDates[data.season] = date;
      }
    }
  });

  console.log(`Found end dates for ${Object.keys(endDates).length} seasons based on logs.`);

  const batch = db.batch();
  let updates = 0;

  for (const doc of seasonsSnap.docs) {
    const seasonName = doc.id;
    const currentData = doc.data();

    // If already has endedAt, skip
    if (currentData.endedAt) {
      console.log(`⏭️  Season ${seasonName} already has endedAt.`);
      continue;
    }

    const foundDate = endDates[seasonName];
    
    if (foundDate) {
      console.log(`✅ Setting endedAt for ${seasonName} to ${foundDate.toISOString()}`);
      batch.update(doc.ref, { endedAt: foundDate, active: false });
      updates++;
    } else {
        // Fallback: try to find the last score update or log update for this season?
        // This is getting complicated/expensive.
        // For now, checks if there is a 'winner' doc, which implies it ended.
        const winnerDoc = await db.collection('winners').doc(seasonName).get();
        if (winnerDoc.exists) {
           console.log(`⚠️ Season ${seasonName} has a winner but no 'endseason' log found. Leaving endedAt null manually check.`);
           // We could mark it active: false at least?
           batch.update(doc.ref, { active: false });
           updates++;
        } else {
           console.log(`ℹ️  Season ${seasonName} seems active or has no end data.`);
        }
    }
  }

  if (updates > 0) {
    await batch.commit();
    console.log(`\n💾 Committed updates for ${updates} seasons.`);
  } else {
    console.log('\nNo updates needed.');
  }

  process.exit(0);
}

migrateSeasonDates().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
