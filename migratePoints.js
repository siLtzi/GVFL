/**
 * Migration script to recalculate all points using the new points system:
 * 1st = 10 pts, 2nd = 6 pts, 3rd = 4 pts, 4th = 3 pts, 5th = 2 pts, 6th = 1 pts
 * 
 * Run with: node migratePoints.js
 * Add --dry-run to preview changes without saving
 */

require('dotenv').config();
const db = require('./bot/utils/firebase');

const OLD_POINTS_MAP = { 1: 3, 2: 2, 3: 1 };
const NEW_POINTS_MAP = { 1: 10, 2: 6, 3: 4, 4: 3, 5: 2, 6: 1 };

async function migratePoints(dryRun = false) {
  console.log(`\n🔄 Starting points migration${dryRun ? ' (DRY RUN)' : ''}...\n`);
  
  // Get all scores across all seasons
  const scoresSnap = await db.collectionGroup('scores').get();
  
  if (scoresSnap.empty) {
    console.log('No scores found in database.');
    return;
  }

  console.log(`Found ${scoresSnap.size} score documents to process.\n`);
  
  const updates = [];
  
  for (const doc of scoresSnap.docs) {
    const data = doc.data();
    const path = doc.ref.path;
    
    // Get current placement counts
    const first = data.first || 0;
    const second = data.second || 0;
    const third = data.third || 0;
    const fourth = data.fourth || 0;
    const fifth = data.fifth || 0;
    const sixth = data.sixth || 0;
    
    // Calculate old points (for comparison)
    const oldPoints = (first * OLD_POINTS_MAP[1]) + (second * OLD_POINTS_MAP[2]) + (third * OLD_POINTS_MAP[3]);
    
    // Calculate new points
    const newPoints = 
      (first * NEW_POINTS_MAP[1]) +
      (second * NEW_POINTS_MAP[2]) +
      (third * NEW_POINTS_MAP[3]) +
      (fourth * NEW_POINTS_MAP[4]) +
      (fifth * NEW_POINTS_MAP[5]) +
      (sixth * NEW_POINTS_MAP[6]);
    
    const currentPoints = data.points || 0;
    
    // Log the change
    console.log(`📊 ${data.username || data.userId}`);
    console.log(`   Path: ${path}`);
    console.log(`   Placements: 🥇${first} 🥈${second} 🥉${third} 4️⃣${fourth} 5️⃣${fifth} 6️⃣${sixth}`);
    console.log(`   Current points: ${currentPoints} → New points: ${newPoints}`);
    console.log(`   (Old system would be: ${oldPoints})`);
    console.log('');
    
    if (currentPoints !== newPoints) {
      updates.push({
        ref: doc.ref,
        username: data.username || data.userId,
        oldPoints: currentPoints,
        newPoints,
        data: {
          ...data,
          points: newPoints,
          // Ensure all placement fields exist
          first,
          second,
          third,
          fourth,
          fifth,
          sixth,
        }
      });
    }
  }

  console.log(`\n📝 Summary: ${updates.length} documents need updating.\n`);
  
  if (updates.length === 0) {
    console.log('✅ All points are already correct!');
    return;
  }

  if (dryRun) {
    console.log('🔍 DRY RUN - No changes were made.');
    console.log('Run without --dry-run to apply changes.');
    return;
  }

  // Apply updates
  console.log('💾 Applying updates...\n');
  
  for (const update of updates) {
    await update.ref.set(update.data);
    console.log(`✅ Updated ${update.username}: ${update.oldPoints} → ${update.newPoints} pts`);
  }

  console.log(`\n🎉 Migration complete! Updated ${updates.length} documents.`);
}

// Check for --dry-run flag
const dryRun = process.argv.includes('--dry-run');

migratePoints(dryRun)
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  });
