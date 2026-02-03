const { SlashCommandBuilder, MessageFlags } = require('discord.js');
require('dotenv').config();

const ALLOWED_USERS = process.env.ALLOWED_USERS.split(',');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('testwhatsapp')
    .setDescription('📲 Admin-only: Send a test message to WhatsApp')
    .addStringOption(option =>
      option
        .setName('message')
        .setDescription('Custom message to send (optional)')
        .setRequired(false)
    ),

  async execute(interaction, db) {
    // Defer IMMEDIATELY - Discord only gives 3 seconds
    // Wrap in try-catch to handle duplicate interactions (Discord retries)
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      }
    } catch (deferErr) {
      // Already deferred/replied - this is a retry, ignore
      console.warn('[testwhatsapp] Defer failed (likely retry):', deferErr.message);
      return;
    }

    const userId = interaction.user.id;

    if (!ALLOWED_USERS.includes(userId)) {
      return interaction.editReply({
        content: '❌ You are not authorized to run this command.',
      });
    }

    const customMessage = interaction.options.getString('message');
    const testMessage = customMessage || `🧪 Test message from Discord!\n\nSent by: ${interaction.user.tag}\nTime: ${new Date().toISOString()}`;

    try {
      const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

      const waPort = process.env.WA_PORT || 3001;
      const response = await fetch(`http://localhost:${waPort}/send-whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: testMessage }),
      });

      if (response.ok) {
        await interaction.editReply({
          content: `✅ Test message sent to WhatsApp!\n\n**Message:**\n\`\`\`${testMessage}\`\`\``,
        });
      } else {
        const errorText = await response.text();
        await interaction.editReply({
          content: `❌ Failed to send message: ${errorText}`,
        });
      }
    } catch (err) {
      console.error('[TESTWHATSAPP ERROR]', err);
      await interaction.editReply({
        content: `❌ Error connecting to WhatsApp middleware: ${err.message}\n\nMake sure the WhatsApp server is running.`,
      });
    }
  },
};
