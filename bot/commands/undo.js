require('dotenv').config();
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const ALLOWED_USERS = process.env.ALLOWED_USERS.split(',');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('undo')
    .setDescription('Undo the most recent add/remove placement action'),

  async execute(interaction, db) {
    const userIdExecuting = interaction.user.id;

    if (!ALLOWED_USERS.includes(userIdExecuting)) {
      return await interaction.reply({
        content: '❌ You are not authorized to use this command.',
        ephemeral: true,
      });
    }

    const logsSnap = await db.collection('logs')
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();

    if (logsSnap.empty) {
      return await interaction.reply({ content: 'No actions to undo.', ephemeral: true });
    }

    const lastAction = logsSnap.docs[0];
    const data = lastAction.data();

    const userRef = db.collection(`seasons/${data.season}/scores`).doc(data.userId);
    const userDoc = await userRef.get();
    const current = userDoc.exists ? userDoc.data() : {};

    const pointsMap = { 1: 3, 2: 2, 3: 1 };
    const delta = pointsMap[data.placement];

    // Reverse logic
    const newPoints = data.type === 'add'
      ? Math.max((current.points || 0) - delta, 0)
      : (current.points || 0) + delta;

    const field = data.placement === 1 ? 'first' : data.placement === 2 ? 'second' : 'third';
    const newFieldVal = data.type === 'add'
      ? Math.max((current[field] || 0) - 1, 0)
      : (current[field] || 0) + 1;

    await userRef.set({
      ...current,
      points: newPoints,
      [field]: newFieldVal
    });

    // Delete the log entry
    await db.collection('logs').doc(lastAction.id).delete();

    const actionEmoji = data.type === 'add' ? '↩️ Removed' : '🔁 Re-added';

    const embed = new EmbedBuilder()
      .setTitle(`${actionEmoji} ${ordinal(data.placement)} placement for ${data.username}`)
      .setDescription(
        `Season: **${data.season}**\n` +
        `By: **${data.by}**\n` +
        `Points after undo: **${newPoints}**`
      )
      .setColor(data.type === 'add' ? 0xff5555 : 0x55ff55);

    await interaction.reply({ embeds: [embed] });

    // Optional: Log undo action
    await db.collection('logs').add({
      type: 'undo',
      originalAction: data,
      undoneBy: interaction.user.username,
      timestamp: new Date()
    });
  }
};

function ordinal(n) {
  return n === 1 ? '1st' : n === 2 ? '2nd' : '3rd';
}
