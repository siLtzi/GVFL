require('dotenv').config();
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { ordinal } = require('../utils/helpers');
const { addToStandings, removeFromStandings, POINTS_MAP } = require('../utils/standingsManager');

const ALLOWED_USERS = process.env.ALLOWED_USERS.split(',');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('undo')
    .setDescription('Undo the most recent add/remove placement action'),

  async execute(interaction, db) {
    await interaction.deferReply();
    
    const userIdExecuting = interaction.user.id;

    if (!ALLOWED_USERS.includes(userIdExecuting)) {
      return await interaction.editReply({
        content: '❌ You are not authorized to use this command.'
      });
    }

    const logsSnap = await db.collection('logs')
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();

    if (logsSnap.empty) {
      return await interaction.editReply({ content: 'No actions to undo.' });
    }

    const lastAction = logsSnap.docs[0];
    const data = lastAction.data();

    console.log("[UNDO] Last action:", data);

    if (!data.eventName || !data.username || !data.placement) {
      return await interaction.editReply({
        content: '❌ Cannot undo: missing event, username, or placement in log.'
      });
    }

    const points = POINTS_MAP[data.placement] || 0;

    try {
      if (data.action === 'add') {
        // Undo an add = remove the placement
        await removeFromStandings(db, {
          eventName: data.eventName,
          username: data.username,
          placement: data.placement,
          season: data.season,
          removedBy: `undo by ${interaction.user.username}`,
        });
      } else if (data.action === 'remove') {
        // Undo a remove = add the placement back
        await addToStandings(db, {
          eventName: data.eventName,
          username: data.username,
          placement: data.placement,
          teamName: "",
          totalPoints: 0,
          season: data.season,
          addedBy: `undo by ${interaction.user.username}`,
        });
      } else {
        return await interaction.editReply({
          content: `❌ Unknown action type: ${data.action}`
        });
      }

      // Delete the original log entry
      await lastAction.ref.delete();

      const embed = new EmbedBuilder()
        .setTitle(`↩️ Undid: ${data.action === 'add' ? 'Added' : 'Removed'} ${ordinal(data.placement)} for ${data.username}`)
        .setColor(0xffcc00)
        .setDescription(
          `**${data.action === 'add' ? '-' : '+'}${points} points**\n\n` +
          `Event: ${data.eventName}\n` +
          `Season: ${data.season}`
        );

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error("❌ Failed to undo:", err);
      await interaction.editReply({
        content: `❌ Failed to undo: ${err.message}`
      });
    }
  }
};
