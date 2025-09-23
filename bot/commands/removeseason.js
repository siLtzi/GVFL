require('dotenv').config();
const { SlashCommandBuilder } = require('discord.js');

const ALLOWED_USERS = process.env.ALLOWED_USERS.split(',');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('removeseason')
    .setDescription('⚠️ Permanently deletes a full season and all scores')
    .addStringOption(option =>
      option.setName('season')
        .setDescription('Season name to delete (e.g. SPRING2025)')
        .setRequired(true)),

  async execute(interaction, db) {
    const userIdExecuting = interaction.user.id;

    if (!ALLOWED_USERS.includes(userIdExecuting)) {
      return await interaction.reply({
        content: '❌ You are not authorized to use this command.',
        ephemeral: true,
      });
    }

    const season = interaction.options.getString('season').trim();

    const seasonRef = db.collection('seasons').doc(season);
    const scoresSnap = await seasonRef.collection('scores').get();

    if (scoresSnap.empty) {
      return await interaction.reply({
        content: `⚠️ Season **${season}** doesn't exist or has no scores`,
        ephemeral: true
      });
    }

    // Delete every score doc inside the season
    const batch = db.batch();
    scoresSnap.docs.forEach(doc => batch.delete(doc.ref));
    batch.delete(seasonRef); // optionally delete the season doc itself

    await batch.commit();

    await interaction.reply({
      content: `✅ Season **${season}** and all related scores have been deleted`,
      ephemeral: true
    });

    // Log deletion action
    await db.collection('logs').add({
      type: 'removeseason',
      season,
      by: interaction.user.username,
      timestamp: new Date()
    });
  }
};
