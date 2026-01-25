const { getFantasyLeagueStatus, getLeaguePlacements } = require("./hltvApi");
const awardPlacement = require("../bot/utils/awardPlacement");
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

const checkFantasyLeagues = async (db) => {
  console.log("🚀 checkFantasyLeagues started");

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

      console.log(`🏁 ${eventName} finished — awarding points!`);
      const placements = await getLeaguePlacements(fantasyId, leagueId);
      const awarded = [];

      const pointsMap = { 1: 10, 2: 6, 3: 4, 4: 3, 5: 2, 6: 1 };
      const medalMap = { 1: "🥇", 2: "🥈", 3: "🥉", 4: "4️⃣", 5: "5️⃣", 6: "6️⃣" };

      for (let i = 0; i < 6; i++) {
        const entry = placements[i];
        if (!entry) continue;

        const placement = i + 1;
        await awardPlacement(db, {
          userId: entry.username.toLowerCase().replace(/\s+/g, "_"),
          username: entry.username,
          placement,
          season,
          addedBy: "system",
          type: "auto",
        });

        awarded.push({
          placement,
          username: entry.username,
          points: pointsMap[placement],
        });
      }

      // Format lines
      const lines = awarded.map((p) => {
        const medal = medalMap[p.placement];
        return `${medal} Added ${ordinal(p.placement)} placement to **${p.username}** \`${p.points} pts\``;
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
          awarded.map((p) => {
            const medal = medalMap[p.placement];
            return `${medal} Added ${ordinal(p.placement)} to ${p.username} [${p.points} pts]`;
          }).join("\n") + `\n\nSeason: ${season}\nBy: system`;

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

      // Sync all-time stats after awarding points
      await syncAllTimeStats(db);
    } catch (err) {
      console.error(`❌ Failed to process ${eventName}:`, err.message);
    }
  }

  console.log("✅ checkFantasyLeagues finished");
};

// Rebuild allTimeScores from all season data to ensure consistency
async function syncAllTimeStats(db) {
  console.log("🔄 Syncing all-time stats...");
  
  try {
    const snapshot = await db.collectionGroup('scores').get();
    if (snapshot.empty) return;

    const allTimeMap = new Map();

    snapshot.forEach(doc => {
      const data = doc.data();
      const userId = data.userId;
      if (!userId) return;

      if (!allTimeMap.has(userId)) {
        allTimeMap.set(userId, {
          userId,
          username: data.username || 'Unknown',
          points: 0,
          first: 0, second: 0, third: 0, fourth: 0, fifth: 0, sixth: 0
        });
      }

      const stats = allTimeMap.get(userId);
      if (data.username) stats.username = data.username;
      stats.points += (data.points || 0);
      stats.first += (data.first || 0);
      stats.second += (data.second || 0);
      stats.third += (data.third || 0);
      stats.fourth += (data.fourth || 0);
      stats.fifth += (data.fifth || 0);
      stats.sixth += (data.sixth || 0);
    });

    // Write updates
    const batch = db.batch();
    for (const [userId, stats] of allTimeMap) {
      const ref = db.collection('allTimeScores').doc(userId);
      batch.set(ref, { ...stats, lastUpdated: new Date() });
    }
    await batch.commit();
    
    console.log(`✅ All-time stats synced for ${allTimeMap.size} users`);
  } catch (err) {
    console.error("❌ Failed to sync all-time stats:", err.message);
  }
}

module.exports = checkFantasyLeagues;
