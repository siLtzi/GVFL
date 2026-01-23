const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("season")
    .setDescription("Show the leaderboard for the current season"),

  async execute(interaction, db) {
    const settingsRef = db.collection("settings").doc("config");
    const settingsSnap = await settingsRef.get();

    if (!settingsSnap.exists) {
      return await interaction.reply({
        content: "❌ No active season selected. Use /selectseason first",
        ephemeral: true,
      });
    }

    const season = settingsSnap.data().currentSeason;
    const spacer = "\u2003"; // EM space (wide space like tab)
    const scoresRef = db.collection(`seasons/${season}/scores`);
    const scoresSnap = await scoresRef.get();

    if (scoresSnap.empty) {
      return await interaction.reply(
        `No scores recorded yet for **${season}**`
      );
    }

    const sorted = scoresSnap.docs
      .map((doc) => doc.data())
      .sort((a, b) => {
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

    const leaderboardLines = sorted.map((entry, index) => {
      const gold = entry.first || 0;
      const silver = entry.second || 0;
      const bronze = entry.third || 0;
      const displayName = entry.username || entry.oddslink || entry.userId || "Unknown";

      return `*#${index + 1}*${spacer}**${displayName}** – \`${
        entry.points
      } pts\`\n${spacer}${spacer}🥇${gold} 🥈${silver} 🥉${bronze}`;
    });

    const embed = new EmbedBuilder()
      .setTitle(`${season.toUpperCase()} Leaderboard`)
      .setColor(0x2b2d31)
      .setThumbnail("https://i.imgur.com/STR5Ww3.png")
      .setDescription(leaderboardLines.slice(0, 10).join("\n\n"));

    await interaction.reply({ embeds: [embed] });
  },
};
