const { SlashCommandBuilder } = require('discord.js');
const { db } = require('../utils/firebase');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('linkhltv')
    .setDescription('Link an HLTV fantasy name to a Discord user or manual name')
    .addStringOption(option =>
      option.setName('hltv')
        .setDescription('The HLTV fantasy username')
        .setRequired(true)
    )
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The Discord user to link to')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('manual')
        .setDescription('Manual name to link (used for name-only entries)')
        .setRequired(false)
    ),

  async execute(interaction, db) {
    const hltvUsername = interaction.options.getString('hltv').toLowerCase().replace(/\s+/g, '_');
    const discordUser = interaction.options.getUser('user');
    const manualName = interaction.options.getString('manual');

    if (!discordUser && !manualName) {
      return await interaction.reply({ content: '❌ Provide either a Discord user or manual name.', ephemeral: true });
    }

    const data = discordUser
      ? {
          discordId: discordUser.id,
          discordTag: discordUser.tag
        }
      : {
          manualName
        };

    await db.collection('linkedUsers').doc(hltvUsername).set(data);

    await interaction.reply({
      content: `✅ Linked HLTV username \`${hltvUsername}\` to ${discordUser ? `Discord user ${discordUser.tag}` : `manual name "${manualName}"`}`,
      ephemeral: true
    });
  }
};
