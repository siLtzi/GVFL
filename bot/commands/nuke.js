const { SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

const ADMIN_USER_ID = process.env.ADMIN_ID;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nuke')
    .setDescription('⚠️ Deletes all scores, seasons, fantasyLinks, winners, and logs from the database.')
    .addBooleanOption(option =>
      option.setName('confirm')
        .setDescription('You must confirm true to execute this.')
        .setRequired(true)
    ),

  async execute(interaction, db) {
    await interaction.deferReply({ ephemeral: true });
    
    const confirm = interaction.options.getBoolean('confirm');
    const userId = interaction.user.id;

    if (userId !== ADMIN_USER_ID) {
      return await interaction.editReply({
        content: '❌ You are not authorized to run this command.'
      });
    }

    if (!confirm) {
      return await interaction.editReply({
        content: '❌ Confirmation not given. Pass `confirm: true` to proceed.'
      });
    }

    console.log(`[NUKE] User ID: ${userId}, Confirm: ${confirm}`);

    // Helper to delete all docs in a collection
    const deleteCollection = async (path) => {
      console.log(`[NUKE] Deleting collection: ${path}`);
      const snap = await db.collection(path).get();
      if (snap.empty) {
        console.log(`[NUKE] No documents found in ${path}`);
        return;
      }
      const batch = db.batch();
      snap.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    };

    // Delete scores from all seasons
    const seasonsSnap = await db.collection('seasons').get();
    console.log(`[NUKE] Found ${seasonsSnap.size} season(s)`);
    for (const seasonDoc of seasonsSnap.docs) {
      const seasonId = seasonDoc.id;
      const scoresSnap = await db.collection(`seasons/${seasonId}/scores`).get();
      const scoreBatch = db.batch();
      scoresSnap.forEach(doc => scoreBatch.delete(doc.ref));
      await scoreBatch.commit();
      await db.collection('seasons').doc(seasonId).delete();
    }

    // Delete other top-level collections
    await deleteCollection('winners');
    await deleteCollection('logs');
    await deleteCollection('fantasyLinks');

    console.log("[NUKE] Done!");
    await interaction.editReply('💣 All GVFL data has been nuked, including fantasy links.');
  }
};
