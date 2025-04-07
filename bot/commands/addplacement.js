require('dotenv').config();
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const ALLOWED_USERS = process.env.ALLOWED_USERS.split(',');

const pointsMap = { 1: 3, 2: 2, 3: 1 };
const colorMap = {
  1: 0xFFD700,
  2: 0xC0C0C0,
  3: 0xCD7F32
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('addplacement')
    .setDescription('Adds points to a user based on placement (1st = 3, 2nd = 2, 3rd = 1)')
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
    const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };

    if (![1, 2, 3].includes(placement)) {
      return await interaction.reply({ content: 'Placement must be 1, 2, or 3.', ephemeral: true });
    }

    if (!discordUser && !manualName) {
      return await interaction.reply({ content: 'Provide either user or name.', ephemeral: true });
    }

    const points = pointsMap[placement];
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
      third: placement === 3 ? (current.third || 0) + 1 : (current.third || 0)
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
      .setTitle(`${medals[placement]} Added ${ordinal(placement)} placement to ${username}`)
      .setColor(colorMap[placement])
      .setThumbnail("https://i.imgur.com/STR5Ww3.png")
      .setDescription(
        `Season ${season} points: **${newPoints}**\n\n` +
        `Total points: **${totalPoints}**\n\n`
      );

    await interaction.reply({ embeds: [embed] });
  }
};

function ordinal(n) {
  return n === 1 ? '1st' : n === 2 ? '2nd' : '3rd';
}