const { getFantasyLeagueStatus, getLeaguePlacements } = require("./hltvApi");
const awardPlacement = require("../bot/utils/awardPlacement");
const { EmbedBuilder } = require("discord.js");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));

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

      for (let i = 0; i < 3; i++) {
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
          points: placement === 1 ? 3 : placement === 2 ? 2 : 1,
        });
      }

      // Format lines
      const lines = awarded.map((p) => {
        const medal = p.placement === 1 ? "🥇" : p.placement === 2 ? "🥈" : "🥉";
        return `${medal} Added ${ordinal(p.placement)} placement to **${p.username}** \`${p.points} pts\``;
      });

      const embed = new EmbedBuilder()
        .setTitle(`🏁 ${eventName}`)
        .setColor(0x00cc99)
        .setDescription(lines.join("\n"))
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
        const whatsappMsg = `🏁 ${eventName}\n` + 
          awarded.map((p) => {
            const medal = p.placement === 1 ? "🥇" : p.placement === 2 ? "🥈" : "🥉";
            return `${medal} Added ${ordinal(p.placement)} to ${p.username} [${p.points} pts]`;
          }).join("\n") + `\nSeason: ${season}\nBy: system`;

        await fetch("http://localhost:3001/send-whatsapp", {
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
        await fetch("http://localhost:3001/trigger-season", { method: "POST" });
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

function ordinal(n) {
  return n === 1 ? "1st" : n === 2 ? "2nd" : "3rd";
}

module.exports = checkFantasyLeagues;
