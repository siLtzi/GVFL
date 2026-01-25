const admin = require("firebase-admin");

const POINTS_MAP = { 1: 10, 2: 6, 3: 4, 4: 3, 5: 2, 6: 1 };

/**
 * Resolve a username to the preferred name using the users collection
 * Falls back to the original name if not found
 */
async function resolveUsername(db, username) {
  // First check if it's already a preferredName (doc ID)
  const directDoc = await db.collection("users").doc(username).get();
  if (directDoc.exists) {
    return directDoc.data().preferredName;
  }

  // Otherwise search by hltvName
  const snapshot = await db.collection("users")
    .where("hltvName", "==", username)
    .limit(1)
    .get();

  if (!snapshot.empty) {
    return snapshot.docs[0].data().preferredName;
  }

  // Fallback to original username
  return username;
}

/**
 * Update a user's scores in a specific collection (allTimeScores or seasons/{season}/scores)
 */
async function updateScores(db, collectionPath, username, placement, points, isAdd = true) {
  const docRef = db.collection(collectionPath).doc(username);
  const doc = await docRef.get();
  const current = doc.exists ? doc.data() : {};

  const multiplier = isAdd ? 1 : -1;
  const placementKey = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'][placement - 1];

  const newData = {
    username,
    points: (current.points || 0) + (points * multiplier),
    first: (current.first || 0) + (placement === 1 ? multiplier : 0),
    second: (current.second || 0) + (placement === 2 ? multiplier : 0),
    third: (current.third || 0) + (placement === 3 ? multiplier : 0),
    fourth: (current.fourth || 0) + (placement === 4 ? multiplier : 0),
    fifth: (current.fifth || 0) + (placement === 5 ? multiplier : 0),
    sixth: (current.sixth || 0) + (placement === 6 ? multiplier : 0),
    lastUpdated: new Date(),
  };

  // Also track events count for allTimeScores
  if (collectionPath === 'allTimeScores') {
    newData.events = (current.events || 0) + multiplier;
  }

  await docRef.set(newData, { merge: true });
  return newData;
}

/**
 * Add a placement to standings AND update allTimeScores + season scores
 * This is the ONLY way points should be added to the system.
 */
async function addToStandings(db, {
  eventName,
  username,
  placement,
  teamName = "",
  totalPoints = 0,
  season,
  addedBy,
}) {
  // Resolve username to preferred name
  const resolvedName = await resolveUsername(db, username);
  
  const standingsRef = db.collection("standings").doc(eventName);
  const standingsDoc = await standingsRef.get();
  
  const points = POINTS_MAP[placement] || 0;
  
  let placements = [];
  let existingData = {};
  
  if (standingsDoc.exists) {
    existingData = standingsDoc.data();
    placements = existingData.placements || [];
  }

  // Add new placement entry
  placements.push({
    placement,
    username: resolvedName,
    teamName,
    totalPoints,
    addedBy,
    addedAt: new Date().toISOString(),
  });

  // Sort by placement
  placements.sort((a, b) => a.placement - b.placement);

  await standingsRef.set({
    ...existingData,
    eventName,
    placements,
    ongoing: existingData.ongoing ?? false,
    season,
    lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  // Log the action
  await db.collection("logs").add({
    action: "add",
    eventName,
    username: resolvedName,
    placement,
    points,
    season,
    by: addedBy,
    timestamp: new Date(),
  });

  // Update allTimeScores
  await updateScores(db, 'allTimeScores', resolvedName, placement, points, true);
  console.log(`📊 Updated allTimeScores for ${resolvedName}`);

  // Update season scores
  if (season) {
    await updateScores(db, `seasons/${season}/scores`, resolvedName, placement, points, true);
    console.log(`📊 Updated ${season} scores for ${resolvedName}`);
  }

  console.log(`✅ Added ${resolvedName} (${placement} place, ${points} pts) to ${eventName}`);

  return { points, placement, username: resolvedName, eventName };
}

/**
 * Remove a placement from standings
 */
async function removeFromStandings(db, {
  eventName,
  username,
  placement,
  season,
  removedBy,
}) {
  // Resolve username to preferred name
  const resolvedName = await resolveUsername(db, username);
  
  const standingsRef = db.collection("standings").doc(eventName);
  const standingsDoc = await standingsRef.get();
  
  if (!standingsDoc.exists) {
    throw new Error(`Event "${eventName}" not found in standings`);
  }

  const existingData = standingsDoc.data();
  let placements = existingData.placements || [];
  
  // Find and remove the placement (match by resolved name)
  const idx = placements.findIndex(p => 
    p.username.toLowerCase() === resolvedName.toLowerCase() && 
    p.placement === placement
  );
  
  if (idx === -1) {
    throw new Error(`Placement not found for ${resolvedName} at position ${placement}`);
  }

  const removed = placements.splice(idx, 1)[0];
  const points = POINTS_MAP[placement] || 0;

  await standingsRef.set({
    ...existingData,
    placements,
    lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  // Log the action
  await db.collection("logs").add({
    action: "remove",
    eventName,
    username: resolvedName,
    placement,
    points,
    season,
    by: removedBy,
    timestamp: new Date(),
  });

  // Update allTimeScores (subtract)
  await updateScores(db, 'allTimeScores', resolvedName, placement, points, false);
  console.log(`📊 Updated allTimeScores for ${resolvedName} (-${points})`);

  // Update season scores (subtract)
  const seasonToUse = season || existingData.season;
  if (seasonToUse) {
    await updateScores(db, `seasons/${seasonToUse}/scores`, resolvedName, placement, points, false);
    console.log(`📊 Updated ${seasonToUse} scores for ${resolvedName} (-${points})`);
  }

  console.log(`✅ Removed ${resolvedName} (${placement} place, -${points} pts) from ${eventName}`);

  return { points, placement, username: resolvedName, eventName };
}

/**
 * Get the manual adjustments event name for a season
 */
function getManualEventName(season) {
  return `Manual Adjustments - ${season}`;
}

module.exports = {
  addToStandings,
  removeFromStandings,
  resolveUsername,
  getManualEventName,
  POINTS_MAP,
};
