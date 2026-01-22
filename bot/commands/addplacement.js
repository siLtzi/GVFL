require('dotenv').config();
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { ordinal, POINTS_MAP, COLOR_MAP, MEDAL_MAP } = require('../utils/helpers');

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
        .setDescription('Manual name')
        .setRequired(false)),

  async execute(interaction, db) {
    const userIdExecuting = interaction.user.id;

    if (!ALLOWED_USERS.includes(userIdExecuting)) {
      return await interaction.reply({
        content: '❌ You are not authorized to use this command.',
        ephemeral: true,
      });
    }

    const discordUser = interaction.options.getUser('user');
    const manualName = interaction.options.getString('name');
    const placement = interaction.options.getInteger('placement');

    if (placement < 1 || placement > 6) {
      return await interaction.reply({ content: 'Placement must be between 1 and 6 (7th+ awards 0 points).', ephemeral: true });
    }

    if (!discordUser && !manualName) {
      return await interaction.reply({ content: 'Provide either user or name.', ephemeral: true });
    }

    const points = POINTS_MAP[placement] || 0;
    const userId = discordUser ? discordUser.id : manualName.toLowerCase().replace(/\s+/g, '_');
    const username = discordUser ? discordUser.username : manualName;

    const settingsRef = db.collection('settings').doc('config');
    const settingsDoc = await settingsRef.get();
    if (!settingsDoc.exists) return await interaction.reply({ content: 'No active season.', ephemeral: true });
    const season = settingsDoc.data().currentSeason;

    const userRef = db.collection(`seasons/${season}/scores`).doc(userId);
    const userDoc = await userRef.get();
    const current = userDoc.exists ? userDoc.data() : {};

    const newPoints = (current.points || 0) + points;

    await userRef.set({
      userId,
      username,
      points: newPoints,
      first: placement === 1 ? (current.first || 0) + 1 : (current.first || 0),
      second: placement === 2 ? (current.second || 0) + 1 : (current.second || 0),
      third: placement === 3 ? (current.third || 0) + 1 : (current.third || 0),
      fourth: placement === 4 ? (current.fourth || 0) + 1 : (current.fourth || 0),
      fifth: placement === 5 ? (current.fifth || 0) + 1 : (current.fifth || 0),
      sixth: placement === 6 ? (current.sixth || 0) + 1 : (current.sixth || 0),
    });

    // Log for undo
    await db.collection('logs').add({
      userId,
      username,
      placement,
      type: 'add',
      season,
      by: interaction.user.username,
      timestamp: new Date()
    });

    // Get total points across seasons
    let totalPoints = 0;
    try {
      const allSeasons = await db.collectionGroup('scores').where('userId', '==', userId).get();
      allSeasons.forEach(doc => totalPoints += doc.data().points || 0);
    } catch {
      totalPoints = newPoints;
    }

    const embed = new EmbedBuilder()
      .setTitle(`${MEDAL_MAP[placement]} Added ${ordinal(placement)} placement to ${username}`)
      .setColor(COLOR_MAP[placement])
      .setThumbnail("https://i.imgur.com/STR5Ww3.png")
      .setDescription(
        `Season ${season} points: **${newPoints}**\n\n` +
        `Total points: **${totalPoints}**\n\n`
      );

    await interaction.reply({ embeds: [embed] });
  }
};