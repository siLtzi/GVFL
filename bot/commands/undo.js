require('dotenv').config();
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { ordinal, POINTS_MAP } = require('../utils/helpers');

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

    console.log("[UNDO] Raw log data:", data);

    // Check if the userId is valid
    if (!data.userId || typeof data.userId !== 'string') {
      console.error("[UNDO] Invalid userId in log entry:", data.userId);
      return await interaction.reply({
        content: '❌ Invalid log entry: missing userId.',
        ephemeral: true
      });
    }

    const delta = POINTS_MAP[data.placement] || 0;

    // Handle undoing score action
    const userRef = db.collection(`seasons/${data.season}/scores`).doc(data.userId);
    const userDoc = await userRef.get();
    const current = userDoc.exists ? userDoc.data() : {};

    const newPoints = data.type === 'add'
      ? Math.max((current.points || 0) - delta, 0)
      : (current.points || 0) + delta;

    const fieldMap = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth', 6: 'sixth' };
    const field = fieldMap[data.placement];
    const newFieldVal = field ? (data.type === 'add'
      ? Math.max((current[field] || 0) - 1, 0)
      : (current[field] || 0) + 1) : null;

    await userRef.set({
      ...current,
      points: newPoints,
      ...(field ? { [field]: newFieldVal } : {})
    });

    // Update All-Time Scores
    const allTimeRef = db.collection('allTimeScores').doc(data.userId);
    const allTimeDoc = await allTimeRef.get();
    const allTimeData = allTimeDoc.exists ? allTimeDoc.data() : {};

    const allTimeNewPoints = data.type === 'add'
      ? Math.max((allTimeData.points || 0) - delta, 0)
      : (allTimeData.points || 0) + delta;

    const allTimeNewFieldVal = field ? (data.type === 'add'
      ? Math.max((allTimeData[field] || 0) - 1, 0)
      : (allTimeData[field] || 0) + 1) : null;

    await allTimeRef.set({
      ...allTimeData,
      points: allTimeNewPoints,
      ...(field ? { [field]: allTimeNewFieldVal } : {}),
      lastUpdated: new Date()
    }, { merge: true });

    // Handle undoing fantasyLink action
    if (data.fantasyLink) {
      const fantasyLinkRef = db.collection('fantasyLinks').doc(data.fantasyLink);
      await fantasyLinkRef.delete();
      console.log("[UNDO] Deleted fantasyLink document:", data.fantasyLink);
    }

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
