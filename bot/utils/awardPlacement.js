const pointsMap = { 1: 10, 2: 6, 3: 4, 4: 3, 5: 2, 6: 1 };

module.exports = async function awardPlacement(db, {
  userId,
  username,
  placement,
  season,
  addedBy,
  type = "manual"
}) {
  if (placement < 1) {
    throw new Error(`Invalid placement: ${placement}`);
  }

  let resolvedId = userId;
  let resolvedName = username;

  // 🔄 Check for linked user
  const linkDoc = await db.collection("linkedUsers").doc(userId).get();
  if (linkDoc.exists) {
    const link = linkDoc.data();
    if (link.manualName) {
      resolvedId = link.manualName.toLowerCase().replace(/\s+/g, "_");
      resolvedName = link.manualName;
    } else if (link.discordId) {
      resolvedId = link.discordId;
      resolvedName = link.discordTag || resolvedName;
    }
  }

  const points = pointsMap[placement] || 0;
  const userRef = db.collection(`seasons/${season}/scores`).doc(resolvedId);
  const userDoc = await userRef.get();
  const current = userDoc.exists ? userDoc.data() : {};

  const newPoints = (current.points || 0) + points;

  await userRef.set({
    userId: resolvedId,
    username: resolvedName,
    points: newPoints,
    first: placement === 1 ? (current.first || 0) + 1 : (current.first || 0),
    second: placement === 2 ? (current.second || 0) + 1 : (current.second || 0),
    third: placement === 3 ? (current.third || 0) + 1 : (current.third || 0),
    fourth: placement === 4 ? (current.fourth || 0) + 1 : (current.fourth || 0),
    fifth: placement === 5 ? (current.fifth || 0) + 1 : (current.fifth || 0),
    sixth: placement === 6 ? (current.sixth || 0) + 1 : (current.sixth || 0),
  });

  // Update All-Time Stats
  try {
    const allTimeRef = db.collection('allTimeScores').doc(resolvedId);
    const allTimeDoc = await allTimeRef.get();
    const allTimeData = allTimeDoc.exists ? allTimeDoc.data() : {};
    
    const allTimePoints = (allTimeData.points || 0) + points;
    
    await allTimeRef.set({
      userId: resolvedId,
      username: resolvedName,
      points: allTimePoints,
      first: placement === 1 ? (allTimeData.first || 0) + 1 : (allTimeData.first || 0),
      second: placement === 2 ? (allTimeData.second || 0) + 1 : (allTimeData.second || 0),
      third: placement === 3 ? (allTimeData.third || 0) + 1 : (allTimeData.third || 0),
      fourth: placement === 4 ? (allTimeData.fourth || 0) + 1 : (allTimeData.fourth || 0),
      fifth: placement === 5 ? (allTimeData.fifth || 0) + 1 : (allTimeData.fifth || 0),
      sixth: placement === 6 ? (allTimeData.sixth || 0) + 1 : (allTimeData.sixth || 0),
      lastUpdated: new Date()
    }, { merge: true });
    
    console.log(`📊 All-time updated for ${resolvedName}: ${allTimePoints} total pts`);
  } catch (err) {
    console.error(`❌ Failed to update allTimeScores for ${resolvedName}:`, err.message);
  }

  await db.collection("logs").add({
    userId: resolvedId,
    username: resolvedName,
    placement,
    type,
    season,
    by: addedBy,
    timestamp: new Date(),
  });

  console.log(`✅ ${resolvedName} awarded ${points} pts for ${placement} place`);

  return {
    resolvedId,
    resolvedName,
    points,
    placement,
  };
};
