require('dotenv').config();
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { ordinal, COLOR_MAP, MEDAL_MAP } = require('../utils/helpers');
const { addToStandings, getManualEventName, POINTS_MAP } = require('../utils/standingsManager');

const ALLOWED_USERS = process.env.ALLOWED_USERS.split(',');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('addplacement')
    .setDescription('Adds points to a user based on placement (1st=10, 2nd=6, 3rd=4, 4th=3, 5th=2, 6th=1)')
    .addIntegerOption(option =>
      option.setName('placement')
        .setDescription('1-6 placement (7th+ = 0 pts)')
        .setRequired(true))
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Discord user')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('name')
        .setDescription('Manual name (use canonical DB name like DeKksu, tapinho, Hexsa)')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('event')
        .setDescription('Event name (optional - defaults to "Manual Adjustments")')
        .setRequired(false)),

  async execute(interaction, db) {
    await interaction.deferReply();
    
    const userIdExecuting = interaction.user.id;

    if (!ALLOWED_USERS.includes(userIdExecuting)) {
      return await interaction.editReply({
        content: '❌ You are not authorized to use this command.'
      });
    }

    const discordUser = interaction.options.getUser('user');
    const manualName = interaction.options.getString('name');
    const placement = interaction.options.getInteger('placement');
    const customEvent = interaction.options.getString('event');

    if (placement < 1 || placement > 6) {
      return await interaction.editReply({ content: 'Placement must be between 1 and 6.' });
    }

    if (!discordUser && !manualName) {
      return await interaction.editReply({ content: 'Provide either user or name.' });
    }

    // Get the canonical username - this should match your DB names (DeKksu, tapinho, etc.)
    const username = manualName || discordUser.username;
    const points = POINTS_MAP[placement] || 0;

    // Get current season
    const settingsRef = db.collection('settings').doc('config');
    const settingsDoc = await settingsRef.get();
    if (!settingsDoc.exists) {
      return await interaction.editReply({ content: 'No active season.' });
    }
    const season = settingsDoc.data().currentSeason;

    // Determine event name
    const eventName = customEvent || getManualEventName(season);

    try {
      const result = await addToStandings(db, {
        eventName,
        username,
        placement,
        teamName: "",
        totalPoints: 0,
        season,
        addedBy: interaction.user.username,
      });

      const embed = new EmbedBuilder()
        .setTitle(`${MEDAL_MAP[placement]} Added ${ordinal(placement)} placement to ${result.username}`)
        .setColor(COLOR_MAP[placement])
        .setThumbnail("https://i.imgur.com/STR5Ww3.png")
        .setDescription(
          `**+${points} points**\n\n` +
          `Event: ${eventName}\n` +
          `Season: ${season}`
        );

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error("❌ Failed to add placement:", err);
      await interaction.editReply({
        content: `❌ Failed to add placement: ${err.message}`
      });
    }
  }
};
