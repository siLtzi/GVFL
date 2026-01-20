require('dotenv').config();
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { ordinal, POINTS_MAP, COLOR_MAP, MEDAL_MAP } = require('../utils/helpers');

const ALLOWED_USERS = process.env.ALLOWED_USERS.split(',');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('removepoints')
    .setDescription('Remove placement points from a user (1st = -3, 2nd = -2, 3rd = -1)')
    .addIntegerOption(option =>
      option.setName('placement')
        .setDescription('1 = 🥇, 2 = 🥈, 3 = 🥉')
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

    if (![1, 2, 3].includes(placement)) {
      return await interaction.reply({ content: 'Placement must be 1, 2, or 3.', ephemeral: true });
    }

    if (!discordUser && !manualName) {
      return await interaction.reply({ content: 'Provide either user or name.', ephemeral: true });
    }

    const points = POINTS_MAP[placement];
    const userId = discordUser ? discordUser.id : manualName.toLowerCase().replace(/\s+/g, '_');
    const username = discordUser ? discordUser.username : manualName;

    const settingsRef = db.collection('settings').doc('config');
    const settingsDoc = await settingsRef.get();
    if (!settingsDoc.exists) return await interaction.reply({ content: 'No active season.', ephemeral: true });
    const season = settingsDoc.data().currentSeason;

    const userRef = db.collection(`seasons/${season}/scores`).doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return await interaction.reply({ content: `${username} has no points in this season.`, ephemeral: true });
    }

    const current = userDoc.data();
    const newPoints = Math.max((current.points || 0) - points, 0);

    await userRef.set({
      userId,
      username,
      points: newPoints,
      first: placement === 1 ? Math.max((current.first || 0) - 1, 0) : (current.first || 0),
      second: placement === 2 ? Math.max((current.second || 0) - 1, 0) : (current.second || 0),
      third: placement === 3 ? Math.max((current.third || 0) - 1, 0) : (current.third || 0)
    });

    // Log for undo
    await db.collection('logs').add({
      userId,
      username,
      placement,
      type: 'remove',
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
      .setTitle(`${MEDAL_MAP[placement]} Removed ${ordinal(placement)} placement from ${username}`)
      .setColor(COLOR_MAP[placement])
      .setThumbnail("https://i.imgur.com/STR5Ww3.png")
      .setDescription(
        `Total points: **${totalPoints}**\n\n` +
        `Season ${season} points: **${newPoints}**`
      );

    await interaction.reply({ embeds: [embed] });
  }
};
