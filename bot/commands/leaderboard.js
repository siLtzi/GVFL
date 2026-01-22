const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Show total points across all seasons"),

  async execute(interaction, db) {
    const scoresSnap = await db.collectionGroup("scores").get();

    if (scoresSnap.empty) {
      return await interaction.reply("No scores found across any season");
    }

    // Group by userId
    const users = {};
    const spacer = "\u2003"; // EM space

    scoresSnap.forEach((doc) => {
      const data = doc.data();
      const id = data.userId || "unknown";
      const name = data.username || "Unknown";
      if (!users[id]) {
        users[id] = {
          username: name,
          points: 0,
          first: 0,
          second: 0,
          third: 0,
          fourth: 0,
          fifth: 0,
          sixth: 0,
        };
      }

      users[id].points += data.points || 0;
      users[id].first += data.first || 0;
      users[id].second += data.second || 0;
      users[id].third += data.third || 0;
      users[id].fourth += data.fourth || 0;
      users[id].fifth += data.fifth || 0;
      users[id].sixth += data.sixth || 0;
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
      if ((b.fourth || 0) !== (a.fourth || 0)) {
        return (b.fourth || 0) - (a.fourth || 0);
      }
      if ((b.fifth || 0) !== (a.fifth || 0)) {
        return (b.fifth || 0) - (a.fifth || 0);
      }
      if ((b.sixth || 0) !== (a.sixth || 0)) {
        return (b.sixth || 0) - (a.sixth || 0);
      }
      return 0;
    });

    const lines = leaderboard.slice(0, 10).map((entry, index) => {
      return `*#${index + 1}*${spacer}**${entry.username}** · \`${
        entry.points
      } pts\`\n${spacer}${spacer}🥇${entry.first} 🥈${entry.second} 🥉${
        entry.third
      } 4️⃣${entry.fourth || 0} 5️⃣${entry.fifth || 0} 6️⃣${entry.sixth || 0}`;
    });

    // Fetch season winners
    const winnersSnap = await db.collection("winners").get();
    const winCounts = {};

    winnersSnap.forEach((doc) => {
      const data = doc.data();
      const id = data.userId || "unknown";
      const name = data.username || "Unknown";

      if (!winCounts[id]) {
        winCounts[id] = { username: name, wins: 0 };
      }

      winCounts[id].wins += 1;
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

    await interaction.reply({ embeds: [embed] });
  },
};
