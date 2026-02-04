require('dotenv').config();
const { SlashCommandBuilder } = require('discord.js');

const ALLOWED_USERS = process.env.ALLOWED_USERS.split(',');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('selectseason')
    .setDescription('Select the active season for all point commands')
    .addStringOption(option =>
      option.setName('season')
        .setDescription('The name of the season to select (e.g. spring2025)')
        .setRequired(true)),

  async execute(interaction, db) {
    await interaction.deferReply({ ephemeral: true });
    
    const userIdExecuting = interaction.user.id;

    if (!ALLOWED_USERS.includes(userIdExecuting)) {
      return await interaction.editReply({
        content: '❌ You are not authorized to use this command.'
      });
    }

    const seasonName = interaction.options.getString('season');

    const settingsRef = db.collection('settings').doc('config');
    await settingsRef.set({ currentSeason: seasonName });

    await interaction.editReply(`Active season set to **${seasonName}**`);

    // Optional: Log the action
    await db.collection('logs').add({
      type: 'selectseason',
      season: seasonName,
      by: interaction.user.username,
      timestamp: new Date()
    });
  }
};
