require('dotenv').config();
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const ALLOWED_USERS = process.env.ALLOWED_USERS.split(',');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('user')
    .setDescription('Manage GVFL users')
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List all registered users'))
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add a new user')
        .addStringOption(opt =>
          opt.setName('preferred')
            .setDescription('Preferred display name (used everywhere)')
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName('hltv')
            .setDescription('HLTV username (for matching fetched data)')
            .setRequired(true))
        .addUserOption(opt =>
          opt.setName('discord')
            .setDescription('Discord user (optional)')
            .setRequired(false)))
    .addSubcommand(sub =>
      sub.setName('edit')
        .setDescription('Edit an existing user')
        .addStringOption(opt =>
          opt.setName('preferred')
            .setDescription('Current preferred name (doc ID)')
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName('newhltv')
            .setDescription('New HLTV username')
            .setRequired(false))
        .addUserOption(opt =>
          opt.setName('newdiscord')
            .setDescription('New Discord user')
            .setRequired(false)))
    .addSubcommand(sub =>
      sub.setName('delete')
        .setDescription('Delete a user')
        .addStringOption(opt =>
          opt.setName('preferred')
            .setDescription('Preferred name of user to delete')
            .setRequired(true))),

  async execute(interaction, db) {
    const userId = interaction.user.id;

    if (!ALLOWED_USERS.includes(userId)) {
      return await interaction.reply({
        content: '❌ You are not authorized to use this command.',
        ephemeral: true,
      });
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'list') {
      const usersSnap = await db.collection('users').get();

      if (usersSnap.empty) {
        return await interaction.reply('📭 No users registered.');
      }

      const lines = usersSnap.docs.map(doc => {
        const data = doc.data();
        const discord = data.discordId ? ` → <@${data.discordId}>` : '';
        return `• **${data.preferredName}** (HLTV: \`${data.hltvName}\`)${discord}`;
      });

      const embed = new EmbedBuilder()
        .setTitle('👥 Registered Users')
        .setColor(0x5865f2)
        .setDescription(lines.join('\n'));

      return await interaction.reply({ embeds: [embed] });
    }

    if (subcommand === 'add') {
      const preferred = interaction.options.getString('preferred');
      const hltv = interaction.options.getString('hltv');
      const discordUser = interaction.options.getUser('discord');

      const existingDoc = await db.collection('users').doc(preferred).get();
      if (existingDoc.exists) {
        return await interaction.reply({
          content: `❌ User **${preferred}** already exists.`,
          ephemeral: true
        });
      }

      await db.collection('users').doc(preferred).set({
        preferredName: preferred,
        hltvName: hltv,
        discordName: discordUser?.username || null,
        discordId: discordUser?.id || null,
        createdAt: new Date(),
      });

      const discordInfo = discordUser ? ` Discord: ${discordUser.username} (${discordUser.id})` : '';
      return await interaction.reply(`✅ Added user **${preferred}** (HLTV: \`${hltv}\`)${discordInfo}`);
    }

    if (subcommand === 'edit') {
      const preferred = interaction.options.getString('preferred');
      const newHltv = interaction.options.getString('newhltv');
      const newDiscordUser = interaction.options.getUser('newdiscord');

      const userRef = db.collection('users').doc(preferred);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        return await interaction.reply({
          content: `❌ User **${preferred}** not found.`,
          ephemeral: true
        });
      }

      const updates = {};
      if (newHltv) updates.hltvName = newHltv;
      if (newDiscordUser) {
        updates.discordName = newDiscordUser.username;
        updates.discordId = newDiscordUser.id;
      }

      if (Object.keys(updates).length === 0) {
        return await interaction.reply({
          content: '❌ No updates provided.',
          ephemeral: true
        });
      }

      await userRef.update(updates);

      return await interaction.reply(`✅ Updated user **${preferred}**: ${JSON.stringify(updates)}`);
    }

    if (subcommand === 'delete') {
      const preferred = interaction.options.getString('preferred');

      const userRef = db.collection('users').doc(preferred);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        return await interaction.reply({
          content: `❌ User **${preferred}** not found.`,
          ephemeral: true
        });
      }

      await userRef.delete();

      return await interaction.reply(`🗑️ Deleted user **${preferred}**`);
    }
  }
};
