const { getFantasyLeagueStatus, getLeaguePlacements } = require("./hltvApi");
const { ordinal } = require("../bot/utils/helpers");
const { EmbedBuilder } = require("discord.js");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Retry helper for middleware calls (handles ECONNREFUSED during restarts)
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (err) {
      const isRetryable = err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED');
      if (!isRetryable || i === maxRetries - 1) throw err;
      console.warn(`⚠️ Middleware unavailable (attempt ${i + 1}/${maxRetries}), retrying in ${(i + 1) * 2}s...`);
      await sleep((i + 1) * 2000);
    }
  }
}

const pointsMap = { 1: 10, 2: 6, 3: 4, 4: 3, 5: 2, 6: 1 };

/**
 * Load users collection and build a lookup map: hltvName -> preferredName
 */
async function loadUserMap(db) {
  const usersSnap = await db.collection("users").get();
  const map = {};
  usersSnap.forEach(doc => {
    const data = doc.data();
    if (data.hltvName) {
      map[data.hltvName.toLowerCase()] = data.preferredName;
    }
  });
  return map;
}

const checkFantasyLeagues = async (db) => {
  console.log("🚀 checkFantasyLeagues started");

  // Load user mapping (hltvName -> preferredName)
  let userMap = {};
  try {
    userMap = await loadUserMap(db);
    console.log(`📋 Loaded ${Object.keys(userMap).length} user mappings`);
  } catch (err) {
    console.error("❌ Failed to load user map:", err);
  }

  let snapshot;
  try {
    snapshot = await db.collection("fantasyLinks").get();
  } catch (err) {
    console.error("❌ Failed to get fantasyLinks:", err);
    return;
  }

  let settingsDoc;
  try {
    settingsDoc = await db.collection("settings").doc("config").get();
  } catch (err) {
    console.error("❌ Failed to get settings/config:", err);
    return;
  }

  if (!settingsDoc.exists) return console.warn("⚠️ No active season set.");

  const season = settingsDoc.data().currentSeason;
  console.log("🎯 Current season:", season);

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const { fantasyId, leagueId, eventName } = data;

    if (data.processed) continue;

    try {
      const info = await getFantasyLeagueStatus(fantasyId);
      if (!info.isGameFinished) {
        console.log(`⏳ ${eventName} is still ongoing.`);
        continue;
      }

      console.log(`🏁 ${eventName} finished — saving results!`);
      const placements = await getLeaguePlacements(fantasyId, leagueId);

      // Resolve HLTV names to preferred names
      const resolvedPlacements = placements.map((p, i) => {
        const hltvLower = p.username.toLowerCase();
        const preferredName = userMap[hltvLower] || p.username; // fallback to HLTV name if not found
        return {
          placement: i + 1,
          username: preferredName,
          hltvName: p.username, // keep original for reference
          teamName: p.teamName,
          totalPoints: p.totalPoints,
        };
      });

      // Build top 6 for notifications
      const medalMap = { 1: "🥇", 2: "🥈", 3: "🥉", 4: "4️⃣", 5: "5️⃣", 6: "6️⃣" };
      const top6 = resolvedPlacements.slice(0, 6).map((p) => ({
        ...p,
        points: pointsMap[p.placement] || 0,
      }));

      // ✅ Update standings (SOURCE OF TRUTH)
      // The website's sync-scores.ts reads this and updates allTimeScores + season scores
      const standingsRef = db.collection("standings").doc(eventName);
      await standingsRef.set({
        eventName,
        ongoing: false,
        placements: resolvedPlacements.map((p) => ({
          placement: p.placement,
          username: p.username,
          hltvName: p.hltvName,
          teamName: p.teamName,
          totalPoints: p.totalPoints,
        })),
        processedAt: new Date(),
        season,
      }, { merge: true });

      console.log(`✅ Standings updated for ${eventName}`);

      // Log to logs collection
      for (const p of top6) {
        await db.collection("logs").add({
          userId: p.username.toLowerCase().replace(/\s+/g, "_"),
          username: p.username,
          placement: p.placement,
          points: p.points,
          type: "auto",
          season,
          by: "system",
          eventName,
          timestamp: new Date(),
        });
      }

      // Format lines for Discord embed
      const lines = top6.map((p) => {
        const medal = medalMap[p.placement];
        return `${medal} **${p.username}** \`${p.points} pts\``;
      });

      const embed = new EmbedBuilder()
        .setTitle(`🏁 ${eventName}`)
        .setColor(0x00cc99)
        .setDescription(lines.join("\n\n"))
        .addFields(
          { name: "Season", value: season, inline: true },
          { name: "Added by", value: "system", inline: true }
        )
        .setThumbnail("https://i.imgur.com/STR5Ww3.png")
        .setTimestamp();

      await fetch(process.env.DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embeds: [embed.toJSON()] }),
      });

      // WhatsApp
      try {
        const whatsappMsg = `🏁 ${eventName}\n\n` + 
          top6.map((p) => {
            const medal = medalMap[p.placement];
            return `${medal} ${ordinal(p.placement)} — ${p.username} [${p.points} pts]`;
          }).join("\n") + `\n\nSeason: ${season}`;

        await fetchWithRetry("http://localhost:3001/send-whatsapp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: whatsappMsg }),
        });

        console.log("✅ WhatsApp message sent for final placements");
      } catch (err) {
        console.error("❌ Failed to send WhatsApp message:", err.message);
      }

      // Trigger /season logic (POST to server.js)
      try {
        await fetchWithRetry("http://localhost:3001/trigger-season", { method: "POST" });
        console.log("✅ Season leaderboard posted");
      } catch (err) {
        console.error("❌ Failed to call /season webhook:", err.message);
      }

      await doc.ref.update({ processed: true });
      console.log(`✅ Marked ${eventName} as processed`);
    } catch (err) {
      console.error(`❌ Failed to process ${eventName}:`, err.message);
    }
  }

  console.log("✅ checkFantasyLeagues finished");
};

module.exports = checkFantasyLeagues;
