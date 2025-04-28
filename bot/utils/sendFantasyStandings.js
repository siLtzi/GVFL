const { EmbedBuilder } = require("discord.js");
const { getLeaguePlacements } = require("../../jobs/hltvApi");
const db = require("./firebase"); // ✅ fixed import path

module.exports = async function sendFantasyStandings(client) {
  const snapshot = await db.collection("fantasyLinks").get();
  if (snapshot.empty) return;

  const activeLeagues = snapshot.docs.filter((d) => !d.data().processed);
  if (!activeLeagues.length)
    return console.log("📭 No active fantasy leagues found.");

  for (const doc of activeLeagues) {
    const { fantasyId, leagueId, eventName } = doc.data();

    let placements;
    try {
      placements = await getLeaguePlacements(fantasyId, leagueId);
    } catch (err) {
      console.error(
        `❌ Failed to fetch placements for ${eventName}:`,
        err.message
      );
      continue;
    }

    const channel = await client.channels.fetch(process.env.FANTASY_CHANNEL_ID);
    if (!channel) {
      console.error("❌ Fantasy channel not found.");
      continue;
    }

    const standingsRef = db.collection("standings").doc(eventName);
    const standingsDoc = await standingsRef.get();
    const prevData = standingsDoc.exists
      ? standingsDoc.data().placements || []
      : [];

    const hasChanges = placements.some((p) => {
      const prev = prevData.find((d) => d.username === p.username);
      return !prev || p.totalPoints !== prev.totalPoints;
    });

    if (!hasChanges) {
      console.log(
        `⏸️ No changes in standings for ${eventName}, not posting update.`
      );
      continue;
    }

    const embed = new EmbedBuilder()
      .setTitle(`📊 Standings for **${eventName}**`)
      .setColor(0x5865f2)
      .setThumbnail("https://i.imgur.com/STR5Ww3.png")
      .setDescription(
        placements
          .slice(0, 10)
          .map((p, i) => {
            const prevIndex = prevData.findIndex(
              (d) => d.username === p.username
            );
            let icon = "";

            if (prevData.length) {
              if (prevIndex === -1) {
                icon = "🆕";
              } else {
                const diff = prevIndex - i;
                if (diff === 1) icon = "🔼";
                else if (diff > 1) icon = "⏫";
                else if (diff === -1) icon = "🔽";
                else if (diff < -1) icon = "⏬";
              }
            }

            const spacer = "\u2003";
            return `#${i + 1}${spacer}**${p.username}** • \`${
              p.totalPoints
            } pts\` ${icon}`;
          })
          .join("\n\n")
      )
      .setFooter({ text: "Updated every 12 hours | GVFL" })
      .setTimestamp();

    await channel.send({ embeds: [embed] });
    await standingsRef.set({ placements }, { merge: true });

    console.log(`✅ Fantasy standings posted for ${eventName}.`);
  }
};
