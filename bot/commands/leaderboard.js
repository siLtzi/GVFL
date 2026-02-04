const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Show total points across all seasons"),

  async execute(interaction, db) {
    // Defer immediately - Firebase queries can take time
    await interaction.deferReply();
    
    const scoresSnap = await db.collection("allTimeScores").get();

    if (scoresSnap.empty) {
      return await interaction.editReply("No scores found in all-time records");
    }

    const spacer = "\u2003"; // EM space

    // Load users for preferred names - map all possible names to preferredName
    const usersSnap = await db.collection("users").get();
    const userMap = {};
    usersSnap.forEach(doc => {
      const data = doc.data();
      const preferred = data.preferredName || doc.id;
      // Map all possible name variations to the preferred name
      if (data.hltvName) userMap[data.hltvName.toLowerCase()] = preferred;
      if (data.discordName) userMap[data.discordName.toLowerCase()] = preferred;
      userMap[doc.id.toLowerCase()] = preferred;
      userMap[preferred.toLowerCase()] = preferred;
    });

    const users = {};
    scoresSnap.forEach((doc) => {
      const data = doc.data();
      const id = doc.id;
      users[id] = { ...data, docId: id };
    });

    // Convert to sorted array
    const leaderboard = Object.values(users).sort((a, b) => {
      if (b.points !== a.points) {
        return b.points - a.points;
      }
      if ((b.first || 0) !== (a.first || 0)) {
        return (b.first || 0) - (a.first || 0);
      }
      if ((b.second || 0) !== (a.second || 0)) {
        return (b.second || 0) - (a.second || 0);
      }
      if ((b.third || 0) !== (a.third || 0)) {
        return (b.third || 0) - (a.third || 0);
      }
      return 0;
    });

    const lines = leaderboard.slice(0, 10).map((entry, index) => {
      const rawName = entry.username || entry.docId || "Unknown";
      const displayName = userMap[rawName.toLowerCase()] || rawName;
      return `*#${index + 1}*${spacer}**${displayName}** · \`${
        entry.points
      } pts\`\n${spacer}${spacer}🥇${entry.first || 0} 🥈${entry.second || 0} 🥉${entry.third || 0}`;
    });

    // Fetch season winners
    const winnersSnap = await db.collection("winners").get();
    const winCounts = {};

    winnersSnap.forEach((doc) => {
      const data = doc.data();
      const rawName = data.username || data.userId || "Unknown";
      const displayName = userMap[rawName.toLowerCase()] || rawName;

      if (!winCounts[displayName]) {
        winCounts[displayName] = { username: displayName, wins: 0 };
      }

      winCounts[displayName].wins += 1;
    });

    // Format winner summary
    let winnerSection = "";
    const sortedWinners = Object.values(winCounts).sort(
      (a, b) => b.wins - a.wins
    );

    const legacyEmoji = "<a:legacy:1356026196684574801>";

    if (sortedWinners.length > 0) {
      winnerSection =
        "**🏅 Season Winners**\n" +
        sortedWinners
          .map((w) => {
            const isLegacy = w.username.toLowerCase() === "jiibe";
            const flair = isLegacy ? `${spacer}${legacyEmoji}` : "";

            return `- ${w.username} – 🏆 ${w.wins}${flair}`;
          })
          .join("\n");
    }

    // Divider for clean split
    const divider = "\n\n––––––––––––––––––––––––\n\n";

    const embed = new EmbedBuilder()
      .setTitle("🏆 All-Time Leaderboard")
      .setColor(0x5865f2)
      .setThumbnail("https://i.imgur.com/STR5Ww3.png")
      .setDescription(lines.join("\n\n") + divider + winnerSection);

    await interaction.editReply({ embeds: [embed] });
  },
};
