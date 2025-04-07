const pointsMap = { 1: 3, 2: 2, 3: 1 };

module.exports = async function awardPlacement(db, {
  userId,
  username,
  placement,
  season,
  addedBy,
  type = "manual"
}) {
  if (![1, 2, 3].includes(placement)) {
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

  const points = pointsMap[placement];
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
  });

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
