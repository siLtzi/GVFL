require('dotenv').config();
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { ordinal, COLOR_MAP, MEDAL_MAP } = require('../utils/helpers');
const { removeFromStandings, POINTS_MAP } = require('../utils/standingsManager');

const ALLOWED_USERS = process.env.ALLOWED_USERS.split(',');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('removepoints')
    .setDescription('Remove placement points from a user')
    .addStringOption(option =>
      option.setName('event')
        .setDescription('Event name to remove from')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('placement')
        .setDescription('1-6 placement')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('name')
        .setDescription('Username (must match exactly as stored)')
        .setRequired(true)),

  async execute(interaction, db) {
    const userIdExecuting = interaction.user.id;

    if (!ALLOWED_USERS.includes(userIdExecuting)) {
      return await interaction.reply({
        content: '❌ You are not authorized to use this command.',
        ephemeral: true,
      });
    }

    const eventName = interaction.options.getString('event');
    const placement = interaction.options.getInteger('placement');
    const username = interaction.options.getString('name');

    if (placement < 1 || placement > 6) {
      return await interaction.reply({ content: 'Placement must be between 1 and 6.', ephemeral: true });
    }

    // Get current season
    const settingsRef = db.collection('settings').doc('config');
    const settingsDoc = await settingsRef.get();
    if (!settingsDoc.exists) {
      return await interaction.reply({ content: 'No active season.', ephemeral: true });
    }
    const season = settingsDoc.data().currentSeason;

    const points = POINTS_MAP[placement] || 0;

    try {
      // Remove from standings (SOURCE OF TRUTH)
      await removeFromStandings(db, {
        eventName,
        username,
        placement,
        season,
        removedBy: interaction.user.username,
      });

      const embed = new EmbedBuilder()
        .setTitle(`❌ Removed ${ordinal(placement)} placement from ${username}`)
        .setColor(0xff6b6b)
        .setThumbnail("https://i.imgur.com/STR5Ww3.png")
        .setDescription(
          `**-${points} points**\n\n` +
          `Event: ${eventName}\n` +
          `Season: ${season}`
        );

      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error("❌ Failed to remove placement:", err);
      await interaction.reply({
        content: `❌ Failed to remove placement: ${err.message}`,
        ephemeral: true,
      });
    }
  }
};
