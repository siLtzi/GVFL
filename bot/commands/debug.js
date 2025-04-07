const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Timestamp } = require('firebase-admin/firestore');
require('dotenv').config();

const ALLOWED_USERS = process.env.ALLOWED_USERS.split(',');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('debug')
    .setDescription('🔍 Admin-only: Show Firestore structure and stats'),

  async execute(interaction, db) {
    const userId = interaction.user.id;

    if (!ALLOWED_USERS.includes(userId)) {
      return await interaction.reply({
        content: '❌ You are not authorized to run this command.',
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const embed = new EmbedBuilder()
      .setTitle('🛠️ Firestore Debug Report')
      .setColor(0x3498db)
      .setThumbnail("https://i.imgur.com/STR5Ww3.png")
      .setTimestamp(Timestamp.now().toDate());

    try {
      // 1. Seasons and scores
      const seasonsSnap = await db.collection('seasons').get();
      const totalSeasons = seasonsSnap.size;
      let totalScores = 0;

      for (const season of seasonsSnap.docs) {
        const scoresSnap = await db.collection(`seasons/${season.id}/scores`).get();
        totalScores += scoresSnap.size;
      }

      // 2. Winners
      const winnersSnap = await db.collection('winners').get();
      const totalWinners = winnersSnap.size;

      // 3. Logs
      const logsSnap = await db.collection('logs').get();
      const totalLogs = logsSnap.size;

      // 4. Fantasy Links
      const fantasySnap = await db.collection('fantasyLinks').get();
      const totalFantasy = fantasySnap.size;

      embed.setDescription([
        `📅 **Seasons**: ${totalSeasons}`,
        ``,
        `📊 **Total Scores**: ${totalScores}`,
        ``,
        `🏆 **Winners**: ${totalWinners}`,
        ``,
        `📝 **Logs**: ${totalLogs}`,
        ``,
        `🧩 **Fantasy Links**: ${totalFantasy}`,
      ].join('\n'));
      
      

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('[DEBUG ERROR]', err);
      await interaction.editReply({
        content: '❌ Something went wrong while running debug.',
      });
    }
  },
};
