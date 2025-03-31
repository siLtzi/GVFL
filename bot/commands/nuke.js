const { SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

const ADMIN_USER_ID = process.env.ADMIN_ID;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nuke')
    .setDescription('⚠️ Deletes all scores, winners, and logs from the database.')
    .addBooleanOption(option =>
      option.setName('confirm')
        .setDescription('You must confirm true to execute this.')
        .setRequired(true)
    ),

  async execute(interaction, db) {
    const confirm = interaction.options.getBoolean('confirm');
    const userId = interaction.user.id;

    if (userId !== ADMIN_USER_ID) {
      return await interaction.reply({
        content: '❌ You are not authorized to run this command.',
        ephemeral: true
      });
    }

    if (!confirm) {
      return await interaction.reply({
        content: '❌ Confirmation not given. Pass `confirm: true` to proceed.',
        ephemeral: true
      });
    }

    const deleteCollection = async (path) => {
      const snap = await db.collection(path).get();
      const batch = db.batch();
      snap.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    };

    const seasonsSnap = await db.collection('seasons').get();
    for (const seasonDoc of seasonsSnap.docs) {
      const seasonId = seasonDoc.id;
      const scoresSnap = await db.collection(`seasons/${seasonId}/scores`).get();
      const scoreBatch = db.batch();
      scoresSnap.forEach(doc => scoreBatch.delete(doc.ref));
      await scoreBatch.commit();
      await db.collection('seasons').doc(seasonId).delete();
    }

    await deleteCollection('winners');
    await deleteCollection('logs');

    await interaction.reply('💣 All GVFL data has been nuked. You’re now running a clean slate.');
  }
};
