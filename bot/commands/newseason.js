require('dotenv').config();
const { SlashCommandBuilder } = require('discord.js');
const { Timestamp, FieldValue } = require('firebase-admin/firestore');

const ALLOWED_USERS = process.env.ALLOWED_USERS.split(',');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('newseason')
    .setDescription('Create a new season and set it active')
    .addStringOption(option =>
      option.setName('name')
        .setDescription('The name of the new season (e.g. SPRING2025)')
        .setRequired(true)
    ),

  async execute(interaction, db) {
    const userId = interaction.user.id;
    if (!ALLOWED_USERS.includes(userId)) {
      return await interaction.reply({ content: '❌ You are not authorized to use this command.', ephemeral: true });
    }

    const seasonName = interaction.options.getString('name');
    const seasonRef = db.collection('seasons').doc(seasonName);
    const existing = await seasonRef.get();

    if (existing.exists) {
      return await interaction.reply({ content: `Season **${seasonName}** already exists.`, ephemeral: true });
    }

    // Create season doc
    await seasonRef.set({
      createdAt: Timestamp.now(),
      createdBy: userId,
      status: 'active', // optional metadata
    });

    // 🔧 Update settings/config so the bot knows there’s an active season
    await db.collection('settings').doc('config').set({
      currentSeason: seasonName,
      active: true,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    await interaction.reply(`✅ Season **${seasonName}** created and set as active`);
  }
};
