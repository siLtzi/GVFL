require('dotenv').config();
const { SlashCommandBuilder } = require('discord.js');
const { Timestamp } = require('firebase-admin/firestore');

// Pull IDs from the environment and split into an array
const ALLOWED_USERS = process.env.ALLOWED_USERS.split(',');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('newseason')
    .setDescription('Create a new season')
    .addStringOption(option =>
      option.setName('name')
        .setDescription('The name of the new season (e.g. spring2025)')
        .setRequired(true)),

  async execute(interaction, db) {
    await interaction.deferReply({ ephemeral: true });
    
    const userId = interaction.user.id;

    if (!ALLOWED_USERS.includes(userId)) {
      return await interaction.editReply({
        content: '❌ You are not authorized to use this command.'
      });
    }

    const seasonName = interaction.options.getString('name');
    const seasonRef = db.collection('seasons').doc(seasonName);
    const existing = await seasonRef.get();

    if (existing.exists) {
      return await interaction.editReply({
        content: `Season **${seasonName}** already exists.`
      });
    }

    await seasonRef.set({
      createdAt: Timestamp.now(),
      createdBy: userId,
    });

    await interaction.editReply(`✅ Season **${seasonName}** created`);
  }
};
